/**
 * Job lifecycle service — the ONLY code path allowed to change a job's
 * status. Every call:
 *   1. re-reads the job from the primary,
 *   2. validates from → to against services/jobStateMachine.js,
 *   3. applies the change with a compare-and-set on the current state, so two
 *      racing callers can never both win,
 *   4. appends a JobHistory row (the backend-sourced timeline),
 *   5. notifies every panel that can see the job.
 */
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const JobHistory = require('../models/JobHistory');
const {
  LIFECYCLE: S,
  LABELS,
  JobTransitionError,
  assertTransition,
  deriveLifecycleFromLegacy,
  toLegacy
} = require('./jobStateMachine');

const HISTORY_ROLE = {
  admin: 'admin',
  super_admin: 'admin',
  vendor: 'vendor',
  company: 'company',
  b2b: 'company',
  engineer: 'engineer',
  system: 'system'
};

const normalizeActor = (actor = {}) => {
  const role = HISTORY_ROLE[String(actor.role || 'system').toLowerCase()] || 'system';
  const id = actor.id && mongoose.Types.ObjectId.isValid(String(actor.id))
    ? new mongoose.Types.ObjectId(String(actor.id))
    : null;
  return { id, role };
};

const idStr = (v) => (v ? String(v._id || v) : null);

/**
 * Rooms that must hear about a change to this job: the owning company, admin,
 * the vendor holding it, the engineer holding it, anyone who joined the
 * job room, plus any extra rooms the caller names (e.g. a replaced engineer).
 */
const roomsForJob = (job, extraRooms = []) => {
  const rooms = new Set(['admin', `job:${idStr(job)}`]);
  if (job.companyId) rooms.add(`b2b:${idStr(job.companyId)}`);
  if (job.assignedVendorId) rooms.add(`vendor:${idStr(job.assignedVendorId)}`);
  if (job.assignedTo) rooms.add(`engineer:${idStr(job.assignedTo)}`);
  extraRooms.filter(Boolean).forEach((r) => rooms.add(r));
  return [...rooms];
};

const emitJobStatus = (job, { from, to, actor, reason, extraRooms = [] } = {}) => {
  try {
    const { getIO } = require('../sockets');
    const io = getIO();
    if (!io) return;
    const payload = {
      jobId: idStr(job),
      jobCode: job.jobId,
      status: job.status,
      trackingStatus: job.trackingStatus,
      lifecycleStatus: job.lifecycleStatus,
      from,
      to,
      source: job.source,
      engineerId: idStr(job.assignedTo),
      assignedToName: job.assignedToName || null,
      vendorId: idStr(job.assignedVendorId),
      actorRole: actor?.role || 'system',
      reason: reason || null,
      updatedAt: job.lifecycleUpdatedAt || new Date()
    };
    const rooms = roomsForJob(job, extraRooms);
    // Legacy event every existing panel already listens to, plus the
    // canonical lifecycle event.
    io.to(rooms).emit('b2b:jobStatusUpdated', payload);
    io.to(rooms).emit('job:statusChanged', payload);
  } catch (err) {
    console.warn('[jobLifecycle] socket emit failed:', err.message);
  }
};

const readFresh = (jobId, session) => {
  const q = B2BJob.findById(jobId).read('primary').lean();
  if (session) q.session(session);
  return q;
};

/**
 * Move a job to `to`.
 *
 * @param {object}   opts
 * @param {string}   opts.jobId
 * @param {string}   opts.to        canonical target state
 * @param {object}   opts.actor     { id, role } — who is doing this
 * @param {string}   [opts.reason]  human remark for the timeline
 * @param {object}   [opts.patch]   extra fields set atomically with the state
 * @param {object}   [opts.unset]   fields to $unset atomically
 * @param {object}   [opts.filter]  extra preconditions (e.g. { assignedVendorId: null })
 * @param {string[]} [opts.expectFrom] reject unless the job is currently in one of these
 * @param {string}   [opts.event]   machine key for the timeline row
 * @param {object}   [opts.meta]    structured detail for the timeline row
 * @param {string[]} [opts.extraRooms]
 * @param {object}   [opts.session]
 * @param {boolean}  [opts.emit=true]
 * @returns {Promise<object>} updated job (lean)
 */
