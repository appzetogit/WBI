/**
 * B2B job views — the named slices of a company's jobs that the B2B panel
 * shows (Pending, Dispatched, En Route, …).
 *
 * Each view is defined once, here, on the canonical lifecycle state
 * (services/jobStateMachine.js), so the list, the counts and the exports all
 * agree. Documents written before lifecycleStatus existed are matched through
 * their legacy `status` until the backfill migration has run everywhere.
 */

const { LIFECYCLE: S } = require('./jobStateMachine');

const VIEW_DEFS = {
  pending: {
    label: 'Pending',
    states: [
      S.CREATED, S.VALIDATED, S.PRICED, S.PAYMENT_PENDING, S.PAYMENT_VERIFIED,
      S.ROUTED, S.PENDING_ASSIGNMENT, S.UNASSIGNED, S.EXPIRED, S.REJECTED, S.REASSIGNED
    ],
    // A job paused before anyone picked it up is still waiting to be dispatched.
    extra: [{ lifecycleStatus: S.ON_HOLD, assignedTo: null }],
    legacy: ['pending', 'pending_wallet', 'searching_engineer', 'rejected', 'escalated']
  },
  dispatched: {
    label: 'Dispatched',
    states: [S.ASSIGNED, S.ACCEPTED],
    legacy: ['assigned', 'accepted']
  },
  en_route: {
    label: 'En Route',
    states: [S.EN_ROUTE],
    legacy: ['travelling']
  },
  in_progress: {
    label: 'In Progress',
    states: [S.ARRIVED, S.IN_PROGRESS],
    extra: [{ lifecycleStatus: S.ON_HOLD, assignedTo: { $ne: null } }],
    legacy: ['arrived', 'in_progress', 'revision_required', 'on_hold']
  },
  resolved: {
    label: 'Resolved',
    states: [S.COMPLETED, S.VERIFICATION, S.CLOSED],
    legacy: ['completion_submitted', 'admin_review', 'completed', 'closed']
  },
  cancelled: {
    label: 'Cancelled',
    states: [S.CANCELLED],
    legacy: ['cancelled']
  },
  failed: {
    label: 'Failed',
    states: [S.FAILED],
    legacy: ['failed']
  }
};

/** Jobs an engineer is working right now (Live Operations → Active Jobs). */
const ACTIVE_VIEWS = ['dispatched', 'en_route', 'in_progress'];

const stateClause = (def) => [
  { lifecycleStatus: { $in: def.states } },
  ...(def.extra || []),
  { lifecycleStatus: null, status: { $in: def.legacy } }
];

/**
 * Mongo filter fragment for a view, or null for "all".
 * Unknown view names throw so a typo never silently returns every job.
 */
function viewFilter(view) {
  if (!view || view === 'all') return null;
  if (view === 'sla_breached') return { 'sla.breaches.0': { $exists: true } };
  if (view === 'active') {
    return { $or: ACTIVE_VIEWS.flatMap((v) => stateClause(VIEW_DEFS[v])) };
  }
  const def = VIEW_DEFS[view];
  if (!def) {
    const err = new Error(`Unknown job view "${view}"`);
    err.status = 400;
    throw err;
  }
  return { $or: stateClause(def) };
}

const VIEW_KEYS = ['all', ...Object.keys(VIEW_DEFS), 'sla_breached', 'active'];

const VIEW_LABELS = {
  all: 'All Jobs',
  ...Object.fromEntries(Object.entries(VIEW_DEFS).map(([k, d]) => [k, d.label])),
  sla_breached: 'SLA Breached',
  active: 'Active Jobs'
};

/** $facet stages counting every view in one aggregation. */
function viewCountFacets() {
  const facets = {};
  for (const key of VIEW_KEYS) {
    const f = viewFilter(key);
    facets[key] = f ? [{ $match: f }, { $count: 'count' }] : [{ $count: 'count' }];
  }
  return facets;
}

/** Which view a single job falls in (for badges). */
function viewOfJob(job = {}) {
  for (const [key, def] of Object.entries(VIEW_DEFS)) {
    if (job.lifecycleStatus) {
      if (def.states.includes(job.lifecycleStatus)) return key;
    } else if (def.legacy.includes(job.status)) {
      return key;
    }
  }
  if (job.lifecycleStatus === S.ON_HOLD) return job.assignedTo ? 'in_progress' : 'pending';
  return 'pending';
}

module.exports = {
  VIEW_KEYS,
  VIEW_LABELS,
  ACTIVE_VIEWS,
  viewFilter,
  viewCountFacets,
  viewOfJob
};
