/**
 * Job lifecycle state machine — the single source of truth for which status
 * transitions a Job/Work Order (B2BJob) may make.
 *
 * Canonical states live in B2BJob.lifecycleStatus. The legacy `status` /
 * `trackingStatus` fields are still read by the TazkY engineer app, the B2B
 * portal and admin screens, so every canonical transition also writes the
 * matching legacy values (see toLegacy). Nothing outside this module decides
 * whether a transition is legal.
 */

const LIFECYCLE = Object.freeze({
  CREATED: 'CREATED',
  VALIDATED: 'VALIDATED',
  PRICED: 'PRICED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
  // Spec name ROUTING; stored as ROUTED (persisted value kept for existing data and clients).
  ROUTED: 'ROUTED',
  PENDING_ASSIGNMENT: 'PENDING_ASSIGNMENT',
  ASSIGNED: 'ASSIGNED',
  ACCEPTED: 'ACCEPTED',
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  VERIFICATION: 'VERIFICATION',
  CLOSED: 'CLOSED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  ON_HOLD: 'ON_HOLD',
  REASSIGNED: 'REASSIGNED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  UNASSIGNED: 'UNASSIGNED'
});

const S = LIFECYCLE;

/**
 * Allowed transitions. Side states (REJECTED, CANCELLED, ON_HOLD, REASSIGNED,
 * FAILED) are only reachable from the primary states listed here.
 */
const TRANSITIONS = Object.freeze({
  [S.CREATED]: [S.VALIDATED, S.CANCELLED],
  [S.VALIDATED]: [S.PRICED, S.ROUTED, S.PENDING_ASSIGNMENT, S.CANCELLED],
  // Payment stages: a job is routed only once its price is reserved/paid.
  [S.PRICED]: [S.PAYMENT_PENDING, S.PAYMENT_VERIFIED, S.CANCELLED],
  [S.PAYMENT_PENDING]: [S.PAYMENT_VERIFIED, S.CANCELLED],
  [S.PAYMENT_VERIFIED]: [S.ROUTED, S.CANCELLED],
  [S.ROUTED]: [S.PENDING_ASSIGNMENT, S.ASSIGNED, S.UNASSIGNED, S.ON_HOLD, S.CANCELLED],
  // No eligible provider: parked with a stated reason until retried, re-routed or assigned by hand.
  [S.UNASSIGNED]: [S.ROUTED, S.PENDING_ASSIGNMENT, S.CANCELLED],
  [S.PENDING_ASSIGNMENT]: [S.ASSIGNED, S.ON_HOLD, S.ROUTED, S.UNASSIGNED, S.CANCELLED],
  [S.ASSIGNED]: [S.ACCEPTED, S.REJECTED, S.EXPIRED, S.REASSIGNED, S.CANCELLED],
  // The engineer did not answer in time: fall back to the next eligible provider.
  [S.EXPIRED]: [S.PENDING_ASSIGNMENT, S.ROUTED],
  [S.ACCEPTED]: [S.EN_ROUTE, S.CANCELLED, S.REASSIGNED],
  [S.EN_ROUTE]: [S.ARRIVED, S.ON_HOLD, S.REASSIGNED],
  [S.ARRIVED]: [S.IN_PROGRESS, S.ON_HOLD, S.REASSIGNED],
  [S.IN_PROGRESS]: [S.COMPLETED, S.ON_HOLD, S.FAILED],
  [S.COMPLETED]: [S.VERIFICATION, S.CLOSED],
  [S.VERIFICATION]: [S.CLOSED, S.IN_PROGRESS],
  // Resume returns a held job to where it was paused (see onHoldFrom).
  [S.ON_HOLD]: [S.ROUTED, S.PENDING_ASSIGNMENT, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.REASSIGNED, S.CANCELLED],
  [S.REJECTED]: [S.PENDING_ASSIGNMENT, S.ROUTED],
  [S.REASSIGNED]: [S.ASSIGNED],
  [S.FAILED]: [S.PENDING_ASSIGNMENT],
  [S.CANCELLED]: [],
  [S.CLOSED]: []
});

const TERMINAL_STATES = Object.freeze([S.CLOSED, S.CANCELLED]);

/** States in which an engineer is holding the job (workload + "busy"). */
const ENGINEER_ACTIVE_STATES = Object.freeze([
  S.ASSIGNED, S.ACCEPTED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS
]);

/** States that mean "nobody is doing this job yet". */
const UNASSIGNED_STATES = Object.freeze([
  S.CREATED, S.VALIDATED, S.PRICED, S.PAYMENT_PENDING, S.PAYMENT_VERIFIED, S.ROUTED,
  S.PENDING_ASSIGNMENT, S.ON_HOLD, S.REJECTED, S.EXPIRED, S.UNASSIGNED
]);

/**
 * Context guards: transitions that are in the table but only make sense when
 * the job carries the right data.
 * Each guard returns null when OK, or a human-readable reason when not.
 */
