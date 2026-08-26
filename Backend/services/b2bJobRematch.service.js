/**
 * Re-run allocation for a B2B job that stalled or was escalated to admin.
 *
 * Shared by the company panel ("Retry matching") and the admin escalation queue
 * so both paths reset the same state and re-hold escrow identically.
 */
const B2BJob = require('../models/B2BJob');
const Opportunity = require('../models/Opportunity');
const JobHistory = require('../models/JobHistory');
const EnterpriseProjectFlow = require('../models/EnterpriseProjectFlow');

const TERMINAL_STATUSES = ['completed', 'closed', 'cancelled'];
const REMATCHABLE_STATUSES = ['pending', 'searching_engineer', 'escalated', 'failed', 'rejected'];

/**
 * @param {string} jobId          B2BJob _id
 * @param {object} opts
 * @param {string} opts.actorRole 'b2b' | 'admin' | 'system'
 * @param {string} opts.actorId
 * @param {string} opts.note
 */
const rematchB2BJob = async (jobId, { actorRole = 'system', actorId = null, note = '' } = {}) => {
  const job = await B2BJob.findById(jobId);
  if (!job) return { ok: false, status: 404, message: 'Job not found' };

  if (TERMINAL_STATUSES.includes(job.status)) {
    return { ok: false, status: 400, message: `Job is already ${job.status} and cannot be re-matched` };
  }
  if (job.assignedTo) {
    return { ok: false, status: 400, message: 'Job already has an assigned engineer' };
  }
  if (!REMATCHABLE_STATUSES.includes(job.status)) {
    return { ok: false, status: 400, message: `Job in status "${job.status}" cannot be re-matched` };
  }

  const coords = job.coordinates?.coordinates || [];
  if (coords.length !== 2 || (Number(coords[0]) === 0 && Number(coords[1]) === 0)) {
    return {
      ok: false,
      status: 400,
      message: 'Job has no usable site coordinates — fix the address before retrying'
    };
  }

  // Escrow was returned to the wallet when the job escalated; re-hold it so the
  // job is funded again before it is offered to anyone.
  const charge = Number(job.charge) || 0;
  let escrow = { ok: true, skipped: true };
  if (charge > 0) {
    const { holdB2BJobEscrow } = require('./escrowReleaseEngine.service');
    escrow = await holdB2BJobEscrow({
      companyId: job.companyId,
      jobId: job._id,
      amount: charge,
      remark: `Re-match ${job.jobId}`
    });
    if (!escrow.ok) {
      const message =
        escrow.reason === 'insufficient_balance'
          ? 'Wallet balance is insufficient to re-fund this job. Add balance and retry.'
          : `Could not re-hold escrow (${escrow.reason})`;
      return { ok: false, status: 400, message, escrow };
    }
  }

  // Retire the stale opportunity so the assignment engine starts from a clean queue.
  const staleOpportunities = await Opportunity.find({
    'assignment.b2bJobId': job._id,
    status: { $in: ['open', 'cancelled'] }
  }).select('_id status');

  for (const opp of staleOpportunities) {
    try {
      const { cancelFreelancerPoolTimeout } = require('./projectAssignmentEngine.service');
      await cancelFreelancerPoolTimeout(opp._id);
    } catch (_) {
      /* non-blocking */
    }
    if (opp.status !== 'cancelled') {
      opp.status = 'cancelled';
      await opp.save();
    }
  }

  job.status = 'pending';
  job.allocationStage = 'not_started';
  job.allocationReason = note ? String(note).slice(0, 300) : 'Matching restarted';
  job.allocationUpdatedAt = new Date();
  job.currentWave = 0;
  job.waveStartedAt = null;
  job.notifiedEngineers = [];
  job.rematchCount = (job.rematchCount || 0) + 1;
  job.lastRematchAt = new Date();
  if (charge > 0) job.paymentStatus = 'escrow_locked';
  await job.save();

  await JobHistory.create({
    jobId: job._id,
    status: 'pending',
    remark: `Matching restarted by ${actorRole}${note ? ` — ${note}` : ''} (attempt ${job.rematchCount}).`,
    role: actorRole === 'admin' ? 'admin' : 'system'
  }).catch(() => {});

  await EnterpriseProjectFlow.updateOne(
    { b2bJobId: job._id },
    {
      $set: { status: 'assignment_active' },
      $push: {
        timeline: {
          key: 'rematch',
          label: `Matching restarted by ${actorRole}`,
          at: new Date(),
          meta: { actorId: actorId ? String(actorId) : null, attempt: job.rematchCount, note }
        }
      }
    }
  ).catch(() => {});

  const { queueJobMatching } = require('./b2bMatchingService');
  await queueJobMatching(job._id);

  return { ok: true, job, escrow, attempt: job.rematchCount };
};

module.exports = { rematchB2BJob, REMATCHABLE_STATUSES };