/** Catalog event for each state a job can enter. */
const EVENT_FOR_STATE = {
  [S.ROUTED]: 'JOB_ROUTED',
  [S.ASSIGNED]: 'ENGINEER_ASSIGNED',
  [S.REASSIGNED]: 'ENGINEER_ASSIGNED',
  [S.ACCEPTED]: 'ENGINEER_ACCEPTED',
  [S.REJECTED]: 'ENGINEER_REJECTED',
  [S.EN_ROUTE]: 'EN_ROUTE',
  [S.ARRIVED]: 'ARRIVED',
  [S.IN_PROGRESS]: 'WORK_STARTED',
  [S.COMPLETED]: 'WORK_COMPLETED',
  [S.CLOSED]: 'JOB_CLOSED'
};

/**
 * Fire the catalog event for a state change. Never blocks or fails the
 * transition — a notification problem must not roll back a job's state.
 */
function notifyLifecycle(job, to, reason) {
  // A vendor taking the job is PENDING_ASSIGNMENT with a vendor on it.
  const eventKey = to === S.PENDING_ASSIGNMENT
    ? (job.assignedVendorId ? 'VENDOR_ASSIGNED' : null)
    : EVENT_FOR_STATE[to];
  if (!eventKey) return;

  try {
    const { emitAsync } = require('./notification/notificationOrchestrator.service');
    emitAsync(eventKey, {
      targets: {
        b2bCompanyId: job.companyId || undefined,
        vendorId: job.assignedVendorId || undefined,
        engineerId: job.assignedTo || undefined
      },
      data: {
        jobId: String(job._id),
        jobCode: job.jobId,
        service: job.service,
        city: job.city,
        engineerName: job.assignedToName || undefined,
        vendorName: job.assignedVendorName || undefined,
        reason: reason || undefined
      },
      dedupeKey: `${eventKey}:${job._id}:${job.lifecycleUpdatedAt ? +new Date(job.lifecycleUpdatedAt) : Date.now()}`
    });
  } catch (err) {
    console.warn('[Lifecycle] Notification skipped:', err.message);
  }
}