const GUARDS = {
  [`${S.ON_HOLD}>${S.IN_PROGRESS}`]: (job) =>
    job.startedAt ? null : 'Only a job whose work had already started can resume to IN_PROGRESS',
  [`${S.ON_HOLD}>${S.EN_ROUTE}`]: (job) =>
    job.assignedTo && !job.startedAt ? null : 'Only a job paused before work started, with an engineer on it, can resume travel',
  [`${S.ON_HOLD}>${S.ARRIVED}`]: (job) =>
    job.assignedTo && !job.startedAt ? null : 'Only a job paused on site before work started, with an engineer on it, can resume',
  [`${S.FAILED}>${S.PENDING_ASSIGNMENT}`]: (job) =>
    job.reopenBlocked || job.requiresNewJob
      ? 'This job was closed as incomplete and requires a new job ticket'
      : null,
  [`${S.ON_HOLD}>${S.REASSIGNED}`]: (job) =>
    job.assignedTo ? null : 'A held job without an engineer is re-queued, not reassigned',
  [`*>${S.ASSIGNED}`]: (job) =>
    job.assignedTo ? null : 'An engineer must be set to move a job to ASSIGNED'
};

class JobTransitionError extends Error {
  constructor(message, { from = null, to = null, status = 409, code = 'INVALID_TRANSITION' } = {}) {
    super(message);
    this.name = 'JobTransitionError';
    this.from = from;
    this.to = to;
    this.status = status;
    this.code = code;
  }
}

const isKnownState = (state) => Object.prototype.hasOwnProperty.call(TRANSITIONS, state);

const allowedFrom = (from) => (isKnownState(from) ? TRANSITIONS[from] : []);

/** Every state that may transition into `to` (used for atomic conditional updates). */
const predecessorsOf = (to) =>
  Object.keys(TRANSITIONS).filter((from) => TRANSITIONS[from].includes(to));

const canTransition = (from, to) => allowedFrom(from).includes(to);

/**
 * Throws JobTransitionError unless `from → to` is allowed for this job.
 * `jobAfter` is the job as it will look after the patch is applied (guards
 * such as "*>ASSIGNED requires assignedTo" inspect the new values).
 */
const assertTransition = (from, to, jobAfter = {}) => {
  if (!isKnownState(to)) {
    throw new JobTransitionError(`Unknown job status "${to}"`, { from, to, status: 400, code: 'UNKNOWN_STATUS' });
  }
  if (!isKnownState(from)) {
    throw new JobTransitionError(`Job is in an unknown status "${from}"`, { from, to, status: 409 });
  }
  if (!canTransition(from, to)) {
    const allowed = allowedFrom(from);
    throw new JobTransitionError(
      `Cannot move job from ${from} to ${to}. Allowed from ${from}: ${allowed.length ? allowed.join(', ') : 'none (terminal)'}`,
      { from, to }
    );
  }
  const guard = GUARDS[`${from}>${to}`] || GUARDS[`*>${to}`];
  const reason = guard ? guard(jobAfter) : null;
  if (reason) {
    throw new JobTransitionError(reason, { from, to });
  }
};

/**
 * Canonical state implied by legacy fields. Used to backfill documents
 * created before lifecycleStatus existed, and to classify writes that only
 * touch the legacy `status` field.
 */
const deriveLifecycleFromLegacy = (job = {}) => {
  const stage = job.allocationStage;
  switch (job.status) {
    case 'pending_wallet':
      return S.VALIDATED;
    case 'pending':
      if (['engineer_waves', 'vendor_marketplace', 'freelancer_pool'].includes(stage)) return S.ROUTED;
      if (job.assignedVendorId && !job.assignedTo) return S.PENDING_ASSIGNMENT;
      return S.VALIDATED;
    case 'searching_engineer':
      return S.ROUTED;
    case 'accepted':
      if (job.assignedTo) return S.ACCEPTED;
      return job.assignedVendorId ? S.PENDING_ASSIGNMENT : S.ROUTED;
    case 'assigned':
      return job.assignedTo ? S.ASSIGNED : S.PENDING_ASSIGNMENT;
    case 'travelling':
      return S.EN_ROUTE;
    case 'arrived':
      return S.ARRIVED;
    case 'in_progress':
    case 'revision_required':
      return S.IN_PROGRESS;
    case 'completion_submitted':
      return S.COMPLETED;
    case 'admin_review':
      return S.VERIFICATION;
    case 'completed':
    case 'closed':
      return S.CLOSED;
    case 'on_hold':
    case 'escalated':
      return S.ON_HOLD;
    case 'rejected':
      return S.REJECTED;
    case 'cancelled':
      return S.CANCELLED;
    case 'failed':
      return S.FAILED;
    default:
      return S.CREATED;
  }
};

const TRACKING_FOR = {
  [S.ASSIGNED]: 'assigned',
  [S.REASSIGNED]: 'assigned',
  [S.ACCEPTED]: 'accepted',
  [S.EN_ROUTE]: 'en_route',
  [S.ARRIVED]: 'reached_location',
  [S.IN_PROGRESS]: 'work_started',
  [S.COMPLETED]: 'completion_submitted',
  [S.VERIFICATION]: 'completion_submitted',
  [S.CLOSED]: 'completed',
  [S.CANCELLED]: 'cancelled',
  [S.FAILED]: 'failed',
  [S.REJECTED]: 'rejected'
};

