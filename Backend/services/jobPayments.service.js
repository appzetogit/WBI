/**
 * Job payments & settlements (read model).
 *
 * Nothing here invents money: every figure comes from the job's charge, the
 * service's configured payment rules (escrowReleaseEngine.computeSplit) and
 * the ledgers written when escrow is released/refunded
 * (VendorFinanceTransaction / EscrowLedger).
 *
 * Job payment status:
 *   PENDING    — funds held in escrow, work not yet verified
 *   PROCESSING — work submitted/verified, payout release in progress
 *   PAID       — released to the vendor (or freelancer) ledger
 *   FAILED     — the release ledger entry failed
 *   REFUNDED   — escrow returned to the B2B client
 *   ADJUSTED   — charge adjusted (e.g. spare-parts visit fee)
 *
 * Settlement = a vendor's jobs closed in a period, aggregated: gross, platform
 * commission (+GST), adjustments, net payable, and whether it has been paid.
 */
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const EnterpriseProjectFlow = require('../models/EnterpriseProjectFlow');
const VendorFinanceTransaction = require('../models/VendorFinanceTransaction');
const { resolvePaymentRules, computeSplit } = require('./escrowReleaseEngine.service');
const { deriveLifecycleFromLegacy, LIFECYCLE: S } = require('./jobStateMachine');

/** Id of a ref that may be populated (a document) or a raw ObjectId. */
const refId = (v) => (v && v._id ? String(v._id) : v ? String(v) : null);
const oid = (v) => new mongoose.Types.ObjectId(refId(v));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const releaseRef = (jobId) => `b2b_job_release:${jobId}`;

const loadRulesForJobs = async (jobs) => {
  const flows = await EnterpriseProjectFlow.find({ b2bJobId: { $in: jobs.map((j) => j._id) } })
    .select('b2bJobId categoryCode configSnapshot')
    .lean();
  const flowByJob = new Map(flows.map((f) => [String(f.b2bJobId), f]));

  const companyIds = [...new Set(jobs.map((j) => refId(j.companyId)).filter(Boolean))];
  const B2BDeductionRule = require('../models/B2BDeductionRule');
  const gstRules = await B2BDeductionRule.find({ companyId: { $in: companyIds.map(oid) }, isActive: true })
    .select('companyId gstPercent')
    .lean();
  const gstByCompany = new Map(gstRules.map((r) => [String(r.companyId), Number.isFinite(Number(r.gstPercent)) ? Number(r.gstPercent) : null]));

  const cache = new Map();
  const rulesByJob = new Map();
  for (const job of jobs) {
    const flow = flowByJob.get(String(job._id));
    const key = `${flow?.categoryCode || job.serviceKey || ''}|${refId(job.companyId)}|${flow ? String(flow._id) : ''}`;
    if (!cache.has(key)) {
      cache.set(key, await resolvePaymentRules(flow?.categoryCode || job.serviceKey, flow?.configSnapshot, gstByCompany.get(refId(job.companyId)) ?? null));
    }
    rulesByJob.set(String(job._id), cache.get(key));
  }
  return rulesByJob;
};

const loadReleases = async (jobs) => {
  const refs = jobs.map((j) => releaseRef(j._id));
  const rows = await VendorFinanceTransaction.find({ referenceCode: { $in: refs } })
    .select('referenceCode amount status occurredAt createdAt transactionCode vendorId')
    .lean();
  return new Map(rows.map((r) => [r.referenceCode, r]));
};

const paymentStatusFor = (job, release) => {
  if (release?.status === 'failed') return 'FAILED';
  if (job.paymentStatus === 'refunded' || job.payoutStatus === 'refunded') return 'REFUNDED';
  if (release || job.payoutStatus === 'released' || job.paymentStatus === 'released') return 'PAID';
  if (job.paymentStatus === 'adjusted') return 'ADJUSTED';
  const state = job.lifecycleStatus || deriveLifecycleFromLegacy(job);
  if ([S.COMPLETED, S.VERIFICATION, S.CLOSED].includes(state)) return 'PROCESSING';
  return 'PENDING';
};

/**
 * Job-level payment rows for the given jobs (lean docs).
 * `perspective`: 'vendor' reports the vendor's net earnings.
 */
