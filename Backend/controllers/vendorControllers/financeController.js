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
    const withdrawSvc = require('../../services/vendorWithdrawal.service');
    const wallet = await VendorFinanceWallet.findOne({ vendorId: vid }).lean();
    const srEscrow = await withdrawSvc.getEscrowHeldFromServiceRequests(vid);
    const [clientPending, b2bPending, quotations, invoicesDue, milestonesDue] = await Promise.all([
      VendorFinanceReceivable.countDocuments({ vendorId: vid, clientType: 'individual', status: { $in: ['pending', 'partial', 'overdue'] } }),
      VendorFinanceReceivable.countDocuments({ vendorId: vid, clientType: 'b2b', status: { $in: ['pending', 'partial', 'overdue'] } }),
      VendorFinanceDocument.countDocuments({ vendorId: vid, documentType: 'quotation', status: { $in: ['draft', 'sent', 'negotiation'] } }),
      VendorFinanceDocument.countDocuments({ vendorId: vid, documentType: 'invoice', status: { $in: ['issued', 'partial', 'overdue'] } }),
      VendorFinanceMilestone.countDocuments({ vendorId: vid, status: { $in: ['due', 'qa_pending', 'approval_pending', 'invoice_ready', 'invoiced'] } })
    ]);
    const financeEscrow = wallet?.escrowBalance || 0;
    res.json({
      success: true,
      data: {
        availableBalance: wallet?.availableBalance || 0,
        escrowBalance: financeEscrow + (srEscrow.amount || 0),
        financeEscrowBalance: financeEscrow,
        serviceRequestEscrow: srEscrow.amount || 0,
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
    const withdrawSvc = require('../../services/vendorWithdrawal.service');
    const wallet = await VendorFinanceWallet.findOneAndUpdate(
      { vendorId: vid },
      { $setOnInsert: { vendorId: vid } },
      { new: true, upsert: true }
    ).lean();
    const srEscrow = await withdrawSvc.getEscrowHeldFromServiceRequests(vid);
    const financeEscrow = Number(wallet?.escrowBalance) || 0;
    const enrichedWallet = {
      ...wallet,
      financeEscrowBalance: financeEscrow,
      serviceRequestEscrow: srEscrow.amount || 0,
      serviceRequestEscrowCount: srEscrow.count || 0,
      escrowBalance: financeEscrow + (srEscrow.amount || 0)
    };
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
    res.json({ success: true, data: { wallet: enrichedWallet, transactions }, pagination: pagination(page, limit, total) });
  } catch (error) {
    console.error('finance getWallet:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet' });
  }
};

const getWithdrawEligibility = async (req, res) => {
  try {
    const data = await require('../../services/vendorWithdrawal.service').getWithdrawEligibility(vendorId(req));
    res.json({ success: true, data });
  } catch (error) {
    console.error('finance getWithdrawEligibility:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to load eligibility' });
  }
};

