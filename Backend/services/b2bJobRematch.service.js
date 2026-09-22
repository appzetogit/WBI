/**
 * Re-run allocation for a B2B job that stalled or was escalated to admin.
 *
 * Shared by the company panel ("Retry matching") and the admin escalation queue
 * so both paths reset the same state and re-hold escrow identically.
 */
const B2BJob = require('../models/B2BJob');
const Opportunity = require('../models/Opportunity');
const EnterpriseProjectFlow = require('../models/EnterpriseProjectFlow');

const { LIFECYCLE: S } = require('./jobStateMachine');
const { transitionJobPath, lifecycleOf } = require('./jobLifecycle.service');

const TERMINAL_STATUSES = ['completed', 'closed', 'cancelled'];
const REMATCHABLE_STATUSES = ['pending', 'searching_engineer', 'escalated', 'failed', 'rejected'];
/** Canonical states from which routing may be re-run (unowned jobs only). */
const REMATCHABLE_STATES = [
  S.ROUTED, S.UNASSIGNED, S.ON_HOLD, S.REJECTED, S.EXPIRED, S.FAILED,
  S.PENDING_ASSIGNMENT, S.VALIDATED
];

/**
 * @param {string} jobId          B2BJob _id
 * @param {object} opts
 * @param {string} opts.actorRole 'b2b' | 'admin' | 'system'
 * @param {string} opts.actorId
 * @param {string} opts.note
 * @param {number} [opts.expandRadiusKm] widen the last matching wave (admin "expand search")
 */
const rematchB2BJob = async (jobId, { actorRole = 'system', actorId = null, note = '', expandRadiusKm = null } = {}) => {
  const job = await B2BJob.findById(jobId).read('primary');
  if (!job) return { ok: false, status: 404, message: 'Job not found' };

  const state = lifecycleOf(job);
  if (TERMINAL_STATUSES.includes(job.status) || [S.CLOSED, S.CANCELLED].includes(state)) {
    return { ok: false, status: 400, message: `Job is already ${state} and cannot be re-matched` };
  }
  if (job.assignedTo) {
    return { ok: false, status: 400, message: 'Job already has an assigned engineer' };
  }
  if (job.assignedVendorId) {
    return { ok: false, status: 400, message: 'A vendor holds this job; the vendor assigns its engineer' };
  }
  if (!REMATCHABLE_STATES.includes(state)) {
    return { ok: false, status: 400, message: `Job in ${state} cannot be re-matched` };
  }
  if (job.status === 'pending_wallet') {
    return { ok: false, status: 400, message: 'Job is waiting for wallet funding' };
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

  const attempt = (job.rematchCount || 0) + 1;
  const expand = Number(expandRadiusKm) > 0 ? Number(expandRadiusKm) : null;
  const patch = {
    allocationStage: 'not_started',
    allocationReason: note ? String(note).slice(0, 300) : 'Matching restarted',
    allocationUpdatedAt: new Date(),
    currentWave: 0,
    waveStartedAt: null,
    // Engineers who declined stay excluded (declinedEngineers); everyone else
    // may be offered again. Vendors who declined stay out via vendorRejections.
    notifiedEngineers: [],
    notifiedVendors: [],
    rematchCount: attempt,
    lastRematchAt: new Date(),
    ...(expand ? { routingMaxRadiusKm: expand } : {}),
    ...(charge > 0 ? { paymentStatus: 'escrow_locked' } : {})
  };
  const actor = { id: actorId, role: actorRole === 'b2b' ? 'company' : actorRole };
  const remark = `Routing restarted by ${actorRole}${note ? ` — ${note}` : ''}${expand ? ` (search expanded to ${expand} km)` : ''} (attempt ${attempt}).`;

  const steps = [];
  if ([S.REJECTED, S.FAILED].includes(state)) {
    steps.push({ to: S.PENDING_ASSIGNMENT, reason: 'Re-queued for routing', event: 'QUEUED_FOR_ASSIGNMENT' });
  }
  if (state === S.ROUTED) {
    // Already routing (stalled): reset the wave state without a transition.
    await B2BJob.updateOne({ _id: job._id }, { $set: patch });
    const { recordJobEvent } = require('./jobLifecycle.service');
    await recordJobEvent({ jobId: job._id, event: 'ROUTING_RETRY', actor, remark });
  } else {
    steps.push({ to: S.ROUTED, reason: remark, event: 'ROUTING_RETRY', patch, filter: { assignedTo: null, assignedVendorId: null } });
    try {
      await transitionJobPath({ jobId: job._id, steps, actor });
    } catch (err) {
      return { ok: false, status: err.status || 409, message: err.message };
    }
  }

  await EnterpriseProjectFlow.updateOne(
    { b2bJobId: job._id },
    {
      $set: { status: 'assignment_active' },
      $push: {
        timeline: {
          key: 'rematch',
          label: `Matching restarted by ${actorRole}`,
          at: new Date(),
          meta: { actorId: actorId ? String(actorId) : null, attempt, note }
        }
      }
    }
  ).catch(() => {});

  const { queueJobMatching } = require('./b2bMatchingService');
  await queueJobMatching(job._id);

  const fresh = await B2BJob.findById(job._id).read('primary').lean();
  return { ok: true, job: fresh, escrow, attempt };
};

module.exports = { rematchB2BJob, REMATCHABLE_STATUSES, REMATCHABLE_STATES };
