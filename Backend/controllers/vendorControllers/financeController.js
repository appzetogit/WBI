const mongoose = require('mongoose');
const VendorFinanceWallet = require('../../models/VendorFinanceWallet');
const VendorFinanceTransaction = require('../../models/VendorFinanceTransaction');
const VendorFinanceReceivable = require('../../models/VendorFinanceReceivable');
const VendorFinanceDocument = require('../../models/VendorFinanceDocument');
const VendorFinanceMilestone = require('../../models/VendorFinanceMilestone');
const Vendor = require('../../models/Vendor');
const ServiceRequest = require('../../models/ServiceRequest');
const { postVendorFinanceLedger } = require('../../services/vendorFinanceLedger.service');

const vendorId = (req) => new mongoose.Types.ObjectId(req.user._id || req.user.id);
const escapeRegex = (value) => new RegExp(String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const paging = (req) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 12));
  return { page, limit, skip: (page - 1) * limit };
};
const pagination = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) || 1 });

const categoryFilter = async (filter, vid, category) => {
  if (category) {
    filter.serviceCategoryCode = String(category).toUpperCase();
    return;
  }
  const vendor = await Vendor.findById(vid).select('approvedServices').lean();
  const codes = (vendor?.approvedServices || [])
    .filter((service) => service.status !== 'suspended')
    .map((service) => service.categoryCode)
    .filter(Boolean);
  if (codes.length) filter.serviceCategoryCode = { $in: codes };
};

const getCounts = async (req, res) => {
  try {
    const vid = vendorId(req);
    const wallet = await VendorFinanceWallet.findOne({ vendorId: vid }).lean();
    const [clientPending, b2bPending, quotations, invoicesDue, milestonesDue] = await Promise.all([
      VendorFinanceReceivable.countDocuments({ vendorId: vid, clientType: 'individual', status: { $in: ['pending', 'partial', 'overdue'] } }),
      VendorFinanceReceivable.countDocuments({ vendorId: vid, clientType: 'b2b', status: { $in: ['pending', 'partial', 'overdue'] } }),
      VendorFinanceDocument.countDocuments({ vendorId: vid, documentType: 'quotation', status: { $in: ['draft', 'sent', 'negotiation'] } }),
      VendorFinanceDocument.countDocuments({ vendorId: vid, documentType: 'invoice', status: { $in: ['issued', 'partial', 'overdue'] } }),
      VendorFinanceMilestone.countDocuments({ vendorId: vid, status: { $in: ['due', 'qa_pending', 'approval_pending', 'invoice_ready', 'invoiced'] } })
    ]);
    res.json({
      success: true,
      data: {
        availableBalance: wallet?.availableBalance || 0,
        escrowBalance: wallet?.escrowBalance || 0,
        clientPending,
        b2bPending,
        quotations,
        invoicesDue,
        milestonesDue
      }
    });
  } catch (error) {
    console.error('finance getCounts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch finance counts' });
  }
};

/**
 * GET /vendor/finance/earnings-by-service
 * One row per registered/approved service with earnings + pending + escrow held.
 */