const quoteWithdrawal = async (req, res) => {
  try {
    const config = await require('../../services/vendorPayoutConfig.service').getPayoutConfig();
    const fees = require('../../services/vendorPayoutConfig.service').calculatePayoutFees(req.body.amount || req.query.amount, config);
    res.json({ success: true, data: { fees, config: {
      minWithdrawalAmount: config.minWithdrawalAmount,
      maxWithdrawalAmount: config.maxWithdrawalAmount,
      settlementSchedule: config.settlementSchedule,
      payoutProvider: config.payoutProvider
    } } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to quote fees' });
  }
};

const listBankAccounts = async (req, res) => {
  try {
    const banks = await require('../../services/vendorWithdrawal.service').listBanks(vendorId(req));
    res.json({ success: true, data: banks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to list banks' });
  }
};

const upsertBankAccount = async (req, res) => {
  try {
    const bank = await require('../../services/vendorWithdrawal.service').addOrUpdateBank(vendorId(req), req.body || {});
    res.status(201).json({ success: true, data: bank });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to save bank' });
  }
};

const verifyBankAccount = async (req, res) => {
  try {
    const bank = await require('../../services/vendorWithdrawal.service').verifyBankAccount(
      vendorId(req),
      req.params.bankId
    );
    res.json({ success: true, data: bank });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Bank verification failed' });
  }
};

const sendWithdrawOtp = async (req, res) => {
  try {
    const data = await require('../../services/vendorWithdrawal.service').sendWithdrawalOtp(vendorId(req));
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to send OTP' });
  }
};

const requestWithdrawal = async (req, res) => {
  try {
    const vid = vendorId(req);
    const withdrawSvc = require('../../services/vendorWithdrawal.service');
    const result = await withdrawSvc.createWithdrawalRequest(vid, {
      amount: req.body.amount,
      bankAccountId: req.body.bankAccountId || req.body.bankId,
      method: req.body.method || 'bank',
      otp: req.body.otp,
      idempotencyKey: req.body.idempotencyKey || req.get('Idempotency-Key'),
      notes: req.body.notes || ''
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('finance requestWithdrawal:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to request withdrawal'
    });
  }
};

const listWithdrawals = async (req, res) => {
  try {
    const data = await require('../../services/vendorWithdrawal.service').listVendorWithdrawals(vendorId(req), {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      status: req.query.status
    });
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to list withdrawals' });
  }
};

const getWithdrawal = async (req, res) => {
  try {
    const data = await require('../../services/vendorWithdrawal.service').getWithdrawalDetail(
      vendorId(req),
      req.params.id
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Not found' });
  }
};

const cancelWithdrawal = async (req, res) => {
  try {
    const data = await require('../../services/vendorWithdrawal.service').cancelWithdrawal(
      vendorId(req),
      req.params.id
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Cancel failed' });
  }
};

const downloadWithdrawalReceipt = async (req, res) => {
  try {
    const w = await require('../../services/vendorWithdrawal.service').getWithdrawalDetail(
      vendorId(req),
      req.params.id
    );
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Withdrawal Receipt</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:40px auto;color:#111}
h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}
td{padding:8px;border-bottom:1px solid #eee;font-size:13px}.muted{color:#666}</style></head><body>
<h1>Withdrawal Settlement Receipt</h1>
<p class="muted">Reference: ${w._id}</p>
<table>
<tr><td>Status</td><td><strong>${w.status}</strong></td></tr>
<tr><td>Gross Amount</td><td>₹${w.amount}</td></tr>
<tr><td>TDS (${w.tdsRate || 0}%)</td><td>₹${w.tdsAmount || 0}</td></tr>
<tr><td>Platform Fee</td><td>₹${w.platformFeeAmount || 0}</td></tr>
<tr><td>GST on Fee</td><td>₹${w.gstOnFee || 0}</td></tr>
<tr><td>Net Payout</td><td><strong>₹${w.netAmount || w.amount}</strong></td></tr>
<tr><td>UTR / Reference</td><td>${w.transactionReference || '—'}</td></tr>
<tr><td>Gateway</td><td>${w.gatewayProvider || '—'} ${w.gatewayPayoutId || ''}</td></tr>
<tr><td>Account</td><td>${w.bankDetails?.accountHolderName || ''} · ${w.bankDetails?.accountNumberMasked || w.bankDetails?.upiId || ''}</td></tr>
<tr><td>Requested</td><td>${w.createdAt ? new Date(w.createdAt).toLocaleString('en-IN') : '—'}</td></tr>
<tr><td>Paid At</td><td>${w.paidAt ? new Date(w.paidAt).toLocaleString('en-IN') : '—'}</td></tr>
</table>
${(w.timeline || []).map((e) => `<p class="muted">${new Date(e.at).toLocaleString('en-IN')} — ${e.status}: ${e.message}</p>`).join('')}
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="withdrawal-${w._id}.html"`);
    res.send(html);
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Receipt failed' });
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
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
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
    if (doc.documentType === 'invoice' && invoiceMap[action]) {
      doc.status = invoiceMap[action];
      if (action === 'issue') doc.paymentEligible = true;
    }
    if (action === 'convert' && doc.documentType === 'quotation') {
      const result = await lifecycle.convertQuotationToProject(vid, doc._id);
      return res.json({ success: true, data: result.document, meta: { milestones: result.milestones?.length || 0 } });
    }
    if (action === 'release_escrow' && doc.documentType === 'invoice') {
      const result = await lifecycle.releaseInvoiceEscrow(vid, doc._id, {
        commissionRate: Number(req.body.commissionRate) || 5,
        tdsRate: Number(req.body.tdsRate) || 0
      });
      return res.json({ success: true, data: result.invoice, meta: result });
    }
    await doc.save();
    lifecycle.emitFinance(vid, 'finance:documentUpdated', { documentId: doc._id, status: doc.status });
    res.json({ success: true, data: doc });
  } catch (error) {
    console.error('finance updateDocument:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to update document' });
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
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
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
      const result = await lifecycle.generateInvoiceFromMilestone(vid, item._id);
      return res.json({ success: true, data: result.milestone, invoice: result.invoice });
    } else if (action === 'pay') {
      if (item.status !== 'invoiced') {
        return res.status(400).json({ success: false, message: 'Milestone must be invoiced first' });
      }
      // Manual offline pay (ledger credit) — prefer Razorpay invoice pay for production clients
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
    lifecycle.emitFinance(vid, 'finance:milestoneUpdated', { milestoneId: item._id, status: item.status });
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('finance updateMilestone:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to update payment milestone' });
  }
};

const syncFinance = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const data = await lifecycle.syncVendorFinance(vid);
    res.json({ success: true, data });
  } catch (error) {
    console.error('finance syncFinance:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to sync finance data' });
  }
};

const exportLedger = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const csv = await lifecycle.exportLedgerCsv(vid, {
      category: req.query.category,
      status: req.query.status,
      search: req.query.search
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vendor-finance-ledger-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('finance exportLedger:', error);
    res.status(500).json({ success: false, message: 'Failed to export ledger' });
  }
};

const downloadDocument = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const html = await lifecycle.getInvoiceHtml(vid, req.params.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('finance downloadDocument:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to render document' });
  }
};

const createInvoicePayOrder = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const data = await lifecycle.createInvoicePaymentOrder(vid, req.params.id, {
      idempotencyKey: req.body.idempotencyKey || req.get('Idempotency-Key')
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('finance createInvoicePayOrder:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to create payment order' });
  }
};

const verifyInvoicePay = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const data = await lifecycle.verifyInvoicePayment(vid, {
      invoiceId: req.params.id,
      razorpay_order_id: req.body.razorpay_order_id,
      razorpay_payment_id: req.body.razorpay_payment_id,
      razorpay_signature: req.body.razorpay_signature
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('finance verifyInvoicePay:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to verify payment' });
  }
};

module.exports = {
  getCounts,
  getWallet,
  getEarningsByService,
  getWithdrawEligibility,
  quoteWithdrawal,
  listBankAccounts,
  upsertBankAccount,
  verifyBankAccount,
  sendWithdrawOtp,
  requestWithdrawal,
  listWithdrawals,
  getWithdrawal,
  cancelWithdrawal,
  downloadWithdrawalReceipt,
  getClientReceivables: getReceivables('individual'),
  getB2BReceivables: getReceivables('b2b'),
  updateReceivable,
  getQuotations: getDocuments('quotation'),
  getInvoices: getDocuments('invoice'),
  updateDocument,
  getMilestones,
  updateMilestone,
  syncFinance,
  exportLedger,
  downloadDocument,
  createInvoicePayOrder,
  verifyInvoicePay
};