const transitionJob = async ({
  jobId,
  to,
  actor = {},
  reason = '',
  patch = {},
  unset = null,
  filter = {},
  expectFrom = null,
  event = null,
  meta = undefined,
  extraRooms = [],
  session = null,
  emit = true
}) => {
  const job = await readFresh(jobId, session);
  if (!job) {
    throw new JobTransitionError('Job not found', { to, status: 404, code: 'NOT_FOUND' });
  }

  const from = job.lifecycleStatus || deriveLifecycleFromLegacy(job);
  if (expectFrom && !expectFrom.includes(from)) {
    throw new JobTransitionError(
      `Job is ${from}; this action requires ${expectFrom.join(' or ')}`,
      { from, to }
    );
  }

  const jobAfter = { ...job, ...patch };
  assertTransition(from, to, jobAfter);

  const legacy = toLegacy(to, jobAfter, from);
  const now = new Date();
  const set = {
    ...patch,
    lifecycleStatus: to,
    lifecycleUpdatedAt: now,
    status: legacy.status
  };
  if (legacy.trackingStatus) set.trackingStatus = legacy.trackingStatus;
  // Remember where a job was paused so Resume can return it there.
  if (to === S.ON_HOLD) set.onHoldFrom = from;

  // Stamp the SLA deadlines this transition starts (assignment, acceptance,
  // arrival, response, resolution) from the company contract or SLA profile.
  try {
    const { deadlinesFor } = require('./b2bSla.service');
    Object.assign(set, await deadlinesFor(job, to, now));
  } catch (slaErr) {
    console.warn('[Lifecycle] SLA deadlines skipped:', slaErr.message);
  }

  // Compare-and-set on the state we validated against.
  const cas = { _id: job._id, ...filter };
  if (job.lifecycleStatus) cas.lifecycleStatus = from;
  else {
    cas.lifecycleStatus = { $exists: false };
    cas.status = job.status;
  }

  const update = { $set: set };
  if (unset) update.$unset = unset;

  const updated = await B2BJob.findOneAndUpdate(cas, update, {
    new: true,
    lean: true,
    runValidators: true,
    lifecycleManaged: true,
    ...(session ? { session } : {})
  });

  if (!updated) {
    throw new JobTransitionError(
      'This job was changed by someone else while your action was in progress. Refresh and try again.',
      { from, to, status: 409, code: 'CONCURRENT_UPDATE' }
    );
  }

  const who = normalizeActor(actor);
  const historyDoc = {
    jobId: updated._id,
    status: legacy.status,
    fromStatus: from,
    toStatus: to,
    event: event || `STATUS_${to}`,
    changedBy: who.id,
    role: who.role,
    remark: reason || LABELS[to] || to,
    meta
  };
  if (session) await JobHistory.create([historyDoc], { session });
  else await JobHistory.create(historyDoc);

  if (emit) emitJobStatus(updated, { from, to, actor: who, reason, extraRooms });

  // Announce the state change on the notification catalog (in-app, push,
  // email per event). EXPIRED is announced by the timeout sweeper, which
  // knows why it expired, so it is not repeated here.
  if (emit) notifyLifecycle(updated, to, reason);
  // A cancelled/failed job no longer needs its parts: reservations go back to
  // stock. Inside a transaction the caller does this after commit.
  if (!session && (to === S.CANCELLED || to === S.FAILED)) {
    setImmediate(() => {
      require('./jobParts.service').releaseJobParts(updated._id, `Job ${to === S.CANCELLED ? 'cancelled' : 'closed as failed'}`)
        .catch((err) => console.warn('[jobLifecycle] parts release failed:', err.message));
    });
  }
  return updated;
};

/**
 * Walk the job through several states in order (each step validated and
 * recorded), e.g. REJECTED → PENDING_ASSIGNMENT → ASSIGNED.
 * Steps whose target equals the current state are skipped.
 */
const transitionJobPath = async ({ jobId, steps = [], actor, session = null, extraRooms = [] }) => {
  let job = null;
  for (const step of steps) {
    const current = job || (await readFresh(jobId, session));
    const currentState = current.lifecycleStatus || deriveLifecycleFromLegacy(current);
    if (currentState === step.to) {
      job = current;
      continue;
    }
    job = await transitionJob({ jobId, actor, session, extraRooms, ...step });
  }
  return job || readFresh(jobId, session);
};

/** Append a non-transition event to the timeline (vendor notified, retry…). */
const recordJobEvent = async ({ jobId, event, actor = {}, remark = '', meta = undefined, session = null }) => {
  const job = await readFresh(jobId, session);
  if (!job) return null;
  const who = normalizeActor(actor);
  const state = job.lifecycleStatus || deriveLifecycleFromLegacy(job);
  const doc = {
    jobId: job._id,
    status: job.status,
    fromStatus: state,
    toStatus: state,
    event,
    changedBy: who.id,
    role: who.role,
    remark,
    meta
  };
  if (session) return (await JobHistory.create([doc], { session }))[0];
  return JobHistory.create(doc);
};

/** Current canonical state of a (possibly legacy) job document. */
const lifecycleOf = (job) => (job ? job.lifecycleStatus || deriveLifecycleFromLegacy(job) : null);

module.exports = {
  transitionJob,
  transitionJobPath,
  recordJobEvent,
  emitJobStatus,
  roomsForJob,
  lifecycleOf,
  normalizeActor
};