const getEarningsByService = async (req, res) => {
  try {
    const vid = vendorId(req);
    const vendor = await Vendor.findById(vid).select('approvedServices').lean();
    const services = (vendor?.approvedServices || []).filter((s) => s.status !== 'suspended');

    const [txnAgg, recvAgg, escrowHeld] = await Promise.all([
      VendorFinanceTransaction.aggregate([
        {
          $match: {
            vendorId: vid,
            status: 'completed',
            type: { $in: ['credit', 'escrow_release', 'refund'] }
          }
        },
        {
          $group: {
            _id: { $ifNull: ['$serviceCategoryCode', ''] },
            totalEarnings: { $sum: '$amount' },
            creditCount: { $sum: 1 },
            lastPaidAt: { $max: '$occurredAt' }
          }
        }
      ]),
      VendorFinanceReceivable.aggregate([
        {
          $match: {
            vendorId: vid,
            status: { $in: ['pending', 'partial', 'overdue'] }
          }
        },
        {
          $group: {
            _id: { $ifNull: ['$serviceCategoryCode', ''] },
            pendingAmount: {
              $sum: { $subtract: ['$amount', { $ifNull: ['$paidAmount', 0] }] }
            },
            pendingCount: { $sum: 1 }
          }
        }
      ]),
      ServiceRequest.aggregate([
        {
          $match: {
            assignedVendorId: vid,
            'payment.status': 'paid',
            'payment.escrowStatus': 'held'
          }
        },
        {
          $group: {
            _id: '$categoryCode',
            escrowHeld: { $sum: '$payment.amount' },
            heldCount: { $sum: 1 }
          }
        }
      ]).catch(() => [])
    ]);

    const txnMap = Object.fromEntries(txnAgg.map((r) => [String(r._id || '').toUpperCase(), r]));
    const recvMap = Object.fromEntries(recvAgg.map((r) => [String(r._id || '').toUpperCase(), r]));
    const escrowMap = Object.fromEntries(
      (escrowHeld || []).map((r) => [String(r._id || '').toUpperCase(), r])
    );

    const byService = services.map((svc) => {
      const code = String(svc.categoryCode || '').toUpperCase();
      const t = txnMap[code] || {};
      const r = recvMap[code] || {};
      const e = escrowMap[code] || {};
      return {
        categoryCode: code,
        categoryName: svc.categoryName || code,
        status: svc.status || 'pending',
        subServices: svc.subServices || [],
        totalEarnings: t.totalEarnings || 0,
        creditCount: t.creditCount || 0,
        lastPaidAt: t.lastPaidAt || null,
        pendingReceivables: Math.max(0, r.pendingAmount || 0),
        pendingCount: r.pendingCount || 0,
        escrowHeld: e.escrowHeld || 0,
        heldJobs: e.heldCount || 0
      };
    });

    const known = new Set(byService.map((s) => s.categoryCode));
    Object.keys(txnMap).forEach((code) => {
      if (!code || known.has(code)) return;
      const t = txnMap[code];
      byService.push({
        categoryCode: code || 'UNASSIGNED',
        categoryName: code || 'Unassigned / Other',
        status: 'other',
        subServices: [],
        totalEarnings: t.totalEarnings || 0,
        creditCount: t.creditCount || 0,
        lastPaidAt: t.lastPaidAt || null,
        pendingReceivables: Math.max(0, recvMap[code]?.pendingAmount || 0),
        pendingCount: recvMap[code]?.pendingCount || 0,
        escrowHeld: escrowMap[code]?.escrowHeld || 0,
        heldJobs: escrowMap[code]?.heldCount || 0
      });
    });

    const totals = byService.reduce(
      (acc, row) => {
        acc.totalEarnings += row.totalEarnings;
        acc.pendingReceivables += row.pendingReceivables;
        acc.escrowHeld += row.escrowHeld;
        return acc;
      },
      { totalEarnings: 0, pendingReceivables: 0, escrowHeld: 0 }
    );

    res.json({
      success: true,
      data: { byService, totals, serviceCount: byService.length }
    });
  } catch (error) {
    console.error('finance getEarningsByService:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch per-service earnings' });
  }
};

const getWallet = async (req, res) => {
  try {
    const vid = vendorId(req);
    const wallet = await VendorFinanceWallet.findOneAndUpdate(
      { vendorId: vid },
      { $setOnInsert: { vendorId: vid } },
      { new: true, upsert: true }
    ).lean();
    const { page, limit, skip } = paging(req);
    const filter = { vendorId: vid };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.serviceCategoryCode = String(req.query.category).toUpperCase();
    if (req.query.search) {
      const term = escapeRegex(req.query.search);
      filter.$or = [
        { transactionCode: term },
        { description: term },
        { referenceCode: term },
        { projectCode: term },
        { serviceCategoryName: term },
        { serviceCategoryCode: term }
      ];
    }
    const [transactions, total] = await Promise.all([
      VendorFinanceTransaction.find(filter).sort({ occurredAt: -1 }).skip(skip).limit(limit).lean(),
      VendorFinanceTransaction.countDocuments(filter)
    ]);
    res.json({ success: true, data: { wallet, transactions }, pagination: pagination(page, limit, total) });
  } catch (error) {
    console.error('finance getWallet:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet' });
  }
};