/**
 * Legacy status/trackingStatus to write for a canonical state. `jobAfter` is
 * the job with the transition patch applied; `from` is the previous
 * canonical state. When the job's current legacy status already maps to the
 * target canonical state it is kept, so clients don't see needless churn.
 */
const toLegacy = (to, jobAfter = {}, from = null) => {
  const current = jobAfter.status;
  const currentMaps = current && deriveLifecycleFromLegacy(jobAfter) === to;

  let status;
  switch (to) {
    case S.CREATED:
      status = 'pending';
      break;
    case S.VALIDATED:
      status = current === 'pending_wallet' ? 'pending_wallet' : 'pending';
      break;
    case S.PRICED:
    case S.PAYMENT_PENDING:
      status = 'pending_wallet';
      break;
    case S.PAYMENT_VERIFIED:
    case S.EXPIRED:
      status = 'pending';
      break;
    case S.UNASSIGNED:
      status = 'escalated';
      break;
    case S.ROUTED:
      status = currentMaps ? current : 'searching_engineer';
      break;
    case S.PENDING_ASSIGNMENT:
      // Vendor-held jobs have always been "accepted" (by the vendor) with no
      // engineer; unowned jobs waiting for a human are "pending".
      status = jobAfter.assignedVendorId ? 'accepted' : 'pending';
      break;
    case S.ASSIGNED:
    case S.REASSIGNED:
      status = 'assigned';
      break;
    case S.ACCEPTED:
      status = 'accepted';
      break;
    case S.EN_ROUTE:
      status = 'travelling';
      break;
    case S.ARRIVED:
      status = 'arrived';
      break;
    case S.IN_PROGRESS:
      status = from === S.VERIFICATION ? 'revision_required' : 'in_progress';
      break;
    case S.COMPLETED:
    case S.VERIFICATION:
      status = current === 'admin_review' ? 'admin_review' : 'completion_submitted';
      break;
    case S.CLOSED:
      status = current === 'closed' ? 'closed' : 'completed';
      break;
    case S.ON_HOLD:
      status = [S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS].includes(from) || jobAfter.startedAt ? 'on_hold' : 'escalated';
      break;
    case S.REJECTED:
      status = 'rejected';
      break;
    case S.CANCELLED:
      status = 'cancelled';
      break;
    case S.FAILED:
      status = 'failed';
      break;
    default:
      status = current;
  }

  let trackingStatus = TRACKING_FOR[to] || null;
  if (to === S.IN_PROGRESS && from === S.VERIFICATION) trackingStatus = 'revision_required';
  return { status, trackingStatus };
};

/** Human label for timelines. */
const LABELS = Object.freeze({
  [S.CREATED]: 'Created',
  [S.VALIDATED]: 'Validated',
  [S.PRICED]: 'Priced',
  [S.PAYMENT_PENDING]: 'Payment Pending',
  [S.PAYMENT_VERIFIED]: 'Payment Verified',
  [S.ROUTED]: 'Routing',
  [S.PENDING_ASSIGNMENT]: 'Pending Assignment',
  [S.ASSIGNED]: 'Engineer Assigned',
  [S.ACCEPTED]: 'Accepted by Engineer',
  [S.EN_ROUTE]: 'En Route',
  [S.ARRIVED]: 'Arrived',
  [S.IN_PROGRESS]: 'Work Started',
  [S.COMPLETED]: 'Completed',
  [S.VERIFICATION]: 'Verification',
  [S.CLOSED]: 'Closed',
  [S.REJECTED]: 'Rejected',
  [S.CANCELLED]: 'Cancelled',
  [S.ON_HOLD]: 'On Hold',
  [S.REASSIGNED]: 'Reassigned',
  [S.FAILED]: 'Failed',
  [S.EXPIRED]: 'Request Expired',
  [S.UNASSIGNED]: 'Unassigned'
});

/**
 * Where a held job resumes to: the field state it was paused in. Work that
 * had started always resumes to IN_PROGRESS. Returns null when the job is
 * not resumable (not on hold, no engineer, or paused before the field stage).
 */
const resumeTargetOf = (job = {}) => {
  const state = job.lifecycleStatus || deriveLifecycleFromLegacy(job);
  if (state !== S.ON_HOLD || !job.assignedTo) return null;
  if (job.startedAt) return S.IN_PROGRESS;
  return [S.EN_ROUTE, S.ARRIVED].includes(job.onHoldFrom) ? job.onHoldFrom : null;
};

module.exports = {
  LIFECYCLE,
  TRANSITIONS,
  TERMINAL_STATES,
  ENGINEER_ACTIVE_STATES,
  UNASSIGNED_STATES,
  LABELS,
  JobTransitionError,
  isKnownState,
  allowedFrom,
  predecessorsOf,
  canTransition,
  assertTransition,
  deriveLifecycleFromLegacy,
  toLegacy,
  resumeTargetOf
};
