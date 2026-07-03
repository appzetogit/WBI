const mongoose = require('mongoose');
const B2BInvoice = require('../../models/B2BInvoice');
const B2BCompany = require('../../models/B2BCompany');
const B2BJob = require('../../models/B2BJob');
const B2BDeductionRule = require('../../models/B2BDeductionRule');
const { generateAndUploadInvoicePdf } = require('../../utils/invoicePdfGenerator');
const axios = require('axios');

/**
 * Helper to dynamically generate the next sequential unique invoice number: INV-YYYY-00001
 */
const getNextInvoiceNumber = async (year) => {
  const lastInvoice = await B2BInvoice.findOne({
    invoiceNumber: new RegExp(`^INV-${year}-`),
  }).sort({ createdAt: -1 });

  let sequence = 1;
  if (lastInvoice && lastInvoice.invoiceNumber) {
    const parts = lastInvoice.invoiceNumber.split('-');
    if (parts.length === 3) {
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }
  }

  const paddedSeq = String(sequence).padStart(5, '0');
  return `INV-${year}-${paddedSeq}`;
};

/**
 * GET /api/admin/b2b/invoices
 * List B2B invoices across all companies with filters (admin view)
 */
const getB2BInvoicesAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', companyId = '' } = req.query;

    const query = {};

    if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
      query.companyId = new mongoose.Types.ObjectId(companyId);
    }

    if (search.trim()) {
      query.invoiceNumber = { $regex: search.trim(), $options: 'i' };
    }

    if (status.trim()) {
      if (status.toLowerCase() === 'paid') {
        query.status = { $in: ['paid', 'Settled'] };
      } else if (status.toLowerCase() === 'pending') {
        query.status = { $in: ['pending', 'generated'] };
      } else {
        query.status = status;
      }
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skipNum = (pageNum - 1) * limitNum;

    const invoices = await B2BInvoice.find(query)
      .populate('companyId', 'companyName email phone')
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum)
      .lean();

    const total = await B2BInvoice.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[Admin Invoice Controller] Error fetching invoices:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch B2B invoices'
    });
  }
};

/**
 * GET /api/admin/b2b/invoices/:invoiceId
 * Get details of a single B2B invoice (admin view)
 */
const getB2BInvoiceByIdAdmin = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID format'
      });
    }

    const invoice = await B2BInvoice.findById(invoiceId)
      .populate('companyId', 'companyName email phone walletBalance')
      .lean();

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('[Admin Invoice Controller] Error fetching invoice details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch B2B invoice details'
    });
  }
};

/**
 * POST /api/admin/b2b/invoices/generate-monthly
 * Automatically generate a consolidated invoice for a B2B company for a specific billing period
 */
