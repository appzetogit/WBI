const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const B2BWalletTransaction = require('../models/B2BWalletTransaction');
const B2BInvoice = require('../models/B2BInvoice');
const walletLedger = require('./b2bWalletLedger.service');
const { buildJobQuery } = require('./b2bReportService');
const { viewFilter } = require('./b2bJobViews');

/**
 * SLA and financial reports for the B2B panel.
 *
 * SLA figures come from the per-job `sla` block the lifecycle stamps
 * (due dates + breaches[]); money comes from the wallet ledger and the
 * pricing snapshot on each job. Nothing here is estimated.
 */

const SLA_METRICS = ['assignment', 'acceptance', 'arrival', 'response', 'resolution'];
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const dateRange = (filters, field) => {
  if (!filters.startDate && !filters.endDate) return {};
  const range = {};
  if (filters.startDate) range.$gte = new Date(filters.startDate);
  if (filters.endDate) {
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return { [field]: range };
};

/** Jobs that carry at least one SLA due date. */
const HAS_SLA = {
  $or: SLA_METRICS.map((m) => ({ [`sla.${m}DueAt`]: { $ne: null } }))
};

async function getSlaReport(companyId, filters = {}) {
  const base = buildJobQuery(companyId, filters);
  const withSla = { ...base, $and: [HAS_SLA] };
  const now = new Date();
  const soon = new Date(now.getTime() + 60 * 60000);
  const open = { $nor: [viewFilter('resolved'), viewFilter('cancelled'), viewFilter('failed')] };

  const [totals] = await B2BJob.aggregate([
    { $match: withSla },
    {
      $group: {
        _id: null,
        jobs: { $sum: 1 },
        breachedJobs: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$sla.breaches', []] } }, 0] }, 1, 0] } }
      }
    }
  ]);

  const byMetric = await B2BJob.aggregate([
    { $match: withSla },
    { $unwind: '$sla.breaches' },
    {
      $group: {
        _id: '$sla.breaches.metric',
        breaches: { $sum: 1 },
        avgDelay: { $avg: '$sla.breaches.delayMinutes' },
        maxDelay: { $max: '$sla.breaches.delayMinutes' }
      }
    }
  ]);

  const metricDue = await B2BJob.aggregate([
    { $match: withSla },
    {
      $group: {
        _id: null,
        ...Object.fromEntries(SLA_METRICS.map((m) => [
          m, { $sum: { $cond: [{ $ne: [{ $ifNull: [`$sla.${m}DueAt`, null] }, null] }, 1, 0] } }
        ]))
      }
    }
  ]);

  const metrics = SLA_METRICS.map((m) => {
    const row = byMetric.find((r) => r._id === m) || {};
    const tracked = metricDue[0]?.[m] || 0;
    const breaches = row.breaches || 0;
    return {
      metric: m,
      tracked,
      breaches,
      attainment: tracked ? round1(((tracked - breaches) / tracked) * 100) : null,
      avgDelayMinutes: row.avgDelay != null ? Math.round(row.avgDelay) : null,
      maxDelayMinutes: row.maxDelay != null ? Math.round(row.maxDelay) : null
    };
  });

  const groupAttainment = async (field) => {
    const rows = await B2BJob.aggregate([
      { $match: withSla },
      {
        $group: {
          _id: `$${field}`,
          jobs: { $sum: 1 },
          breached: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$sla.breaches', []] } }, 0] }, 1, 0] } }
        }
      },
      { $sort: { breached: -1, jobs: -1 } },
      { $limit: 20 }
    ]);
    return rows.map((r) => ({
      name: r._id || 'Unspecified',
      jobs: r.jobs,
      breached: r.breached,
      attainment: r.jobs ? round1(((r.jobs - r.breached) / r.jobs) * 100) : null
    }));
  };

  const trendStart = filters.startDate
    ? new Date(filters.startDate)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const trendRows = await B2BJob.aggregate([
    { $match: { ...base } },
    { $unwind: '$sla.breaches' },
    { $match: { 'sla.breaches.breachedAt': { $gte: trendStart, ...(filters.endDate ? dateRange(filters, 'x').x : {}) } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$sla.breaches.breachedAt', timezone: 'Asia/Kolkata' } },
        breaches: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const [atRisk, overdueOpen, recent, byService, byCity] = await Promise.all([
    B2BJob.find({
      ...base,
      $and: [open, { 'sla.resolutionDueAt': { $gte: now, $lte: soon } }]
    }).select('jobId customerName service city sla.resolutionDueAt assignedToName lifecycleStatus').sort({ 'sla.resolutionDueAt': 1 }).limit(25).lean(),
    B2BJob.countDocuments({ ...base, $and: [open, { 'sla.resolutionDueAt': { $lt: now } }] }),
    B2BJob.aggregate([
      { $match: withSla },
      { $unwind: '$sla.breaches' },
      { $sort: { 'sla.breaches.breachedAt': -1 } },
      { $limit: 50 },
      {
        $project: {
          jobId: 1, customerName: 1, service: 1, city: 1, assignedToName: 1, lifecycleStatus: 1,
          metric: '$sla.breaches.metric', dueAt: '$sla.breaches.dueAt',
          breachedAt: '$sla.breaches.breachedAt', delayMinutes: '$sla.breaches.delayMinutes'
        }
      }
    ]),
    groupAttainment('service'),
    groupAttainment('city')
  ]);

  const jobs = totals?.jobs || 0;
  const breachedJobs = totals?.breachedJobs || 0;
  return {
    summary: {
      jobsWithSla: jobs,
      breachedJobs,
      metJobs: jobs - breachedJobs,
      attainment: jobs ? round1(((jobs - breachedJobs) / jobs) * 100) : null,
      atRiskNextHour: atRisk.length,
      overdueOpen
    },
    metrics,
    trend: trendRows.map((r) => ({ date: r._id, breaches: r.breaches })),
    byService,
    byCity,
    atRisk: atRisk.map((j) => ({
      _id: j._id, jobId: j.jobId, customerName: j.customerName, service: j.service, city: j.city,
      engineer: j.assignedToName, lifecycleStatus: j.lifecycleStatus,
      dueAt: j.sla?.resolutionDueAt,
      minutesLeft: j.sla?.resolutionDueAt ? Math.round((new Date(j.sla.resolutionDueAt) - now) / 60000) : null
    })),
    recentBreaches: recent
  };
}

async function getFinancialReport(companyId, filters = {}) {
  const cId = new mongoose.Types.ObjectId(String(companyId));
  const txnMatch = { companyId: cId, status: { $nin: ['failed', 'pending'] }, ...dateRange(filters, 'createdAt') };

  const byType = await B2BWalletTransaction.aggregate([
    { $match: txnMatch },
    {
      $group: {
        _id: { type: { $ifNull: ['$ledgerType', { $toUpper: '$type' }] }, mode: { $ifNull: ['$paymentMode', 'REAL'] } },
        count: { $sum: 1 },
        amount: { $sum: { $abs: { $ifNull: ['$totalAmount', '$amount'] } } }
      }
    }
  ]);

  const LEGACY_TO_LEDGER = {
    TOPUP: 'TOP_UP', ESCROW_HOLD: 'JOB_RESERVATION', JOB_DEDUCTION: 'JOB_CHARGE',
    ESCROW_RELEASE: 'RELEASE'
  };
  const totals = {};
  const demo = {};
  for (const r of byType) {
    const key = LEGACY_TO_LEDGER[r._id.type] || r._id.type;
    const bucket = r._id.mode === 'DEMO' ? demo : totals;
    bucket[key] = bucket[key] || { count: 0, amount: 0 };
    bucket[key].count += r.count;
    bucket[key].amount = round2(bucket[key].amount + r.amount);
  }

  const jobMatch = { ...buildJobQuery(companyId, filters), walletStatus: 'charged' };
  const [byService, byCity, composition] = await Promise.all([
    B2BJob.aggregate([
      { $match: jobMatch },
      { $group: { _id: '$service', jobs: { $sum: 1 }, amount: { $sum: { $ifNull: ['$pricing.totalAmount', '$charge'] } } } },
      { $sort: { amount: -1 } },
      { $limit: 20 }
    ]),
    B2BJob.aggregate([
      { $match: jobMatch },
      { $group: { _id: '$city', jobs: { $sum: 1 }, amount: { $sum: { $ifNull: ['$pricing.totalAmount', '$charge'] } } } },
      { $sort: { amount: -1 } },
      { $limit: 20 }
    ]),
    B2BJob.aggregate([
      { $match: jobMatch },
      {
        $group: {
          _id: null,
          jobs: { $sum: 1 },
          base: { $sum: '$pricing.baseAmount' },
          geographic: { $sum: '$pricing.geographicSurcharge' },
          priority: { $sum: '$pricing.priorityCharge' },
          sla: { $sum: '$pricing.slaCharge' },
          emergency: { $sum: '$pricing.emergencyCharge' },
          afterHours: { $sum: '$pricing.afterHoursCharge' },
          additional: { $sum: '$pricing.additionalCharges' },
          discount: { $sum: '$pricing.discount' },
          tax: { $sum: '$pricing.taxAmount' },
          total: { $sum: '$pricing.totalAmount' }
        }
      }
    ])
  ]);

  const now = new Date();
  const monthsStart = filters.startDate ? new Date(filters.startDate) : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const monthly = await B2BWalletTransaction.aggregate([
    { $match: { companyId: cId, status: { $nin: ['failed', 'pending'] }, paymentMode: { $ne: 'DEMO' }, createdAt: { $gte: monthsStart, ...(dateRange(filters, 'x').x || {}) } } },
    {
      $group: {
        _id: {
          month: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Kolkata' } },
          type: { $ifNull: ['$ledgerType', { $toUpper: '$type' }] }
        },
        amount: { $sum: { $abs: { $ifNull: ['$totalAmount', '$amount'] } } }
      }
    },
    { $sort: { '_id.month': 1 } }
  ]);
  const monthMap = new Map();
  for (const r of monthly) {
    const m = monthMap.get(r._id.month) || { month: r._id.month, topUps: 0, charges: 0, refunds: 0 };
    const t = LEGACY_TO_LEDGER[r._id.type] || r._id.type;
    if (t === 'TOP_UP') m.topUps = round2(m.topUps + r.amount);
    else if (t === 'JOB_CHARGE') m.charges = round2(m.charges + r.amount);
    else if (t === 'REFUND' || t === 'RELEASE') m.refunds = round2(m.refunds + r.amount);
    monthMap.set(r._id.month, m);
  }

  const invoiceMatch = { companyId: cId, ...dateRange(filters, 'invoiceDate') };
  const invoices = await B2BInvoice.aggregate([
    { $match: invoiceMatch },
    { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: { $ifNull: ['$totalAmount', '$amount'] } } } }
  ]);

  const balance = await walletLedger.getBalance(companyId);
  const c = composition[0] || {};
  const amt = (k) => totals[k]?.amount || 0;

  return {
    balance: {
      available: balance.available,
      reserved: balance.reserved,
      total: balance.total,
      creditLimit: balance.creditLimit,
      spendable: balance.spendable
    },
    summary: {
      topUps: amt('TOP_UP'),
      reserved: amt('JOB_RESERVATION'),
      charged: amt('JOB_CHARGE'),
      released: amt('RELEASE'),
      refunds: amt('REFUND'),
      adjustments: amt('ADJUSTMENT'),
      reversals: amt('REVERSAL'),
      netSpend: round2(amt('JOB_CHARGE') - amt('REFUND')),
      chargedJobs: c.jobs || 0,
      avgCostPerJob: c.jobs ? round2((c.total || 0) / c.jobs) : null
    },
    byLedgerType: Object.entries(totals).map(([type, v]) => ({ type, ...v })),
    demo: Object.entries(demo).map(([type, v]) => ({ type, ...v })),
    composition: c.jobs ? {
      base: round2(c.base), geographic: round2(c.geographic), priority: round2(c.priority), sla: round2(c.sla),
      emergency: round2(c.emergency), afterHours: round2(c.afterHours), additional: round2(c.additional),
      discount: round2(c.discount), tax: round2(c.tax), total: round2(c.total)
    } : null,
    byService: byService.map((r) => ({ name: r._id || 'Unspecified', jobs: r.jobs, amount: round2(r.amount) })),
    byCity: byCity.map((r) => ({ name: r._id || 'Unspecified', jobs: r.jobs, amount: round2(r.amount) })),
    monthly: Array.from(monthMap.values()),
    invoices: invoices.map((r) => ({ status: r._id || 'Unknown', count: r.count, amount: round2(r.amount) }))
  };
}

module.exports = { getSlaReport, getFinancialReport, SLA_METRICS };
