const cron = require('node-cron');
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const JobAssignment = require('../models/JobAssignment');
const { LIFECYCLE: S } = require('./jobStateMachine');
const { transitionJob } = require('./jobLifecycle.service');
const { sweepSlaBreaches } = require('./b2bSla.service');
const { getB2BConfig } = require('./b2bPlatformConfig.service');

/**
 * Deadline sweeper for B2B jobs.
 *
 * Two things time out on their own:
 *   1. An assignment nobody answered — the job EXPIRES and routing tries the
 *      next eligible provider instead of waiting forever.
 *   2. An SLA deadline that has passed — recorded as a breach and announced.
 *
 * Both run on one cron, on the cluster leader only.
 */

const isDbConnected = () => mongoose.connection.readyState === 1;

/**
 * Expire assignments nobody accepted in time, then put the job back in front
 * of the next candidate. Returns what it did, for logging and tests.
 */
async function expireStaleAssignments({ at = new Date(), limit = 100 } = {}) {
  const stale = await B2BJob.find({
    lifecycleStatus: { $in: [S.ASSIGNED, S.REASSIGNED] },
    assignmentExpiresAt: { $ne: null, $lte: at }
  })
    .select('jobId companyId assignedTo assignedVendorId currentAssignmentId assignmentExpiresAt declinedEngineers')
    .limit(limit)
    .lean();

  const expired = [];
  for (const job of stale) {
    try {
      // Close the open assignment row as expired — history is never rewritten.
      if (job.currentAssignmentId) {
        await JobAssignment.updateOne(
          { _id: job.currentAssignmentId, isOpen: true },
          {
            $set: {
              status: 'expired',
              isOpen: false,
              expiredAt: at,
              closedAt: at,
              closeReason: 'The engineer did not respond in time'
            }
          }
        );
      }

      await transitionJob({
        jobId: job._id,
        to: S.EXPIRED,
        actor: { role: 'system' },
        reason: 'The engineer did not respond in time',
        event: 'REQUEST_EXPIRED',
        expectFrom: [S.ASSIGNED, S.REASSIGNED],
        patch: {
          assignedTo: null,
          assignedToName: null,
          currentAssignmentId: null,
          assignmentExpiresAt: null,
          // Never offer it back to the engineer who let it lapse.
          ...(job.assignedTo
            ? { declinedEngineers: [...(job.declinedEngineers || []), job.assignedTo] }
            : {})
        }
      });

      // Back into the queue for the next eligible provider.
      await transitionJob({
        jobId: job._id,
        to: job.assignedVendorId ? S.PENDING_ASSIGNMENT : S.ROUTED,
        actor: { role: 'system' },
        reason: 'Offering the job to the next eligible provider',
        event: 'ROUTING_RETRY',
        expectFrom: [S.EXPIRED]
      });

      expired.push(String(job._id));

      // A job with no vendor holding it goes back through matching.
      if (!job.assignedVendorId) {
        try {
          const { queueJobMatching } = require('./b2bMatchingService');
          await queueJobMatching(job._id);
        } catch (matchErr) {
          console.warn(`[Timeouts] Re-matching ${job.jobId} failed:`, matchErr.message);
        }
      }

      try {
        const { emitAsync } = require('./notification/notificationOrchestrator.service');
        emitAsync('REQUEST_EXPIRED', {
          targets: {
            b2bCompanyId: job.companyId,
            vendorId: job.assignedVendorId || undefined,
            engineerId: job.assignedTo || undefined
          },
          data: {
            jobId: String(job._id),
            jobCode: job.jobId,
            message: `No response on ${job.jobId} in time — it has gone back to the queue.`
          },
          dedupeKey: `request_expired:${job._id}:${+at}`
        });
      } catch (notifyErr) {
        console.warn('[Timeouts] Expiry notification failed:', notifyErr.message);
      }
    } catch (err) {
      console.warn(`[Timeouts] Could not expire ${job.jobId}:`, err.message);
    }
  }

  return { scanned: stale.length, expired };
}

/** One pass of both sweeps. Exported so tests can run it directly. */
async function runTimeoutSweep(at = new Date()) {
  const assignments = await expireStaleAssignments({ at });
  const sla = await sweepSlaBreaches({ at });
  return { assignments, sla };
}

let task = null;

/** Start the cron. The schedule is admin-configurable (sla.checkCron). */
async function startB2BTimeoutScheduler() {
  if (task) return task;
  let schedule = '*/5 * * * *';
  try {
    const config = await getB2BConfig();
    if (config.sla?.checkCron && cron.validate(config.sla.checkCron)) {
      schedule = config.sla.checkCron;
    }
  } catch (err) {
    console.warn('[Timeouts] Using the default schedule:', err.message);
  }

  task = cron.schedule(schedule, async () => {
    if (!isDbConnected()) return;
    try {
      const result = await runTimeoutSweep();
      if (result.assignments.expired.length || result.sla.breached) {
        console.log(
          `[Timeouts] expired ${result.assignments.expired.length} assignment(s), `
          + `recorded ${result.sla.breached} SLA breach(es)`
        );
      }
    } catch (err) {
      console.error('[Timeouts] Sweep failed:', err.message);
    }
  });
  console.log(`[Timeouts] B2B assignment + SLA sweeper running on "${schedule}"`);
  return task;
}

function stopB2BTimeoutScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
}

module.exports = {
  expireStaleAssignments,
  runTimeoutSweep,
  startB2BTimeoutScheduler,
  stopB2BTimeoutScheduler
};
