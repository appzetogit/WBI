const B2BJob = require('../models/B2BJob');
const B2BCompany = require('../models/B2BCompany');
const B2BContract = require('../models/B2BContract');
const { getSlaProfile, getB2BConfig } = require('./b2bPlatformConfig.service');
const { LIFECYCLE: S } = require('./jobStateMachine');

/**
 * SLA targets and breaches for B2B jobs.
 *
 * Thresholds come from the company's contract when it states them, otherwise
 * from its named SLA profile, otherwise from the platform default profile —
 * they are never hardcoded in a controller or the frontend. Each deadline is
 * stamped onto the job as it reaches the state the clock starts from, and the
 * checker below records a breach exactly once per metric.
 */

const METRICS = ['assignment', 'acceptance', 'arrival', 'response', 'resolution'];

const minutesFrom = (at, minutes) =>
  (minutes && minutes > 0 ? new Date(new Date(at).getTime() + minutes * 60 * 1000) : null);

/** The thresholds that apply to a company: contract → profile → default. */
async function thresholdsFor(companyId) {
  const company = companyId
    ? await B2BCompany.findById(companyId).select('slaProfile activeContractId').lean()
    : null;

  if (company?.activeContractId) {
    const contract = await B2BContract.findById(company.activeContractId).select('sla status').lean();
    const sla = contract?.sla || {};
    const stated = METRICS.some((m) => sla[`${m}Minutes`] != null);
    if (contract?.status === 'ACTIVE' && stated) {
      return { source: 'CONTRACT', name: String(contract._id), ...sla };
    }
  }

  const profile = await getSlaProfile(company?.slaProfile);
  return { source: company?.slaProfile ? 'PROFILE' : 'DEFAULT', name: profile.name, ...profile };
}

/**
 * The deadlines to stamp when a job enters `to`. Returns a patch for the job,
 * empty when this transition starts no clock.
 */
async function deadlinesFor(job, to, at = new Date()) {
  const t = await thresholdsFor(job.companyId);
  const patch = {};

  // The overall clocks start when the job is ready to be routed.
  if ([S.VALIDATED, S.PAYMENT_VERIFIED, S.ROUTED].includes(to) && !job.sla?.resolutionDueAt) {
    const from = job.createdAt || at;
    patch['sla.profile'] = t.name || '';
    patch['sla.assignmentMinutes'] = t.assignmentMinutes ?? null;
    patch['sla.acceptanceMinutes'] = t.acceptanceMinutes ?? null;
    patch['sla.arrivalMinutes'] = t.arrivalMinutes ?? null;
    patch['sla.responseMinutes'] = t.responseMinutes ?? null;
    patch['sla.resolutionMinutes'] = t.resolutionMinutes ?? null;
    patch['sla.assignmentDueAt'] = minutesFrom(from, t.assignmentMinutes);
    patch['sla.responseDueAt'] = minutesFrom(from, t.responseMinutes);
    patch['sla.resolutionDueAt'] = minutesFrom(from, t.resolutionMinutes);
  }

  // Acceptance is owed from the moment an engineer is given the job, and it is
  // also the deadline after which the assignment expires.
  if (to === S.ASSIGNED || to === S.REASSIGNED) {
    const due = minutesFrom(at, t.acceptanceMinutes);
    patch['sla.acceptanceDueAt'] = due;
    if (due) patch.assignmentExpiresAt = due;
  }

  // Arrival is owed from acceptance.
  if (to === S.ACCEPTED) {
    patch['sla.arrivalDueAt'] = minutesFrom(at, t.arrivalMinutes);
    patch.assignmentExpiresAt = null;
  }

  return patch;
}

/** Which deadlines a job in this state is still expected to meet. */
const OPEN_METRICS = {
  assignment: (job, state) => !job.assignedTo && ![S.CLOSED, S.CANCELLED].includes(state),
  acceptance: (job, state) => state === S.ASSIGNED || state === S.REASSIGNED,
  arrival: (job, state) => [S.ACCEPTED, S.EN_ROUTE].includes(state),
  response: (job, state) => !job.startedAt && ![S.CLOSED, S.CANCELLED].includes(state),
  resolution: (job, state) => ![S.CLOSED, S.CANCELLED, S.COMPLETED, S.VERIFICATION].includes(state)
};

/**
 * Record any deadline a job has now missed. Returns the metrics newly
 * breached; a metric is only ever recorded once.
 */
async function checkJobSla(job, at = new Date()) {
  const state = job.lifecycleStatus;
  const already = new Set((job.sla?.breaches || []).map((b) => b.metric));
  const breached = [];

  for (const metric of METRICS) {
    if (already.has(metric)) continue;
    const dueAt = job.sla?.[`${metric}DueAt`];
    if (!dueAt || new Date(dueAt) > at) continue;
    if (!OPEN_METRICS[metric](job, state)) continue;
    breached.push({
      metric,
      dueAt,
      breachedAt: at,
      delayMinutes: Math.round((at - new Date(dueAt)) / 60000)
    });
  }

  if (!breached.length) return [];

  await B2BJob.updateOne({ _id: job._id }, { $push: { 'sla.breaches': { $each: breached } } });

  const { emitAsync } = require('./notification/notificationOrchestrator.service');
  for (const b of breached) {
    try {
      emitAsync('SLA_BREACH', {
        targets: {
          b2bCompanyId: job.companyId,
          vendorId: job.assignedVendorId || undefined,
          engineerId: job.assignedTo || undefined
        },
        data: {
          jobId: String(job._id),
          jobCode: job.jobId,
          metric: b.metric,
          dueAt: b.dueAt,
          delayMinutes: b.delayMinutes,
          message: `SLA breached on ${job.jobId}: ${b.metric} was due ${b.delayMinutes} minute(s) ago.`
        },
        dedupeKey: `sla_breach:${job._id}:${b.metric}`
      });
    } catch (err) {
      console.warn('[SLA] breach notification failed:', err.message);
    }
  }

  return breached;
}

/**
 * Sweep jobs whose deadlines have passed. Called by the scheduler; returns a
 * count so the caller can log what it did.
 */
async function sweepSlaBreaches({ limit = 500, at = new Date() } = {}) {
  const config = await getB2BConfig();
  if (config.sla?.breachNotificationsEnabled === false) return { checked: 0, breached: 0 };

  const open = await B2BJob.find({
    lifecycleStatus: { $nin: [S.CLOSED, S.CANCELLED] },
    $or: METRICS.map((m) => ({ [`sla.${m}DueAt`]: { $ne: null, $lte: at } }))
  })
    .select('jobId companyId assignedTo assignedVendorId lifecycleStatus startedAt sla createdAt')
    .limit(limit)
    .lean();

  let breached = 0;
  for (const job of open) {
    const hits = await checkJobSla(job, at);
    breached += hits.length;
  }
  return { checked: open.length, breached };
}

module.exports = {
  METRICS,
  thresholdsFor,
  deadlinesFor,
  checkJobSla,
  sweepSlaBreaches
};
