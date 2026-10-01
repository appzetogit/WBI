/**
 * Safety net for the project-assignment engine.
 *
 * Vendor response and freelancer-pool timeouts are BullMQ delayed jobs. If a job
 * is lost (Redis restarted without persistence, Redis down when it was scheduled,
 * or the worker threw) the opportunity never advances: the customer's money stays
 * in escrow and nobody is notified. This sweep finds those requests from the
 * database state alone and runs the same handlers the queue would have run.
 */
const cron = require('node-cron');
const mongoose = require('mongoose');
const Opportunity = require('../models/Opportunity');
const ServiceRequest = require('../models/ServiceRequest');

const MINUTE = 60 * 1000;
// Give the queue a head start so the sweep only handles timeouts it really missed.
const GRACE_MS = 10 * MINUTE;
// A paid request normally gets its opportunity within seconds.
const MARKETPLACE_STALL_MS = 15 * MINUTE;
// A refund claim older than this means the process died mid-refund.
const REFUND_STALL_MS = 30 * MINUTE;
const BATCH_LIMIT = 100;

const isDbConnected = () => mongoose.connection.readyState === 1;

const engine = () => require('./projectAssignmentEngine.service');
const payments = () => require('./serviceRequestPayment.service');

/** Run one recovery action; a failure is recorded and never stops the sweep. */
async function attempt(dryRun, entry, action) {
  if (dryRun) return entry;
  try {
    await action();
    return entry;
  } catch (err) {
    console.error('[AssignmentRecovery] action failed', JSON.stringify(entry), err.message);
    return { ...entry, error: err.message };
  }
}

/** Vendor batches whose response window closed but whose timeout never fired. */
async function sweepVendorTimeouts(now, dryRun) {
  const stalled = await Opportunity.find({
    status: 'open',
    'assignment.phase': 'waiting_vendor_acceptance',
    'assignment.activeVendorUntil': { $lt: new Date(now - GRACE_MS) }
  })
    .select('opportunityCode assignment.vendorQueue')
    .limit(BATCH_LIMIT)
    .lean();

  const handled = [];
  for (const opp of stalled) {
    const active = (opp.assignment?.vendorQueue || []).filter((q) => q.status === 'active');
    for (const q of active) {
      handled.push(
        await attempt(dryRun, { opportunityCode: opp.opportunityCode, vendorId: String(q.vendorId) }, () =>
          engine().handleVendorTimeout(opp._id, q.vendorId)
        )
      );
    }
  }
  return handled;
}

/** Freelancer-pool releases nobody claimed within the configured window. */
async function sweepFreelancerPool(now, dryRun) {
  const candidates = await Opportunity.find({
    status: 'open',
    'assignment.phase': 'freelancer_pool',
    'assignment.freelancerLeadEngineerId': null,
    'assignment.freelancerPoolReleasedAt': { $lt: new Date(now - GRACE_MS) }
  })
    .select('opportunityCode assignment.freelancerPoolReleasedAt assignment.configSnapshot')
    .limit(BATCH_LIMIT)
    .lean();

  const handled = [];
  for (const opp of candidates) {
    const timeoutMin = Number(opp.assignment?.configSnapshot?.freelancerPoolTimeoutMinutes) || 120;
    const releasedAt = new Date(opp.assignment.freelancerPoolReleasedAt).getTime();
    if (releasedAt + timeoutMin * MINUTE + GRACE_MS > now) continue;
    handled.push(
      await attempt(dryRun, { opportunityCode: opp.opportunityCode }, () =>
        engine().handleFreelancerPoolTimeout(opp._id)
      )
    );
  }
  return handled;
}