const paymentsForJobs = async (jobs, { perspective = 'vendor' } = {}) => {
  if (!jobs.length) return [];
  const [rulesByJob, releases] = await Promise.all([loadRulesForJobs(jobs), loadReleases(jobs)]);
  return jobs.map((job) => {
    const rules = rulesByJob.get(String(job._id));
    const gross = Math.max(0, Number(job.charge) || 0);
    const split = computeSplit(gross, rules || {});
    const release = releases.get(releaseRef(job._id)) || null;
    const earnings = perspective === 'vendor' && job.assignedVendorId ? split.net : split.engineerShare;
    return {
      jobId: String(job._id),
      jobCode: job.jobId,
      source: job.source || 'B2B',
      service: job.service,
      serviceKey: job.serviceKey || null,
      city: job.city,
      vendorId: refId(job.assignedVendorId),
      engineerName: job.assignedToName || null,
      lifecycleStatus: job.lifecycleStatus || deriveLifecycleFromLegacy(job),
      jobAmount: round2(gross),
      commission: round2(split.platformFee),
      gst: round2(split.gst),
      commissionPercent: split.platformPct,
      gstPercent: split.gstPct,
      vendorEarnings: round2(release ? release.amount : earnings),
      adjustment: round2(job.quoteAdjustmentAmount || 0),
      status: paymentStatusFor(job, release),
      paidAt: release ? release.occurredAt || release.createdAt : null,
      reference: release?.transactionCode || null,
      completedAt: job.completedAt || null
    };
  });
};

const periodKey = (date, period) => {
  const d = new Date(date);
  if (period === 'week') {
    const day = (d.getUTCDay() + 6) % 7; // Monday start
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
    const end = new Date(start.getTime() + 7 * 86400000 - 1);
    return { key: start.toISOString().slice(0, 10), start, end };
  }
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1);
  return { key: start.toISOString().slice(0, 7), start, end };
};

/**
 * Settlement statements for a vendor: its closed/eligible jobs grouped by period.
 * @param {string} vendorId
 * @param {{ period?: 'month'|'week', from?: Date, to?: Date }} opts
 */
const settlementsForVendor = async (vendorId, { period = 'month', from = null, to = null } = {}) => {
  const match = {
    assignedVendorId: oid(vendorId),
    $or: [
      { lifecycleStatus: { $in: [S.CLOSED] } },
      { status: { $in: ['completed', 'closed'] }, lifecycleStatus: { $exists: false } },
      { paymentStatus: { $in: ['released', 'adjusted', 'refunded'] } }
    ]
  };
  if (from || to) {
    match.completedAt = {};
    if (from) match.completedAt.$gte = new Date(from);
    if (to) match.completedAt.$lte = new Date(to);
  }
  const jobs = await B2BJob.find(match)
    .select('jobId companyId source service serviceKey city charge paymentStatus payoutStatus quoteAdjustmentAmount assignedVendorId assignedToName lifecycleStatus status completedAt updatedAt')
    .lean();
  const rows = await paymentsForJobs(jobs, { perspective: 'vendor' });

  const groups = new Map();
  for (const row of rows) {
    const when = row.completedAt || row.paidAt || new Date();
    const p = periodKey(when, period);
    if (!groups.has(p.key)) groups.set(p.key, { ...p, rows: [] });
    groups.get(p.key).rows.push(row);
  }

  const shortId = String(vendorId).slice(-6).toUpperCase();
  return [...groups.values()]
    .sort((a, b) => b.start - a.start)
    .map((g) => {
      const eligible = g.rows.filter((r) => r.status !== 'REFUNDED');
      const paid = eligible.filter((r) => r.status === 'PAID');
      const status = !eligible.length
        ? 'NOT_APPLICABLE'
        : paid.length === eligible.length
          ? 'PAID'
          : paid.length > 0
            ? 'PARTIALLY_PAID'
            : eligible.some((r) => r.status === 'FAILED') ? 'FAILED' : 'PENDING';
      const paymentDate = status === 'PAID'
        ? paid.reduce((latest, r) => (!latest || new Date(r.paidAt) > latest ? new Date(r.paidAt) : latest), null)
        : null;
      return {
        settlementId: `STL-${shortId}-${g.key.replace(/-/g, '')}`,
        period: { type: period, key: g.key, start: g.start, end: g.end },
        totalJobs: eligible.length,
        refundedJobs: g.rows.length - eligible.length,
        grossAmount: round2(eligible.reduce((s, r) => s + r.jobAmount, 0)),
        commission: round2(eligible.reduce((s, r) => s + r.commission + r.gst, 0)),
        adjustments: round2(g.rows.reduce((s, r) => s + (r.adjustment || 0), 0)),
        netAmount: round2(eligible.reduce((s, r) => s + r.vendorEarnings, 0)),
        paidAmount: round2(paid.reduce((s, r) => s + r.vendorEarnings, 0)),
        status,
        paymentDate,
        jobs: g.rows
      };
    });
};

module.exports = { paymentsForJobs, settlementsForVendor, paymentStatusFor, releaseRef };
