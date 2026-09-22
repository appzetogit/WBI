/**
 * Vendor jobs read model: the Vendor Panel's job lists, dashboard and
 * analytics. Everything is computed from the central job entity (B2BJob),
 * JobAssignment history and the payments read model — no stored or
 * hardcoded figures.
 *
 * Every query is scoped to one vendor: jobs it holds (assignedVendorId) plus
 * open offers routed to it.
 */
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const JobAssignment = require('../models/JobAssignment');
const VendorFinanceTransaction = require('../models/VendorFinanceTransaction');
const JobHistory = require('../models/JobHistory');
const { LIFECYCLE: S, LABELS, deriveLifecycleFromLegacy, resumeTargetOf } = require('./jobStateMachine');
const { openVendorOfferFilter, isOpenVendorOffer } = require('./jobScope.service');

const oid = (v) => new mongoose.Types.ObjectId(String(v._id || v));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ACTIVE_STATES = [S.ASSIGNED, S.REASSIGNED, S.ACCEPTED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.ON_HOLD];
const DONE_STATES = [S.COMPLETED, S.VERIFICATION, S.CLOSED];
const OPEN_STATES = [S.PENDING_ASSIGNMENT, S.REJECTED, ...ACTIVE_STATES];

/**
 * The Vendor Panel "Jobs" sections, in flow order. Stage tabs partition the
 * jobs the vendor holds by lifecycle state; "new" is open offers and
 * "rejected" is history (offers declined, jobs handed back, engineer
 * rejections), so a job can also appear there after it moved on.
 */