/** Paid (or free) requests that never reached the vendor marketplace. */
async function sweepMissingMarketplace(now, dryRun) {
  const stalled = await ServiceRequest.find({
    opportunityId: null,
    status: 'Pending',
    'payment.status': { $in: ['paid', 'skipped', 'not_required'] },
    updatedAt: { $lt: new Date(now - MARKETPLACE_STALL_MS) }
  })
    .limit(BATCH_LIMIT);

  const handled = [];
  for (const sr of stalled) {
    handled.push(
      await attempt(dryRun, { requestCode: sr.requestCode }, () =>
        payments().ensureMarketplaceForServiceRequest(sr)
      )
    );
  }
  return handled;
}

/** Escrow still held on requests whose assignment already failed (refund failed earlier). */
async function sweepPendingRefunds(now, dryRun) {
  const stuckRefunding = await ServiceRequest.find({
    'payment.status': 'paid',
    'payment.escrowStatus': 'refunding',
    updatedAt: { $lt: new Date(now - REFUND_STALL_MS) }
  })
    .select('_id')
    .limit(BATCH_LIMIT)
    .lean();
  if (!dryRun && stuckRefunding.length) {
    // The refund itself is idempotent (checks Razorpay first), so it is safe to retry.
    await ServiceRequest.updateMany(
      { _id: { $in: stuckRefunding.map((s) => s._id) }, 'payment.escrowStatus': 'refunding' },
      { $set: { 'payment.escrowStatus': 'held' } }
    );
  }

  const held = await ServiceRequest.find({
    'payment.status': 'paid',
    'payment.escrowStatus': { $in: dryRun ? ['held', 'refunding'] : ['held'] },
    opportunityId: { $ne: null }
  })
    .select('requestCode opportunityId')
    .limit(500)
    .lean();
  if (!held.length) return [];

  const failedOpps = await Opportunity.find({
    _id: { $in: held.map((s) => s.opportunityId) },
    status: 'cancelled',
    'assignment.phase': 'expired'
  })
    .select('_id')
    .lean();
  const failed = new Set(failedOpps.map((o) => String(o._id)));

  const handled = [];
  for (const sr of held) {
    if (!failed.has(String(sr.opportunityId))) continue;
    handled.push(
      await attempt(dryRun, { requestCode: sr.requestCode }, () =>
        payments().refundEscrowOnAssignmentFailure(sr._id, {
          reason: 'refund_retry',
          opportunityId: sr.opportunityId
        })
      )
    );
  }
  return handled;
}

/**
 * One pass over every recovery case. With dryRun it only reports what it would do.
 */
async function runAssignmentRecoverySweep({ dryRun = false, now = Date.now() } = {}) {
  const result = {
    vendorTimeouts: await sweepVendorTimeouts(now, dryRun),
    freelancerPoolTimeouts: await sweepFreelancerPool(now, dryRun),
    missingMarketplace: await sweepMissingMarketplace(now, dryRun),
    refundRetries: await sweepPendingRefunds(now, dryRun)
  };
  return result;
}

const countActions = (r) =>
  r.vendorTimeouts.length + r.freelancerPoolTimeouts.length + r.missingMarketplace.length + r.refundRetries.length;

let task = null;
let running = false;

function startAssignmentRecoveryScheduler() {
  if (task) return task;
  if (process.env.ASSIGNMENT_RECOVERY_SWEEP_ENABLED === 'false') {
    console.log('[AssignmentRecovery] disabled (ASSIGNMENT_RECOVERY_SWEEP_ENABLED=false)');
    return null;
  }

  task = cron.schedule('*/5 * * * *', async () => {
    if (!isDbConnected() || running) return;
    running = true;
    try {
      const result = await runAssignmentRecoverySweep();
      if (countActions(result)) {
        console.log('[AssignmentRecovery] recovered', JSON.stringify(result));
      }
    } catch (err) {
      console.error('[AssignmentRecovery] sweep failed:', err.message);
    } finally {
      running = false;
    }
  });
  console.log('[AssignmentRecovery] stalled-assignment sweeper running every 5 minutes');
  return task;
}

module.exports = {
  runAssignmentRecoverySweep,
  startAssignmentRecoveryScheduler
};