const requestWithdrawal = async (req, res) => {
  try {
    const vid = vendorId(req);
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid withdrawal amount is required' });
    }
    const wallet = await VendorFinanceWallet.findOne({ vendorId: vid });
    if (!wallet || wallet.availableBalance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient available balance' });
    }
    wallet.availableBalance -= amount;
    wallet.processingWithdrawal += amount;
    await wallet.save();
    const transaction = await new VendorFinanceTransaction({
      vendorId: vid,
      type: 'withdrawal',
      amount,
      description: 'Bank withdrawal request',
      balanceAfter: wallet.availableBalance,
      status: 'processing',
      serviceCategoryCode: req.body.categoryCode ? String(req.body.categoryCode).toUpperCase() : '',
      source: 'withdrawal'
    }).save();
    res.status(201).json({ success: true, data: { wallet, transaction } });
  } catch (error) {
    console.error('finance requestWithdrawal:', error);
    res.status(500).json({ success: false, message: 'Failed to request withdrawal' });
  }
};

const getReceivables = (clientType) => async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = paging(req);
    const filter = { vendorId: vid, clientType };
    if (req.query.status) filter.status = req.query.status;
    await categoryFilter(filter, vid, req.query.category);
    if (req.query.search) {
      const term = escapeRegex(req.query.search);
      filter.$or = [
        { clientName: term },
        { projectName: term },
        { receivableCode: term },
        { invoiceNumber: term },
        { poNumber: term }
      ];
    }
    const [data, total, totals] = await Promise.all([
      VendorFinanceReceivable.find(filter).sort({ dueDate: 1 }).skip(skip).limit(limit).lean({ virtuals: true }),
      VendorFinanceReceivable.countDocuments(filter),
      VendorFinanceReceivable.aggregate([
        { $match: { vendorId: vid, clientType } },
        {
          $group: {
            _id: null,
            amount: { $sum: '$amount' },
            paid: { $sum: '$paidAmount' },
            overdue: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'overdue'] },
                  { $subtract: ['$amount', '$paidAmount'] },
                  0
                ]
              }
            }
          }
        }
      ])
    ]);
    const summary = totals[0] || { amount: 0, paid: 0, overdue: 0 };
    summary.remaining = summary.amount - summary.paid;
    summary.collectionRate = summary.amount ? Math.round((summary.paid / summary.amount) * 100) : 0;
    res.json({ success: true, data, summary, pagination: pagination(page, limit, total) });
  } catch (error) {
    console.error('finance getReceivables:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch receivables' });
  }
};

const updateReceivable = async (req, res) => {
  try {
    const vid = vendorId(req);
    const item = await VendorFinanceReceivable.findOne({ _id: req.params.id, vendorId: vid });
    if (!item) return res.status(404).json({ success: false, message: 'Receivable not found' });
    const { action } = req.body;
    if (action === 'remind') item.lastReminderAt = new Date();
    if (action === 'cancel') item.status = 'cancelled';
    if (action === 'record_payment') {
      const remaining = Math.max(0, item.amount - item.paidAmount);
      const amount = Math.min(remaining, Math.max(0, Number(req.body.amount) || remaining));
      item.paidAmount += amount;
      await postVendorFinanceLedger({
        vendorId: vid,
        type: 'credit',
        amount,
        description: `Payment received from ${item.clientName}`,
        projectCode: item.projectCode,
        referenceCode: item.invoiceNumber || item.receivableCode,
        serviceCategoryCode: item.serviceCategoryCode,
        serviceCategoryName: item.serviceCategoryName,
        source: 'receivable'
      });
    }
    await item.save();
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('finance updateReceivable:', error);
    res.status(500).json({ success: false, message: 'Failed to update receivable' });
  }
};

const getDocuments = (documentType) => async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = paging(req);
    const filter = { vendorId: vid, documentType };
    if (req.query.status) filter.status = req.query.status;
    await categoryFilter(filter, vid, req.query.category);
    if (req.query.search) {
      const term = escapeRegex(req.query.search);
      filter.$or = [{ documentCode: term }, { clientName: term }, { projectName: term }, { scope: term }];
    }
    const [data, total] = await Promise.all([
      VendorFinanceDocument.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorFinanceDocument.countDocuments(filter)
    ]);
    res.json({ success: true, data, pagination: pagination(page, limit, total) });
  } catch (error) {
    console.error('finance getDocuments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch finance documents' });
  }
};

