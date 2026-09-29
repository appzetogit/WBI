/**
 * Admin operations views that span modules:
 *   GET /jobs, /jobs/summary          unified B2C bookings + B2B jobs (jobs.read)
 *   GET /refunds                      B2C refunds + B2B wallet refunds (payments.read)
 *   GET /dashboard/control-center     KYC queue, refunds, disputes, transactions, alerts (dashboard.read)
 *   GET /reports/refunds|withdrawals|commission|b2b-platform (reports.read)
 * Access is enforced by the central adminAccess guard.
 */
const express = require('express');
const router = express.Router();
const Booking = require('../../models/Booking');
const B2BJob = require('../../models/B2BJob');
const Transaction = require('../../models/Transaction');
const B2BWalletTransaction = require('../../models/B2BWalletTransaction');
const Withdrawal = require('../../models/Withdrawal');
const Dispute = require('../../models/Dispute');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error('[adminOps]', e);
  res.status(500).json({ success: false, message: 'Failed to load data' });
});

// ── Unified job buckets (spec §7) ─────────────────────────────────────────
const B2C_BUCKETS = {
  pending: ['pending', 'requested', 'searching', 'searching_worker', 'request_sent', 'scheduled', 'awaiting_payment', 'confirmed'],
  assigned: ['worker_assigned', 'assigned'],
  accepted: ['accepted'],
  en_route: ['journey_started'],
  checked_in: ['arrived', 'visited'],
  in_progress: ['service_started', 'in_progress', 'work_done', 'completed_pending_payment', 'payment_initiated'],
  completed: ['completed', 'paid', 'closed'],
  cancelled: ['cancelled', 'rejected', 'refunded'],
  disputed: ['disputed'],
  failed: ['admin_action_required']
};
const B2B_BUCKETS = {
  pending: ['pending', 'pending_wallet', 'searching_engineer'],
  assigned: ['assigned'],
  accepted: ['accepted'],
  en_route: ['travelling'],
  checked_in: ['arrived'],
  in_progress: ['in_progress', 'completion_submitted', 'admin_review', 'on_hold', 'revision_required'],
  completed: ['completed', 'closed'],
  cancelled: ['cancelled', 'rejected'],
  disputed: [],
  failed: ['failed', 'escalated']
};
const bucketOf = (map, status) => Object.keys(map).find((k) => map[k].includes(status)) || 'pending';
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

const statusFilter = (map, bucket) => {
  if (!bucket || bucket === 'all') return {};
  if (bucket === 'new') return { status: { $in: map.pending }, createdAt: { $gte: new Date(Date.now() - NEW_WINDOW_MS) } };
  return { status: { $in: map[bucket] || [] } };
};