const TAB_STATES = Object.freeze({
  pending_assignment: [S.PENDING_ASSIGNMENT, S.REJECTED],
  assigned: [S.ASSIGNED, S.REASSIGNED],
  accepted: [S.ACCEPTED],
  in_progress: [S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.ON_HOLD],
  completed: DONE_STATES,
  cancelled: [S.CANCELLED, S.FAILED]
});
const TABS = ['all', 'new', 'pending_assignment', 'assigned', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected'];

/** Older links (?tab=unassigned, ?tab=overdue) keep working. */
const TAB_ALIASES = Object.freeze({
  unassigned: { tab: 'pending_assignment' },
  overdue: { tab: 'all', overdue: true }
});

/** Quick filters that narrow any tab. */
const QUICK_FILTERS = Object.freeze({
  overdue: () => ({ slaDueAt: { $lt: new Date() }, lifecycleStatus: { $in: OPEN_STATES } }),
  active: () => ({ lifecycleStatus: { $in: ACTIVE_STATES } })
});

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** Jobs of this vendor on which one of its engineers rejected an assignment. */
const engineerRejectedJobIds = async (vid) =>
  JobAssignment.distinct('jobId', { vendorId: oid(vid), status: 'rejected' });

const tabFilter = async (vid, tab) => {
  const held = { assignedVendorId: oid(vid) };
  if (TAB_STATES[tab]) return { ...held, lifecycleStatus: { $in: TAB_STATES[tab] } };
  switch (tab) {
    case 'new':
      return openVendorOfferFilter(oid(vid));
    case 'rejected':
      return {
        $or: [
          { 'vendorRejections.vendorId': oid(vid) },
          { _id: { $in: await engineerRejectedJobIds(vid) } }
        ]
      };
    case 'all':
    default:
      return { $or: [held, openVendorOfferFilter(oid(vid))] };
  }
};

/** SLA state of a job right now. */
const slaState = (job, now = new Date()) => {
  const due = job.slaDueAt ? new Date(job.slaDueAt) : null;
  const state = job.lifecycleStatus || deriveLifecycleFromLegacy(job);
  if (!due) return { dueAt: null, state: 'none', minutesLeft: null };
  const doneAt = job.completionSubmittedAt || (DONE_STATES.includes(state) ? job.completedAt : null);
  if (doneAt) return { dueAt: due, state: new Date(doneAt) <= due ? 'met' : 'breached', minutesLeft: null };
  if ([S.CANCELLED, S.FAILED].includes(state)) return { dueAt: due, state: 'none', minutesLeft: null };
  const minutesLeft = Math.round((due - now) / 60000);
  if (minutesLeft < 0) return { dueAt: due, state: 'breached', minutesLeft };
  const total = Math.max(1, (due - new Date(job.createdAt || now)) / 60000);
  return { dueAt: due, state: minutesLeft / total < 0.2 || minutesLeft < 120 ? 'at_risk' : 'on_track', minutesLeft };
};

/**
 * What this vendor may do with the job right now (the UI only shows these).
 * Every action is re-validated server-side when it is performed.
 */
const vendorActions = (job, vid) => {
  const state = job.lifecycleStatus || deriveLifecycleFromLegacy(job);
  const held = String(job.assignedVendorId || '') === String(vid);
  if (!held) {
    // An open offer can be accepted or declined; a declined or lost offer is history only.
    return isOpenVendorOffer(job, vid) ? { view: true, accept: true, decline: true } : { view: false };
  }
  const a = { view: true, timeline: true, download: true };
  if (state === S.PENDING_ASSIGNMENT && !job.assignedTo) Object.assign(a, { assign: true, release: true });
  if ([S.ASSIGNED, S.REASSIGNED, S.ACCEPTED, S.EN_ROUTE, S.ARRIVED].includes(state) && job.assignedTo) a.reassign = true;
  if (state === S.ON_HOLD && job.assignedTo && !job.startedAt) a.reassign = true;
  if ([S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS].includes(state)) Object.assign(a, { track: true, hold: true });
  const resumeTo = resumeTargetOf(job);
  if (resumeTo) Object.assign(a, { resume: true, resumeTo });
  if (job.assignedTo && [...ACTIVE_STATES, S.COMPLETED, S.VERIFICATION].includes(state)) a.contact = true;
  return a;
};

const JOB_LIST_SELECT =
  'jobId source companyId customerName phone email address city state pincode service subService serviceKey priority ' +
  'preferredDate preferredTime assignedTo assignedToName assignedVendorId assignmentType status lifecycleStatus lifecycleUpdatedAt ' +
  'trackingStatus slaDueAt charge createdAt updatedAt completedAt completionSubmittedAt startedAt onHoldFrom ' +
  'notifiedVendors vendorRejections vendorOfferExpiresAt allocationReason';

/**
 * Stage details for a page of rows: why the job is where it is, since when,
 * and what is blocking it. Two batched queries, whatever the page size.
 */
const stageDetails = async (jobs, vid, { withRejections = false } = {}) => {
  const ids = jobs.map((j) => j._id);
  if (!ids.length) return new Map();
  const needsHistory = jobs.some((j) => [S.ON_HOLD, S.CANCELLED, S.FAILED].includes(j.lifecycleStatus));
  const [assignments, history] = await Promise.all([
    JobAssignment.find({ jobId: { $in: ids } })
      .select('jobId vendorId engineerName status isOpen assignedAt acceptedAt rejectedAt closeReason')
      .sort({ assignedAt: 1, _id: 1 })
      .lean(),
    needsHistory
      ? JobHistory.find({ jobId: { $in: ids }, toStatus: { $in: [S.ON_HOLD, S.CANCELLED, S.FAILED] } })
        .select('jobId toStatus remark role createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .lean()
      : []
  ]);
  const byJob = new Map();
  assignments.forEach((a) => {
    const k = String(a.jobId);
    if (!byJob.has(k)) byJob.set(k, []);
    byJob.get(k).push(a);
  });
  const lastHistory = new Map();
  history.forEach((h) => {
    const k = `${h.jobId}:${h.toStatus}`;
    if (!lastHistory.has(k)) lastHistory.set(k, h);
  });

  const out = new Map();
  const now = Date.now();
  for (const job of jobs) {
    const key = String(job._id);
    const state = job.lifecycleStatus || deriveLifecycleFromLegacy(job);
    const held = String(job.assignedVendorId || '') === String(vid);
    const rows = byJob.get(key) || [];
    const open = rows.find((a) => a.isOpen);
    const last = rows[rows.length - 1];
    let stage = null;

    if (!held) {
      if (isOpenVendorOffer(job, vid)) {
        const expiresAt = job.vendorOfferExpiresAt && new Date(job.vendorOfferExpiresAt).getTime() > now ? job.vendorOfferExpiresAt : null;
        stage = { kind: 'offer', expiresAt };
      }
    } else if (TAB_STATES.pending_assignment.includes(state)) {
      const rejected = last && !last.isOpen && last.status === 'rejected'
        ? { engineerName: last.engineerName || 'Engineer', reason: last.closeReason || '', at: last.rejectedAt }
        : null;
      stage = { kind: 'awaiting_engineer', since: job.lifecycleUpdatedAt || job.updatedAt, engineerRejected: rejected };
    } else if (TAB_STATES.assigned.includes(state)) {
      stage = { kind: 'awaiting_engineer_acceptance', since: open?.assignedAt || job.lifecycleUpdatedAt };
    } else if (state === S.ACCEPTED) {
      stage = { kind: 'engineer_accepted', since: open?.acceptedAt || job.lifecycleUpdatedAt };
    } else if (state === S.ON_HOLD) {
      const h = lastHistory.get(`${key}:${S.ON_HOLD}`);
      stage = {
        kind: 'on_hold',
        since: h?.createdAt || job.lifecycleUpdatedAt,
        reason: h?.remark || '',
        pausedAt: job.onHoldFrom || null,
        resumeTo: resumeTargetOf(job)
      };
    } else if ([S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS].includes(state)) {
      stage = { kind: 'in_field', since: job.lifecycleUpdatedAt, startedAt: job.startedAt || null };
    } else if ([S.COMPLETED, S.VERIFICATION].includes(state)) {
      stage = { kind: 'awaiting_verification', submittedAt: job.completionSubmittedAt || job.lifecycleUpdatedAt };
    } else if (state === S.CLOSED) {
      stage = { kind: 'closed', submittedAt: job.completionSubmittedAt || null, closedAt: job.lifecycleUpdatedAt || job.completedAt };
    } else if ([S.CANCELLED, S.FAILED].includes(state)) {
      const h = lastHistory.get(`${key}:${state}`);
      stage = {
        kind: state === S.FAILED ? 'failed' : 'cancelled',
        at: h?.createdAt || job.lifecycleUpdatedAt,
        reason: h?.remark || job.allocationReason || '',
        byRole: h?.role || null
      };
    }

    let rejections;
    if (withRejections) {
      const mine = (job.vendorRejections || [])
        .filter((r) => String(r.vendorId) === String(vid))
        .map((r) => ({ by: 'vendor', kind: r.kind || 'offer_declined', reason: r.reason || '', at: r.rejectedAt }));
      const engineers = rows
        .filter((a) => a.status === 'rejected' && String(a.vendorId || '') === String(vid))
        .map((a) => ({ by: 'engineer', kind: 'engineer_rejected', engineerName: a.engineerName || 'Engineer', reason: a.closeReason || '', at: a.rejectedAt }));
      rejections = [...mine, ...engineers].sort((x, y) => new Date(y.at) - new Date(x.at));
    }
    out.set(key, { stage, rejections });
  }
  return out;
};

const toJobRow = (job, vid, details = {}) => {
  const held = String(job.assignedVendorId || '') === String(vid);
  const state = job.lifecycleStatus || deriveLifecycleFromLegacy(job);
  const isOffer = !held && isOpenVendorOffer(job, vid);
  return {
    id: String(job._id),
    jobCode: job.jobId,
    source: job.source || 'B2B',
    heldByYou: held,
    isOffer,
    customer: {
      // Contact details are released once the vendor accepts the job.
      name: held ? job.customerName : null,
      phone: held ? job.phone : null,
      companyName: job.companyId?.companyName || null
    },
    service: job.service,
    subService: job.subService || '',
    serviceKey: job.serviceKey || null,
    location: {
      city: job.city,
      pincode: job.pincode || '',
      address: held ? job.address : null
    },
    priority: job.priority,
    scheduledAt: job.preferredDate,
    scheduledTime: job.preferredTime,
    // Never reveal who took a job this vendor no longer holds.
    engineer: held && job.assignedTo ? { id: String(job.assignedTo), name: job.assignedToName } : null,
    sla: slaState(job),
    status: state,
    statusLabel: LABELS[state] || state,
    legacyStatus: job.status,
    amount: job.charge || 0,
    stage: details.stage || null,
    ...(details.rejections ? { rejections: details.rejections } : {}),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    actions: vendorActions(job, vid)
  };
};

const SORTABLE = { createdAt: 'createdAt', scheduledAt: 'preferredDate', sla: 'slaDueAt', priority: 'priority', updatedAt: 'updatedAt' };
const truthy = (v) => ['1', 'true', 'yes'].includes(String(v || '').toLowerCase());

// Jobs created before the lifecycle migration have no lifecycleStatus and
// would be invisible to the state-based tabs. Derive it with the migration's
// rule for this vendor's jobs. One indexed query that normally finds nothing;
// the conditional update is idempotent under concurrent calls.
const healLegacyLifecycle = async (vid) => {
  const legacy = await B2BJob.find({
    lifecycleStatus: null,
    $or: [{ assignedVendorId: oid(vid) }, { notifiedVendors: oid(vid) }]
  })
    .select('status allocationStage assignedTo assignedVendorId trackingStatus startedAt')
    .limit(500)
    .lean();
  for (const j of legacy) {
    await B2BJob.updateOne(
      { _id: j._id, lifecycleStatus: null },
      { $set: { lifecycleStatus: deriveLifecycleFromLegacy(j), lifecycleUpdatedAt: new Date() } },
      { lifecycleManaged: true }
    );
  }
  return legacy.length;
};

/**
 * Paginated, filtered job list for a vendor.
 * @param {string} vid
 * @param {object} q  tab, status, overdue, active, from, to, dateField, priority, service, city, pincode,
 *                    engineerId, source, search, sort, order, page, limit
 */
const listVendorJobs = async (vid, q = {}) => {
  await healLegacyLifecycle(vid);
  const alias = TAB_ALIASES[q.tab] || {};
  const tab = alias.tab || (TABS.includes(q.tab) ? q.tab : 'all');
  const overdue = alias.overdue || truthy(q.overdue);
  const active = truthy(q.active);
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));

  const and = [await tabFilter(vid, tab)];
  if (overdue) and.push(QUICK_FILTERS.overdue());
  if (active) and.push(QUICK_FILTERS.active());
  if (q.status) and.push({ lifecycleStatus: { $in: String(q.status).split(',').map((s) => s.trim().toUpperCase()) } });
  if (q.priority) and.push({ priority: { $in: String(q.priority).split(',') } });
  if (q.source) and.push({ source: { $in: String(q.source).split(',').map((s) => s.trim().toUpperCase()) } });
  if (q.service) {
    const svc = String(q.service).trim();
    and.push({ $or: [{ serviceKey: svc.toUpperCase() }, { service: new RegExp(escapeRegex(svc), 'i') }] });
  }
  if (q.city) and.push({ city: new RegExp(`^${escapeRegex(q.city)}$`, 'i') });
  if (q.pincode) and.push({ pincode: String(q.pincode).trim() });
  if (q.engineerId && mongoose.Types.ObjectId.isValid(q.engineerId)) and.push({ assignedTo: oid(q.engineerId) });
  if (q.from || q.to) {
    const field = q.dateField === 'scheduledAt' ? 'preferredDate' : 'createdAt';
    const range = {};
    if (q.from) range.$gte = new Date(q.from);
    if (q.to) range.$lte = new Date(q.to);
    and.push({ [field]: range });
  }
  if (q.search && String(q.search).trim()) {
    const rx = new RegExp(escapeRegex(String(q.search).trim()), 'i');
    and.push({ $or: [{ jobId: rx }, { customerName: rx }, { service: rx }, { serviceKey: rx }, { city: rx }, { pincode: rx }, { assignedToName: rx }] });
  }
  const filter = { $and: and };

  const sortField = SORTABLE[q.sort] || 'createdAt';
  const sortDir = String(q.order || 'desc').toLowerCase() === 'asc' ? 1 : -1;

  const [rows, total, counts, statusCounts] = await Promise.all([
    B2BJob.find(filter)
      .select(JOB_LIST_SELECT)
      .populate('companyId', 'companyName')
      .sort({ [sortField]: sortDir, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    B2BJob.countDocuments(filter),
    tabCounts(vid),
    heldStatusCounts(vid)
  ]);
  const details = await stageDetails(rows, vid, { withRejections: tab === 'rejected' });

  return {
    tab,
    filters: { overdue, active },
    data: rows.map((j) => toJobRow(j, vid, details.get(String(j._id)))),
    counts,
    statusCounts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  };
};

/** Count per section, plus the two quick filters over held jobs. */
const tabCounts = async (vid) => {
  const held = { assignedVendorId: oid(vid) };
  const entries = await Promise.all([
    ...TABS.map(async (tab) => [tab, await B2BJob.countDocuments(await tabFilter(vid, tab))]),
    B2BJob.countDocuments({ ...held, ...QUICK_FILTERS.overdue() }).then((n) => ['overdue', n]),
    B2BJob.countDocuments({ ...held, ...QUICK_FILTERS.active() }).then((n) => ['active', n])
  ]);
  return Object.fromEntries(entries);
};

/** Held jobs per lifecycle state (drives the sub-status chips inside a section). */
const heldStatusCounts = async (vid) => {
  const rows = await B2BJob.aggregate([
    { $match: { assignedVendorId: oid(vid) } },
    { $group: { _id: '$lifecycleStatus', n: { $sum: 1 } } }
  ]);
  return Object.fromEntries(rows.filter((r) => r._id).map((r) => [r._id, r.n]));
};

/**
 * Vendor engineers with team status, live availability and workload, for the
 * dashboard. Same definitions as the Engineers section (vendorEngineers.service).
 */
const vendorEngineerStates = async (vid) => {
  const { vendorTeam } = require('./vendorEngineers.service');
  const team = await vendorTeam(vid);
  return team.map((e) => ({
    ...e.raw,
    engineerStatus: e.status,
    activeJobs: e.availability.activeJobs,
    online: e.availability.online,
    availability: e.status !== 'ACTIVE' ? 'unavailable' : ['busy', 'at_capacity'].includes(e.availability.status) ? 'busy' : e.availability.status
  }));
};

const bucketExpr = (field, granularity) => {
  const fmt = granularity === 'month' ? '%Y-%m' : granularity === 'week' ? '%G-W%V' : '%Y-%m-%d';
  return { $dateToString: { format: fmt, date: `$${field}`, timezone: 'Asia/Kolkata' } };
};

/**
 * Vendor dashboard: cards + charts, all computed live.
 * @param {string} vid
 * @param {{ granularity?: 'day'|'week'|'month', days?: number }} opts
 */
const vendorDashboard = async (vid, { granularity = 'day', days = 30 } = {}) => {
  const vendorId = oid(vid);
  const held = { assignedVendorId: vendorId };
  const now = new Date();
  const today = startOfDay(now);
  const since = new Date(now.getTime() - Math.max(1, Number(days) || 30) * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalJobs, newRequests, pendingAssignment, activeJobs, completedToday, overdue,
    breachedClosed, statusDist, serviceDist, trend, completionTrend, slaTrend, engineers
  ] = await Promise.all([
    B2BJob.countDocuments(held),
    // Same definitions as the Jobs sections, so card and tab numbers agree.
    tabFilter(vid, 'new').then((f) => B2BJob.countDocuments(f)),
    tabFilter(vid, 'pending_assignment').then((f) => B2BJob.countDocuments(f)),
    B2BJob.countDocuments({ ...held, ...QUICK_FILTERS.active() }),
    B2BJob.countDocuments({
      ...held,
      $or: [{ completionSubmittedAt: { $gte: today } }, { lifecycleStatus: S.CLOSED, completedAt: { $gte: today } }]
    }),
    B2BJob.countDocuments({ ...held, ...QUICK_FILTERS.overdue() }),
    B2BJob.countDocuments({
      ...held,
      slaDueAt: { $ne: null },
      completionSubmittedAt: { $gte: monthStart },
      $expr: { $gt: ['$completionSubmittedAt', '$slaDueAt'] }
    }),
    B2BJob.aggregate([{ $match: held }, { $group: { _id: '$lifecycleStatus', n: { $sum: 1 } } }]),
    B2BJob.aggregate([
      { $match: held },
      { $group: { _id: { $ifNull: ['$serviceKey', '$service'] }, service: { $first: '$service' }, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 12 }
    ]),
    B2BJob.aggregate([
      { $match: { ...held, createdAt: { $gte: since } } },
      { $group: { _id: bucketExpr('createdAt', granularity), n: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),
    B2BJob.aggregate([
      { $match: { ...held, completionSubmittedAt: { $gte: since } } },
      { $group: { _id: bucketExpr('completionSubmittedAt', granularity), n: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),
    B2BJob.aggregate([
      { $match: { ...held, completionSubmittedAt: { $gte: since }, slaDueAt: { $ne: null } } },
      {
        $group: {
          _id: bucketExpr('completionSubmittedAt', granularity),
          met: { $sum: { $cond: [{ $lte: ['$completionSubmittedAt', '$slaDueAt'] }, 1, 0] } },
          breached: { $sum: { $cond: [{ $gt: ['$completionSubmittedAt', '$slaDueAt'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    vendorEngineerStates(vid)
  ]);

  const activeEngineers = engineers.filter((e) => e.engineerStatus === 'ACTIVE');
  const earningsRows = await VendorFinanceTransaction.aggregate([
    { $match: { vendorId, type: 'escrow_release', status: 'completed', occurredAt: { $gte: since } } },
    { $group: { _id: bucketExpr('occurredAt', granularity), amount: { $sum: '$amount' } } },
    { $sort: { _id: 1 } }
  ]);

  const { settlementsForVendor } = require('./jobPayments.service');
  const settlements = await settlementsForVendor(vid, { period: 'month' });
  const pendingSettlements = settlements.filter((s) => !['PAID', 'NOT_APPLICABLE'].includes(s.status));

  return {
    cards: {
      totalJobs,
      newRequests,
      pendingAssignment,
      activeJobs,
      completedToday,
      overdueJobs: overdue,
      availableEngineers: activeEngineers.filter((e) => e.availability === 'available').length,
      busyEngineers: activeEngineers.filter((e) => e.availability === 'busy').length,
      slaBreaches: overdue + breachedClosed,
      pendingSettlements: {
        count: pendingSettlements.length,
        amount: Math.round(pendingSettlements.reduce((s, x) => s + (x.netAmount - x.paidAmount), 0) * 100) / 100
      }
    },
    charts: {
      statusDistribution: statusDist.map((r) => ({ status: r._id || 'UNKNOWN', label: LABELS[r._id] || r._id, count: r.n })),
      serviceDistribution: serviceDist.map((r) => ({ serviceKey: r._id, service: r.service, count: r.n })),
      engineerWorkload: activeEngineers
        .map((e) => ({ engineerId: String(e._id), name: e.name, activeJobs: e.activeJobs, availability: e.availability }))
        .sort((a, b) => b.activeJobs - a.activeJobs),
      jobTrend: trend.map((r) => ({ period: r._id, created: r.n })),
      completionTrend: completionTrend.map((r) => ({ period: r._id, completed: r.n })),
      slaPerformance: slaTrend.map((r) => ({ period: r._id, met: r.met, breached: r.breached })),
      earnings: earningsRows.map((r) => ({ period: r._id, amount: Math.round(r.amount * 100) / 100 }))
    },
    granularity,
    rangeDays: Number(days) || 30,
    generatedAt: now
  };
};

const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);

/**
 * Vendor analytics over a date range (createdAt within range).
 */
const vendorAnalytics = async (vid, { from = null, to = null } = {}) => {
  const vendorId = oid(vid);
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  const match = { assignedVendorId: vendorId, ...(from || to ? { createdAt: range } : {}) };

  const [totals, byService, byCity, byEngineer, assignmentStats, earnings] = await Promise.all([
    B2BJob.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $in: ['$lifecycleStatus', DONE_STATES] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$lifecycleStatus', S.CLOSED] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $in: ['$lifecycleStatus', [S.CANCELLED, S.FAILED]] }, 1, 0] } },
          slaTracked: { $sum: { $cond: [{ $and: [{ $ne: ['$slaDueAt', null] }, { $ne: ['$completionSubmittedAt', null] }] }, 1, 0] } },
          slaMet: {
            $sum: {
              $cond: [{
                $and: [
                  { $ne: ['$slaDueAt', null] },
                  { $ne: ['$completionSubmittedAt', null] },
                  { $lte: ['$completionSubmittedAt', '$slaDueAt'] }
                ]
              }, 1, 0]
            }
          },
          completionMinutesSum: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$completionSubmittedAt', null] }, { $ne: ['$assignedAt', null] }] },
                { $divide: [{ $subtract: ['$completionSubmittedAt', '$assignedAt'] }, 60000] },
                0
              ]
            }
          },
          completionCount: {
            $sum: { $cond: [{ $and: [{ $ne: ['$completionSubmittedAt', null] }, { $ne: ['$assignedAt', null] }] }, 1, 0] }
          }
        }
      }
    ]),
    B2BJob.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$serviceKey', '$service'] },
          service: { $first: '$service' },
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $in: ['$lifecycleStatus', DONE_STATES] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $in: ['$lifecycleStatus', [S.CANCELLED, S.FAILED]] }, 1, 0] } }
        }
      },
      { $sort: { total: -1 } }
    ]),
    B2BJob.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$city',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $in: ['$lifecycleStatus', DONE_STATES] }, 1, 0] } }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 20 }
    ]),
    B2BJob.aggregate([
      { $match: { ...match, assignedTo: { $ne: null } } },
      {
        $group: {
          _id: '$assignedTo',
          name: { $first: '$assignedToName' },
          jobs: { $sum: 1 },
          completed: { $sum: { $cond: [{ $in: ['$lifecycleStatus', DONE_STATES] }, 1, 0] } }
        }
      },
      { $sort: { completed: -1 } }
    ]),
    JobAssignment.aggregate([
      { $match: { vendorId, ...(from || to ? { assignedAt: range } : {}) } },
      { $group: { _id: '$status', n: { $sum: 1 } } }
    ]),
    VendorFinanceTransaction.aggregate([
      { $match: { vendorId, type: 'escrow_release', status: 'completed', ...(from || to ? { occurredAt: range } : {}) } },
      { $group: { _id: null, amount: { $sum: '$amount' } } }
    ])
  ]);

  const t = totals[0] || { total: 0, completed: 0, closed: 0, cancelled: 0, slaTracked: 0, slaMet: 0, completionMinutesSum: 0, completionCount: 0 };
  const assignments = Object.fromEntries(assignmentStats.map((r) => [r._id, r.n]));
  const totalAssignments = Object.values(assignments).reduce((a, b) => a + b, 0);

  const { settlementsForVendor } = require('./jobPayments.service');
  const settlements = await settlementsForVendor(vid, { period: 'month' });
  const pending = settlements.filter((s) => !['PAID', 'NOT_APPLICABLE'].includes(s.status));

  return {
    totals: {
      totalJobs: t.total,
      completedJobs: t.completed,
      closedJobs: t.closed,
      cancelledJobs: t.cancelled,
      cancellationRate: pct(t.cancelled, t.total),
      slaCompliance: pct(t.slaMet, t.slaTracked),
      reassignmentRate: pct(assignments.reassigned || 0, totalAssignments),
      engineerRejectionRate: pct(assignments.rejected || 0, totalAssignments),
      averageCompletionMinutes: t.completionCount ? Math.round(t.completionMinutesSum / t.completionCount) : null,
      earnings: Math.round((earnings[0]?.amount || 0) * 100) / 100,
      pendingSettlements: {
        count: pending.length,
        amount: Math.round(pending.reduce((s, x) => s + (x.netAmount - x.paidAmount), 0) * 100) / 100
      }
    },
    servicePerformance: byService.map((r) => ({
      serviceKey: r._id, service: r.service, total: r.total, completed: r.completed,
      completionRate: pct(r.completed, r.total), cancelled: r.cancelled
    })),
    locationPerformance: byCity.map((r) => ({ city: r._id, total: r.total, completed: r.completed, completionRate: pct(r.completed, r.total) })),
    engineerProductivity: byEngineer.map((r) => ({
      engineerId: String(r._id), name: r.name, jobs: r.jobs, completed: r.completed, completionRate: pct(r.completed, r.jobs)
    })),
    assignmentOutcomes: assignments,
    range: { from, to }
  };
};

module.exports = {
  TABS,
  TAB_STATES,
  QUICK_FILTERS,
  tabFilter,
  tabCounts,
  toJobRow,
  slaState,
  vendorActions,
  listVendorJobs,
  vendorDashboard,
  vendorAnalytics,
  vendorEngineerStates,
  JOB_LIST_SELECT
};