const generateMonthlyInvoice = async (req, res) => {
  try {
    const { companyId, month, year } = req.body;

    if (!companyId || month === undefined || !year) {
      return res.status(400).json({
        success: false,
        message: 'companyId, month (0-11), and year are required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid companyId ID format'
      });
    }

    const company = await B2BCompany.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'B2B Company not found'
      });
    }

    // Set billing period boundaries
    const billingPeriodStart = new Date(year, month, 1, 0, 0, 0, 0);
    const billingPeriodEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    // Find all completed B2B jobs for this company completed within the billing period where invoiceId is null
    const jobs = await B2BJob.find({
      companyId: company._id,
      status: 'completed',
      completedAt: { $gte: billingPeriodStart, $lte: billingPeriodEnd },
      invoiceId: null
    });

    if (jobs.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No completed B2B jobs found for this billing period that have not yet been invoiced.'
      });
    }

    // Fetch active deduction rule for calculation
    let rule = await B2BDeductionRule.findOne({ companyId: company._id, isActive: true });
    if (!rule) {
      rule = { perJobCharge: 12, gstPercent: 18 };
    }

    const totalJobs = jobs.length;
    const perJobCharge = rule.perJobCharge;
    const platformFee = 0;
    const subtotal = totalJobs * perJobCharge;
    const gstPercent = rule.gstPercent;
    const gstAmount = parseFloat((subtotal * (gstPercent / 100)).toFixed(2));
    const totalAmount = parseFloat((subtotal + gstAmount).toFixed(2));

    // Determine initial payment status based on job wallet deductions
    const allDeducted = jobs.every(job => job.paymentStatus === 'deducted');
    const invoiceNumber = await getNextInvoiceNumber(year);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 15); // Net-15 payment terms

    const companySnapshot = {
      companyName: company.companyName,
      gstNumber: company.gstNumber,
      billingAddress: company.billingAddress || company.companyAddress,
      email: company.email,
      phone: company.phone
    };

    let status = 'pending';
    let paymentStatus = 'unpaid';
    let paidAmount = 0;
    let paymentDate = null;
    let paymentMethod = null;
    let transactionId = null;

    if (allDeducted) {
      status = 'paid';
      paymentStatus = 'paid';
      paidAmount = totalAmount;
      paymentDate = new Date();
      paymentMethod = 'wallet';
      transactionId = `TXN-INV-${Date.now()}`;
    }

    // Format billingPeriod text for compatibility
    const startStr = billingPeriodStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    // Create the invoice record
    const invoice = await B2BInvoice.create({
      companyId: company._id,
      invoiceNumber,
      billingPeriod: startStr,
      billingPeriodStart,
      billingPeriodEnd,
      invoiceDate: new Date(),
      dueDate,
      totalJobs,
      completedJobIds: jobs.map(j => j._id),
      perJobCharge,
      platformFee,
      subtotal,
      gstPercent,
      gstAmount,
      totalAmount,
      paidAmount,
      status,
      paymentStatus,
      paymentDate,
      paymentMethod,
      transactionId,
      companySnapshot
    });

    // Link B2B Jobs to the generated consolidated invoice
    await B2BJob.updateMany(
      { _id: { $in: jobs.map(j => j._id) } },
      { $set: { invoiceId: invoice._id } }
    );

    // Generate PDF using pdfkit and upload to Cloudinary
    const pdfUrl = await generateAndUploadInvoicePdf(invoice);
    invoice.invoicePdfUrl = pdfUrl;
    invoice.fileUrl = pdfUrl;
    await invoice.save();

    return res.status(201).json({
      success: true,
      message: 'Monthly invoice generated successfully',
      data: invoice
    });
  } catch (error) {
    console.error('[Admin Invoice Controller] Error generating monthly invoice:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate monthly invoice'
    });
  }
};

/**
 * PATCH /api/admin/b2b/invoices/:invoiceId/status
 * Admin updates the payment or billing status of an invoice
 */
const updateB2BInvoiceStatus = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { status, paymentStatus, transactionId, paymentMethod, paymentDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID format'
      });
    }

    const invoice = await B2BInvoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (status) invoice.status = status;
    if (paymentStatus) {
      invoice.paymentStatus = paymentStatus;
      if (paymentStatus === 'paid') {
        invoice.paidAmount = invoice.totalAmount;
        invoice.status = 'paid';
        invoice.paymentDate = paymentDate || new Date();
        invoice.paymentMethod = paymentMethod || 'bank_transfer';
        invoice.transactionId = transactionId || `TXN-MAN-${Date.now()}`;
      } else if (paymentStatus === 'unpaid') {
        invoice.paidAmount = 0;
        invoice.status = 'pending';
      }
    }

    await invoice.save();

    // Re-generate the PDF invoice to sync status updates
    const pdfUrl = await generateAndUploadInvoicePdf(invoice);
    invoice.invoicePdfUrl = pdfUrl;
    invoice.fileUrl = pdfUrl;
    await invoice.save();

    return res.status(200).json({
      success: true,
      message: 'Invoice status updated successfully',
      data: invoice
    });
  } catch (error) {
    console.error('[Admin Invoice Controller] Error updating invoice status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update invoice status'
    });
  }
};

/**
 * GET /api/admin/b2b/invoices/:invoiceId/download
 * Streaming secure PDF download for Admin bypass
 */
const downloadB2BInvoicePdfAdmin = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice ID format'
      });
    }

    const invoice = await B2BInvoice.findById(invoiceId).lean();
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    const pdfUrl = invoice.invoicePdfUrl || invoice.fileUrl;
    if (!pdfUrl) {
      return res.status(404).json({
        success: false,
        message: 'Invoice PDF file has not been generated yet.'
      });
    }

    console.log(`[Admin Invoice Controller] Streaming secure PDF for admin: ${pdfUrl}`);
    const response = await axios.get(pdfUrl, { responseType: 'stream' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    response.data.pipe(res);
  } catch (error) {
    console.error('[Admin Invoice Controller] Error downloading PDF:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to download invoice PDF'
    });
  }
};

module.exports = {
  getB2BInvoicesAdmin,
  getB2BInvoiceByIdAdmin,
  generateMonthlyInvoice,
  updateB2BInvoiceStatus,
  downloadB2BInvoicePdfAdmin
};