const listJobs = async ({ source = 'all', bucket = 'all', q, from, to, page = 1, limit = 25 }) => {
  const disputed = new Set((await Dispute.find({ status: { $in: ['open', 'in_review'] } }).select('sourceId').lean()).map((d) => String(d.sourceId)));
  const dateFilter = {};
  if (from || to) {
    dateFilter.createdAt = {};
    if (from) dateFilter.createdAt.$gte = new Date(from);
    if (to) dateFilter.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  const need = page * limit;
  const rows = [];
  let total = 0;

  const disputedIds = [...disputed];
  const b2cFilter = bucket === 'disputed'
    ? { $or: [{ status: 'disputed' }, { _id: { $in: disputedIds } }] }
    : statusFilter(B2C_BUCKETS, bucket);
  const b2bFilter = bucket === 'disputed' ? { _id: { $in: disputedIds } } : statusFilter(B2B_BUCKETS, bucket);
  if (q) {
    const rx = new RegExp(escapeRx(q), 'i');
    b2cFilter.$and = [...(b2cFilter.$and || []), { $or: [{ bookingNumber: rx }, { serviceName: rx }, { 'address.city': rx }] }];
    b2bFilter.$and = [...(b2bFilter.$and || []), { $or: [{ jobId: rx }, { customerName: rx }, { city: rx }, { serviceType: rx }] }];
  }

  if (source === 'all' || source === 'b2c') {
    const f = { ...b2cFilter, ...dateFilter };
    total += await Booking.countDocuments(f);
    const list = await Booking.find(f).sort({ createdAt: -1 }).limit(need)
      .select('bookingNumber serviceName serviceCategory address.city status paymentStatus finalAmount createdAt userId workerId vendorId')
      .populate('userId', 'name').populate('workerId', 'name').populate('vendorId', 'businessName name').lean();
    for (const b of list) {
      rows.push({
        id: b._id, source: 'b2c', ref: b.bookingNumber || String(b._id).slice(-8),
        customer: b.userId?.name || 'Customer', service: b.serviceName || b.serviceCategory,
        city: b.address?.city, status: b.status,
        bucket: disputed.has(String(b._id)) ? 'disputed' : bucketOf(B2C_BUCKETS, b.status),
        amount: round2(b.finalAmount), paymentStatus: b.paymentStatus,
        assignee: b.workerId?.name || b.vendorId?.businessName || b.vendorId?.name || null,
        createdAt: b.createdAt
      });
    }
  }
  if (source === 'all' || source === 'b2b') {
    const f = { ...b2bFilter, ...dateFilter };
    total += await B2BJob.countDocuments(f);
    const list = await B2BJob.find(f).sort({ createdAt: -1 }).limit(need)
      .select('jobId customerName serviceType serviceKey city status paymentStatus charge pricing.totalAmount createdAt companyId assignedToName assignedVendorId')
      .populate('companyId', 'companyName').populate('assignedVendorId', 'businessName name').lean();
    for (const j of list) {
      rows.push({
        id: j._id, source: 'b2b', ref: j.jobId,
        customer: j.companyId?.companyName || j.customerName, site: j.customerName,
        service: j.serviceType || j.serviceKey, city: j.city, status: j.status,
        bucket: disputed.has(String(j._id)) ? 'disputed' : bucketOf(B2B_BUCKETS, j.status),
        amount: round2(j.charge || j.pricing?.totalAmount), paymentStatus: j.paymentStatus,
        assignee: j.assignedToName || j.assignedVendorId?.businessName || j.assignedVendorId?.name || null,
        createdAt: j.createdAt
      });
    }
  }
  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const now = Date.now();
  for (const r of rows) {
    if (r.bucket === 'pending' && now - new Date(r.createdAt).getTime() < NEW_WINDOW_MS) r.bucket = 'new';
  }
  return { rows: rows.slice((page - 1) * limit, page * limit), total };
};

router.get('/jobs', wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  const { rows, total } = await listJobs({ ...req.query, page, limit });
  res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/jobs/summary', wrap(async (req, res) => {
  const [b2c, b2b, disputes] = await Promise.all([
    Booking.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    B2BJob.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Dispute.countDocuments({ status: { $in: ['open', 'in_review'] } })
  ]);
  const since = new Date(Date.now() - NEW_WINDOW_MS);
  const [newB2c, newB2b] = await Promise.all([
    Booking.countDocuments({ status: { $in: B2C_BUCKETS.pending }, createdAt: { $gte: since } }),
    B2BJob.countDocuments({ status: { $in: B2B_BUCKETS.pending }, createdAt: { $gte: since } })
  ]);
  const buckets = Object.fromEntries(['new', ...Object.keys(B2C_BUCKETS)].map((k) => [k, 0]));
  for (const r of b2c) buckets[bucketOf(B2C_BUCKETS, r._id)] += r.n;
  for (const r of b2b) buckets[bucketOf(B2B_BUCKETS, r._id)] += r.n;
  buckets.new = newB2c + newB2b;
  buckets.pending = Math.max(0, buckets.pending - buckets.new);
  buckets.disputed += disputes;
  const all = b2c.reduce((a, r) => a + r.n, 0) + b2b.reduce((a, r) => a + r.n, 0);
  res.json({ success: true, data: { all, buckets } });
}));

