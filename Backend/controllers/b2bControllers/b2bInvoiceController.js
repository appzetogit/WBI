const mongoose = require('mongoose');
const B2BInvoice = require('../../models/B2BInvoice');
const axios = require('axios');
const AuditLog = require('../../models/AuditLog'); // Assume standard AuditLog exists or standard logs

/**
 * Log download/view actions for audit logs
 */
const writeAuditLog = async (companyId, action, invoiceId, details) => {
  try {
    if (mongoose.modelNames().includes('AuditLog')) {
      await AuditLog.create({
        user: companyId,
        action,
        target: 'B2BInvoice',
        targetId: invoiceId,
        details: JSON.stringify(details),
        timestamp: new Date()
      });
    } else {
      console.log(`[B2B Invoice Audit] ${action} on invoice ${invoiceId} by company ${companyId}`);
    }
  } catch (err) {
    console.warn('[B2B Invoice Audit] Logging failed:', err.message);
  }
};

/**
 * GET /api/b2b/invoices/summary
 * Fetch summary statistics of invoices for the logged-in B2B company
 */
const getInvoiceSummary = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.user.id);

    // Aggregate paid, pending, overdue counts and total amounts
    const stats = await B2BInvoice.aggregate([
      { $match: { companyId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalSum: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Map aggregate results to standard status categories
    const summary = {
      totalCount: 0,
      totalSum: 0,
      paidCount: 0,
      paidSum: 0,
      pendingCount: 0,
      pendingSum: 0,
      overdueCount: 0,
      overdueSum: 0
    };

    stats.forEach(item => {
      const status = (item._id || '').toLowerCase();
      const count = item.count || 0;
      const sum = item.totalSum || 0;

      summary.totalCount += count;
      summary.totalSum += sum;

      if (status === 'paid' || status === 'settled') {
        summary.paidCount += count;
        summary.paidSum += sum;
      } else if (status === 'pending' || status === 'generated') {
        summary.pendingCount += count;
        summary.pendingSum += sum;
      } else if (status === 'overdue') {
        summary.overdueCount += count;
        summary.overdueSum += sum;
      }
    });

    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('[B2B Invoice Controller] Error fetching invoice summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice summary'
    });
  }
};

/**
 * GET /api/b2b/invoices
 * Paginated invoice listing with search by invoice number, status, and date range filters
 */
const getInvoices = async (req, res) => {
  try {
    const companyId = req.user.id;
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status = '', 
      startDate = '', 
      endDate = '' 
    } = req.query;

    const query = { companyId: new mongoose.Types.ObjectId(companyId) };

    // Search filter
    if (search.trim()) {
      query.invoiceNumber = { $regex: search.trim(), $options: 'i' };
    }

    // Status filter
    if (status.trim()) {
      if (status.toLowerCase() === 'paid') {
        query.status = { $in: ['paid', 'Settled'] };
      } else if (status.toLowerCase() === 'pending') {
        query.status = { $in: ['pending', 'generated'] };
      } else {
        query.status = status;
      }
    }

    // Date range filter (by invoiceDate)
    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) {
        query.invoiceDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.invoiceDate.$lte = end;
      }
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skipNum = (pageNum - 1) * limitNum;

    // Use lean query returning only list fields for optimal memory usage
    const invoices = await B2BInvoice.find(query)
      .select('invoiceNumber invoiceDate billingPeriod billingPeriodStart billingPeriodEnd totalJobs totalAmount subtotal gstAmount status paymentStatus createdAt')
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
    console.error('[B2B Invoice Controller] Error fetching invoices:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices'
    });
  }
};

/**
 * GET /api/b2b/invoices/:invoiceId
 * Fetch complete invoice details (with validation and ownership check)
 */
const getInvoiceById = async (req, res) => {
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

    // Ownership check
    if (invoice.companyId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not own this invoice.'
      });
    }

    // Log the view action
    await writeAuditLog(req.user.id, 'VIEW_INVOICE', invoiceId, { invoiceNumber: invoice.invoiceNumber });

    return res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('[B2B Invoice Controller] Error fetching invoice details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice details'
    });
  }
};

/**
 * GET /api/b2b/invoices/:invoiceId/download
 * Validate ownership and stream invoice PDF securely from Cloudinary
 */
const downloadInvoicePdf = async (req, res) => {
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

    // Ownership check
    if (invoice.companyId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not own this invoice.'
      });
    }

    if (!invoice.invoicePdfUrl && !invoice.fileUrl) {
      return res.status(404).json({
        success: false,
        message: 'Invoice PDF file has not been generated yet.'
      });
    }

    const pdfUrl = invoice.invoicePdfUrl || invoice.fileUrl;
    
    // Log the download action
    await writeAuditLog(req.user.id, 'DOWNLOAD_PDF', invoiceId, { invoiceNumber: invoice.invoiceNumber });

    console.log(`[B2B Invoice Controller] Streaming secure PDF from: ${pdfUrl}`);
    const response = await axios.get(pdfUrl, { responseType: 'stream' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    response.data.pipe(res);
  } catch (error) {
    console.error('[B2B Invoice Controller] Error downloading invoice PDF:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to download invoice PDF'
    });
  }
};

/**
 * GET /api/b2b/invoices/export
 * Export filtered B2B invoices as CSV format
 */
const exportInvoicesCsv = async (req, res) => {
  try {
    const companyId = req.user.id;
    const { search = '', status = '', startDate = '', endDate = '' } = req.query;

    const query = { companyId: new mongoose.Types.ObjectId(companyId) };

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

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) {
        query.invoiceDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.invoiceDate.$lte = end;
      }
    }

    const invoices = await B2BInvoice.find(query).sort({ createdAt: -1 }).lean();

    // Log the export action
    await writeAuditLog(req.user.id, 'EXPORT_CSV', null, { count: invoices.length });

    // Build CSV content
    let csvContent = 'Invoice Number,Invoice Date,Billing Period,Total Jobs,Subtotal (INR),GST (INR),Total Payable (INR),Status,Payment Status\n';
    
    invoices.forEach(inv => {
      const dateStr = new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN');
      
      let billingPeriodStr = inv.billingPeriod || '';
      if (!billingPeriodStr && inv.billingPeriodStart && inv.billingPeriodEnd) {
        const startStr = new Date(inv.billingPeriodStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        const endStr = new Date(inv.billingPeriodEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        billingPeriodStr = `${startStr} - ${endStr}`;
      }
      
      // Clean string fields of commas to avoid csv corruption
      const bpClean = billingPeriodStr.replace(/,/g, ' ');
      const statusStr = inv.status || 'generated';
      const payStatusStr = inv.paymentStatus || 'unpaid';

      csvContent += `"${inv.invoiceNumber}","${dateStr}","${bpClean}",${inv.totalJobs || 0},${inv.subtotal || 0},${inv.gstAmount || 0},${inv.totalAmount || 0},"${statusStr}","${payStatusStr}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="invoices-${new Date().toISOString().substring(0, 10)}.csv"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('[B2B Invoice Controller] Error exporting invoices to CSV:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export invoices'
    });
  }
};

module.exports = {
  getInvoiceSummary,
  getInvoices,
  getInvoiceById,
  downloadInvoicePdf,
  exportInvoicesCsv
};