const updateDocument = async (req, res) => {
  try {
    const vid = vendorId(req);
    const doc = await VendorFinanceDocument.findOne({ _id: req.params.id, vendorId: vid });
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    const { action } = req.body;
    const quotationMap = {
      send: 'sent',
      negotiate: 'negotiation',
      approve: 'approved',
      reject: 'rejected',
      expire: 'expired'
    };
    const invoiceMap = { issue: 'issued', cancel: 'cancelled', mark_paid: 'paid' };
    if (doc.documentType === 'quotation' && quotationMap[action]) doc.status = quotationMap[action];
    if (doc.documentType === 'invoice' && invoiceMap[action]) doc.status = invoiceMap[action];
    if (action === 'convert' && doc.documentType === 'quotation') {
      if (doc.status !== 'approved') {
        return res.status(400).json({ success: false, message: 'Only approved quotations can be converted' });
      }
      doc.convertedToProject = true;
    }
    await doc.save();
    res.json({ success: true, data: doc });
  } catch (error) {
    console.error('finance updateDocument:', error);
    res.status(500).json({ success: false, message: 'Failed to update document' });
  }
};

const getMilestones = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = paging(req);
    const filter = { vendorId: vid };
    if (req.query.status) filter.status = req.query.status;
    await categoryFilter(filter, vid, req.query.category);
    if (req.query.search) {
      const term = escapeRegex(req.query.search);
      filter.$or = [
        { milestoneCode: term },
        { name: term },
        { projectName: term },
        { clientName: term }
      ];
    }
    const [data, total] = await Promise.all([
      VendorFinanceMilestone.find(filter).sort({ dueDate: 1, sequence: 1 }).skip(skip).limit(limit).lean(),
      VendorFinanceMilestone.countDocuments(filter)
    ]);
    res.json({ success: true, data, pagination: pagination(page, limit, total) });
  } catch (error) {
    console.error('finance getMilestones:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payment milestones' });
  }
};

const updateMilestone = async (req, res) => {
  try {
    const vid = vendorId(req);
    const item = await VendorFinanceMilestone.findOne({ _id: req.params.id, vendorId: vid });
    if (!item) return res.status(404).json({ success: false, message: 'Milestone not found' });
    const { action } = req.body;
    if (action === 'complete') {
      item.projectCompleted = true;
      item.status = 'qa_pending';
    } else if (action === 'qa_approve') {
      item.qaApproved = true;
      item.status = 'approval_pending';
    } else if (action === 'client_approve') {
      item.clientApproved = true;
      item.status = 'invoice_ready';
    } else if (action === 'invoice') {
      if (!item.qaApproved || !item.clientApproved) {
        return res.status(400).json({ success: false, message: 'QA and client approval are required' });
      }
      item.invoiceNumber = `AUTO-${item.milestoneCode}`;
      item.status = 'invoiced';
    } else if (action === 'pay') {
      if (item.status !== 'invoiced') {
        return res.status(400).json({ success: false, message: 'Milestone must be invoiced first' });
      }
      item.status = 'paid';
      item.paidAt = new Date();
      await postVendorFinanceLedger({
        vendorId: vid,
        type: 'credit',
        amount: item.amount,
        description: `Milestone payment: ${item.name}`,
        projectCode: item.projectCode,
        referenceCode: item.invoiceNumber,
        serviceCategoryCode: item.serviceCategoryCode,
        serviceCategoryName: item.serviceCategoryName,
        source: 'milestone'
      });
    }
    await item.save();
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('finance updateMilestone:', error);
    res.status(500).json({ success: false, message: 'Failed to update payment milestone' });
  }
};

module.exports = {
  getCounts,
  getWallet,
  getEarningsByService,
  requestWithdrawal,
  getClientReceivables: getReceivables('individual'),
  getB2BReceivables: getReceivables('b2b'),
  updateReceivable,
  getQuotations: getDocuments('quotation'),
  getInvoices: getDocuments('invoice'),
  updateDocument,
  getMilestones,
  updateMilestone
};