// ── Refunds (spec §8) ─────────────────────────────────────────────────────
router.get('/refunds', wrap(async (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 100);
  const [b2c, b2b] = await Promise.all([
    Transaction.find({ type: 'refund' }).sort({ createdAt: -1 }).limit(limit)
      .populate('userId', 'name phone').populate('bookingId', 'bookingNumber').lean(),
    B2BWalletTransaction.find({ $or: [{ type: { $in: ['escrow_refund', 'refund'] } }, { ledgerType: 'REFUND' }] })
      .sort({ createdAt: -1 }).limit(limit).populate('companyId', 'companyName').lean()
  ]);
  const rows = [
    ...b2c.map((t) => ({
      id: t._id, source: 'b2c', party: t.userId?.name || 'Customer', ref: t.bookingId?.bookingNumber,
      amount: round2(t.amount), method: t.paymentMethod, status: t.status, reason: t.description,
      providerRef: t.metadata?.refundId || null, createdAt: t.createdAt
    })),
    ...b2b.map((t) => ({
      id: t._id, source: 'b2b', party: t.companyId?.companyName || 'Company', ref: t.transactionId,
      amount: round2(t.amount), method: t.type === 'escrow_refund' ? 'escrow → wallet' : 'wallet credit',
      status: t.status, reason: t.remark, providerRef: null, createdAt: t.createdAt
    }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
  const totals = rows.reduce((acc, r) => { acc[r.source] = round2((acc[r.source] || 0) + r.amount); return acc; }, {});
  res.json({ success: true, data: rows, totals });
}));

// ── Control-center dashboard (spec §1 gaps) ───────────────────────────────
router.get('/dashboard/control-center', wrap(async (req, res) => {
  const Vendor = require('../../models/Vendor');
  const Engineer = require('../../models/Engineer');
  const Worker = require('../../models/Worker');
  const B2BCompany = require('../../models/B2BCompany');
  const B2BBatch = require('../../models/B2BBatch');
  const day = 24 * 60 * 60 * 1000;
  const since30 = new Date(Date.now() - 30 * day);
  let verificationDocs = 0;
  try { verificationDocs = await require('../../models/VerificationDocument').countDocuments({ status: { $in: ['pending', 'uploaded', 'under_review'] } }); } catch (_) { /* optional model */ }

  const [vPend, ePend, wPend, bPend, refundsB2c, refundsB2b, dOpen, dReview, wdPending, wdStale, escalated, stuckBatches, actionRequired, recentC, recentB] = await Promise.all([
    Vendor.countDocuments({ approvalStatus: 'pending' }),
    Engineer.countDocuments({ approvalStatus: 'pending' }),
    Worker.countDocuments({ approvalStatus: 'pending' }),
    B2BCompany.countDocuments({ verificationStatus: 'pending' }),
    Transaction.aggregate([{ $match: { type: 'refund', createdAt: { $gte: since30 } } }, { $group: { _id: null, n: { $sum: 1 }, amt: { $sum: '$amount' } } }]),
    B2BWalletTransaction.aggregate([{ $match: { type: { $in: ['escrow_refund', 'refund'] }, createdAt: { $gte: since30 } } }, { $group: { _id: null, n: { $sum: 1 }, amt: { $sum: '$amount' } } }]),
    Dispute.countDocuments({ status: 'open' }),
    Dispute.countDocuments({ status: 'in_review' }),
    Withdrawal.aggregate([{ $match: { status: { $in: ['pending', 'awaiting_manual_transfer', 'processing'] } } }, { $group: { _id: null, n: { $sum: 1 }, amt: { $sum: '$amount' } } }]),
    Withdrawal.countDocuments({ status: 'pending', createdAt: { $lte: new Date(Date.now() - day) } }),
    B2BJob.countDocuments({ status: 'escalated' }),
    B2BBatch.countDocuments({ status: { $in: ['validating', 'processing'] }, updatedAt: { $lte: new Date(Date.now() - 30 * 60 * 1000) } }),
    Booking.countDocuments({ status: 'admin_action_required' }),
    Transaction.find({}).sort({ createdAt: -1 }).limit(8).select('type amount status description createdAt').lean(),
    B2BWalletTransaction.find({}).sort({ createdAt: -1 }).limit(8).select('type amount status remark createdAt').populate('companyId', 'companyName').lean()
  ]);

  const alerts = [];
  if (escalated) alerts.push({ level: 'high', key: 'b2b_escalated', message: `${escalated} B2B job(s) escalated — no engineer or vendor accepted`, link: '/admin/b2b' });
  if (actionRequired) alerts.push({ level: 'high', key: 'booking_action_required', message: `${actionRequired} booking(s) need admin action (auto-assign failed)`, link: '/admin/jobs?bucket=failed' });
  if (wdStale) alerts.push({ level: 'medium', key: 'withdrawals_stale', message: `${wdStale} withdrawal(s) pending for more than 24h`, link: '/admin/settlements' });
  if (stuckBatches) alerts.push({ level: 'medium', key: 'batches_stuck', message: `${stuckBatches} bulk upload(s) stuck in processing for 30+ min`, link: '/admin/b2b' });
  if (dOpen) alerts.push({ level: 'medium', key: 'disputes_open', message: `${dOpen} dispute(s) waiting for review`, link: '/admin/disputes' });

  const recentTransactions = [
    ...recentC.map((t) => ({ source: 'b2c', type: t.type, amount: round2(t.amount), status: t.status, note: t.description, createdAt: t.createdAt })),
    ...recentB.map((t) => ({ source: 'b2b', type: t.type, amount: round2(t.amount), status: t.status, note: `${t.companyId?.companyName || ''} ${t.remark || ''}`.trim(), createdAt: t.createdAt }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);

  res.json({
    success: true,
    data: {
      pendingVerification: { vendors: vPend, engineers: ePend, workers: wPend, b2bCompanies: bPend, documents: verificationDocs, total: vPend + ePend + wPend + bPend + verificationDocs },
      refunds30d: { count: (refundsB2c[0]?.n || 0) + (refundsB2b[0]?.n || 0), amount: round2((refundsB2c[0]?.amt || 0) + (refundsB2b[0]?.amt || 0)) },
      disputes: { open: dOpen, inReview: dReview },
      withdrawals: { pending: wdPending[0]?.n || 0, amount: round2(wdPending[0]?.amt || 0), olderThan24h: wdStale },
      recentTransactions,
      alerts
    }
  });
}));

// ── Reports (spec §15 gaps) ───────────────────────────────────────────────
const rangeMatch = (req, field = 'createdAt') => {
  const { startDate, endDate } = req.query;
  if (!startDate && !endDate) return {};
  const m = {};
  if (startDate) m.$gte = new Date(startDate);
  if (endDate) m.$lte = new Date(`${endDate}T23:59:59.999Z`);
  return { [field]: m };
};
const byMonth = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };

router.get('/reports/refunds', wrap(async (req, res) => {
  const [b2c, b2b] = await Promise.all([
    Transaction.aggregate([{ $match: { type: 'refund', ...rangeMatch(req) } }, { $group: { _id: byMonth, count: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $sort: { _id: 1 } }]),
    B2BWalletTransaction.aggregate([{ $match: { type: { $in: ['escrow_refund', 'refund'] }, ...rangeMatch(req) } }, { $group: { _id: byMonth, count: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $sort: { _id: 1 } }])
  ]);
  res.json({ success: true, data: { b2c: b2c.map((r) => ({ month: r._id, count: r.count, amount: round2(r.amount) })), b2b: b2b.map((r) => ({ month: r._id, count: r.count, amount: round2(r.amount) })) } });
}));

router.get('/reports/withdrawals', wrap(async (req, res) => {
  const rows = await Withdrawal.aggregate([
    { $match: rangeMatch(req) },
    { $group: { _id: { month: byMonth, source: { $ifNull: ['$source', { $cond: [{ $ifNull: ['$vendorId', false] }, 'vendor', { $cond: [{ $ifNull: ['$workerId', false] }, 'worker', 'engineer'] }] }] }, status: '$status' }, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    { $sort: { '_id.month': 1 } }
  ]);
  res.json({ success: true, data: rows.map((r) => ({ month: r._id.month, source: r._id.source, status: r._id.status, count: r.count, amount: round2(r.amount) })) });
}));

router.get('/reports/commission', wrap(async (req, res) => {
  const [b2c, b2b] = await Promise.all([
    Booking.aggregate([
      { $match: { status: { $in: ['completed', 'paid', 'closed'] }, ...rangeMatch(req) } },
      { $group: { _id: byMonth, bookings: { $sum: 1 }, gross: { $sum: { $ifNull: ['$finalAmount', 0] } }, commission: { $sum: { $ifNull: ['$platformEarning', 0] } }, payouts: { $sum: { $ifNull: ['$workerPayout', 0] } }, gst: { $sum: { $ifNull: ['$tax', 0] } } } },
      { $sort: { _id: 1 } }
    ]),
    Transaction.aggregate([
      { $match: { type: 'earnings_credit', 'metadata.source': 'b2b_escrow', ...rangeMatch(req) } },
      { $group: { _id: byMonth, jobs: { $sum: 1 }, gross: { $sum: '$metadata.gross' }, payouts: { $sum: '$amount' }, platformFee: { $sum: '$metadata.platformFee' }, gst: { $sum: '$metadata.gst' } } },
      { $sort: { _id: 1 } }
    ])
  ]);
  res.json({
    success: true,
    data: {
      b2c: b2c.map((r) => ({ month: r._id, bookings: r.bookings, gross: round2(r.gross), commission: round2(r.commission), payouts: round2(r.payouts), gst: round2(r.gst) })),
      b2b: b2b.map((r) => ({ month: r._id, jobs: r.jobs, gross: round2(r.gross), payouts: round2(r.payouts), platformFee: round2(r.platformFee), gst: round2(r.gst), retained: round2(r.gross - r.payouts - r.gst) }))
    }
  });
}));

// Platform-wide B2B view (the per-company reports live under /b2b/reports)
router.get('/reports/b2b-platform', wrap(async (req, res) => {
  const B2BCompany = require('../../models/B2BCompany');
  const B2BWallet = require('../../models/B2BWallet');
  const [jobs, companies, wallets] = await Promise.all([
    B2BJob.aggregate([
      { $match: rangeMatch(req) },
      { $group: { _id: '$companyId', jobs: { $sum: 1 }, completed: { $sum: { $cond: [{ $in: ['$status', ['completed', 'closed']] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'rejected']] }, 1, 0] } }, escalated: { $sum: { $cond: [{ $eq: ['$status', 'escalated'] }, 1, 0] } }, billed: { $sum: { $cond: [{ $in: ['$status', ['completed', 'closed']] }, { $ifNull: ['$charge', 0] }, 0] } } } }
    ]),
    B2BCompany.find({}).select('companyName verificationStatus accountStatus').lean(),
    B2BWallet.find({}).select('companyId balance escrowBalance').lean()
  ]);
  const w = new Map(wallets.map((x) => [String(x.companyId), x]));
  const j = new Map(jobs.map((x) => [String(x._id), x]));
  const rows = companies.map((c) => {
    const s = j.get(String(c._id)) || {};
    const wl = w.get(String(c._id)) || {};
    return {
      companyId: c._id, company: c.companyName, verificationStatus: c.verificationStatus, accountStatus: c.accountStatus || null,
      jobs: s.jobs || 0, completed: s.completed || 0, cancelled: s.cancelled || 0, escalated: s.escalated || 0,
      billed: round2(s.billed), walletBalance: round2(wl.balance), escrow: round2(wl.escrowBalance)
    };
  }).sort((a, b) => b.jobs - a.jobs);
  const totals = rows.reduce((t, r) => {
    for (const k of ['jobs', 'completed', 'cancelled', 'escalated', 'billed', 'walletBalance', 'escrow']) t[k] = round2((t[k] || 0) + r[k]);
    return t;
  }, { companies: rows.length });
  res.json({ success: true, data: { rows, totals } });
}));

module.exports = router;
