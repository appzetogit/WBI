/**
 * Vendor Panel "Assignments": who does which job.
 *
 *   queue        jobs the vendor holds that need an engineer, each with its
 *                best-matching engineers (server-side eligibility)
 *   autoAssign   assign the best eligible engineer to many jobs at once
 *   reassignable jobs with an engineer that can still be reassigned, flagged
 *                when they need attention (not accepted, engineer on leave …)
 *   history      every assignment row (append-only JobAssignment)
 */
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const JobAssignment = require('../models/JobAssignment');
const { LIFECYCLE: S, LABELS } = require('./jobStateMachine');
const assignmentSvc = require('./jobAssignment.service');

const oid = (v) => new mongoose.Types.ObjectId(String(v._id || v));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ACCEPT_WAIT_MINUTES = Math.max(5, parseInt(process.env.JOB_ENGINEER_ACCEPT_WAIT_MINUTES || '30', 10));
const NEEDS_ENGINEER = [S.PENDING_ASSIGNMENT, S.REJECTED];

const jobBasics = (j) => {
  const { slaState } = require('./vendorJobs.service');
  return {
    id: String(j._id),
    jobCode: j.jobId,
    service: j.service,
    serviceKey: j.serviceKey || null,
    city: j.city,
    pincode: j.pincode || '',
    priority: j.priority,
    scheduledAt: j.preferredDate || null,
    scheduledTime: j.preferredTime || '',
    status: j.lifecycleStatus,
    statusLabel: LABELS[j.lifecycleStatus] || j.lifecycleStatus,
    sla: slaState(j),
    engineer: j.assignedTo ? { id: String(j.assignedTo), name: j.assignedToName } : null
  };
};

const candidateRow = (c) => ({
  engineerId: c.engineerId,
  name: c.name,
  score: c.score,
  availability: c.availability?.status,
  online: Boolean(c.availability?.online),
  activeJobs: c.activeJobs,
  maxActiveJobs: c.maxActiveJobs,
  distanceKm: c.locationMatch?.distanceKm ?? null,
  locationBasis: c.locationMatch?.basis || null,
  skillBasis: c.skillMatch?.basis || null
});

/** Most common reasons nobody is eligible, e.g. "No skill match (3)". */
const blockingReasons = (ineligible) => {
  const count = new Map();
  ineligible.forEach((c) => c.reasons.forEach((r) => {
    const key = r.replace(/\(.*?\)/g, '').replace(/".*?"/g, '').trim();
    count.set(key, (count.get(key) || 0) + 1);
  }));
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, n]) => ({ reason, engineers: n }));
};

/** Jobs needing an engineer, soonest SLA first, with their best candidates. */
const assignmentQueue = async (vid, { page = 1, limit = 10, search } = {}) => {
  const filter = { assignedVendorId: oid(vid), assignedTo: null, lifecycleStatus: { $in: NEEDS_ENGINEER } };
  if (search) {
    const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
    filter.$or = [{ jobId: rx }, { service: rx }, { city: rx }, { pincode: rx }, { customerName: rx }];
  }
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(25, Math.max(1, parseInt(limit, 10) || 10));
  const [jobs, total] = await Promise.all([
    B2BJob.find(filter).sort({ slaDueAt: 1, createdAt: 1 }).skip((p - 1) * l).limit(l).lean(),
    B2BJob.countDocuments(filter)
  ]);
  const lastRejections = await JobAssignment.aggregate([
    { $match: { jobId: { $in: jobs.map((j) => j._id) } } },
    { $sort: { assignedAt: -1 } },
    { $group: { _id: '$jobId', last: { $first: '$$ROOT' } } }
  ]);
  const rejectedBy = new Map(lastRejections
    .filter((r) => r.last.status === 'rejected')
    .map((r) => [String(r._id), { engineerName: r.last.engineerName, reason: r.last.closeReason || '', at: r.last.rejectedAt }]));

  const data = [];
  for (const job of jobs) {
    const { eligible, ineligible } = await assignmentSvc.getAssignableEngineers({ job, vendorId: vid });
    data.push({
      ...jobBasics(job),
      engineerRejected: rejectedBy.get(String(job._id)) || null,
      candidates: eligible.slice(0, 3).map(candidateRow),
      eligibleCount: eligible.length,
      blockedBy: eligible.length ? [] : blockingReasons(ineligible)
    });
  }
  return { data, pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) || 1 } };
};

/**
 * Assign the best eligible engineer to each job, one after another, so each
 * choice sees the workload created by the previous ones.
 */
const autoAssign = async (vid, { jobIds = [], actor }) => {
  const ids = [...new Set(jobIds.map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id)).slice(0, 50);
  if (!ids.length) {
    const err = new Error('jobIds[] is required (max 50)');
    err.status = 400;
    throw err;
  }
  const results = [];
  for (const id of ids) {
    const job = await B2BJob.findOne({ _id: id, assignedVendorId: oid(vid) }).lean();
    if (!job) {
      results.push({ jobId: id, ok: false, message: 'Not a job you hold' });
      continue;
    }
    if (job.assignedTo || !NEEDS_ENGINEER.includes(job.lifecycleStatus)) {
      results.push({ jobId: id, jobCode: job.jobId, ok: false, message: `Already ${LABELS[job.lifecycleStatus] || job.lifecycleStatus}` });
      continue;
    }
    const { eligible, ineligible } = await assignmentSvc.getAssignableEngineers({ job, vendorId: vid });
    const best = eligible[0];
    if (!best) {
      const why = blockingReasons(ineligible).map((b) => b.reason).join('; ') || 'You have no engineers';
      results.push({ jobId: id, jobCode: job.jobId, ok: false, message: `No eligible engineer: ${why}` });
      continue;
    }
    try {
      await assignmentSvc.assignEngineer({
        jobId: job._id,
        engineerId: best.engineerId,
        actor,
        vendorScopeId: vid,
        reason: `Auto-assigned: best match (score ${best.score}; ${best.locationMatch?.basis === 'distance' ? `${best.locationMatch.distanceKm} km` : 'covers city'}; ${best.activeJobs} active job(s))`,
        routingMode: 'auto'
      });
      results.push({ jobId: id, jobCode: job.jobId, ok: true, engineer: best.name, message: `Assigned to ${best.name}` });
    } catch (err) {
      results.push({ jobId: id, jobCode: job.jobId, ok: false, message: err.message });
    }
  }
  return results;
};

const SEVERITY = { engineer_inactive: 3, sla_breached: 3, engineer_on_leave: 3, not_accepted: 2, sla_at_risk: 2, paused_before_start: 1, engineer_offline: 1 };

/** Jobs with an engineer that can be reassigned, most urgent first. */
const reassignmentBoard = async (vid) => {
  const jobs = await B2BJob.find({
    assignedVendorId: oid(vid),
    assignedTo: { $ne: null },
    lifecycleStatus: { $in: assignmentSvc.REASSIGNABLE_STATES }
  }).lean();
  const { vendorTeam } = require('./vendorEngineers.service');
  const [team, openRows] = await Promise.all([
    vendorTeam(vid, { engineerIds: [...new Set(jobs.map((j) => String(j.assignedTo)))] }),
    JobAssignment.find({ jobId: { $in: jobs.map((j) => j._id) }, isOpen: true }).select('jobId assignedAt').lean()
  ]);
  const teamBy = new Map(team.map((e) => [e.id, e]));
  const openBy = new Map(openRows.map((r) => [String(r.jobId), r]));
  const now = Date.now();

  const rows = jobs
    // A job paused after work started resumes with the same engineer; not reassignable.
    .filter((j) => !(j.lifecycleStatus === S.ON_HOLD && j.startedAt))
    .map((j) => {
      const base = jobBasics(j);
      const eng = teamBy.get(String(j.assignedTo));
      const open = openBy.get(String(j._id));
      const flags = [];
      if (eng && eng.status !== 'ACTIVE') flags.push({ code: 'engineer_inactive', label: `Engineer is ${eng.status.toLowerCase()}: ${eng.statusReason || ''}`.trim() });
      if (eng?.availability.onLeave) flags.push({ code: 'engineer_on_leave', label: 'Engineer is on leave' });
      if (j.lifecycleStatus === S.ASSIGNED && open && now - new Date(open.assignedAt).getTime() > ACCEPT_WAIT_MINUTES * 60000) {
        flags.push({ code: 'not_accepted', label: `Not accepted for ${Math.round((now - new Date(open.assignedAt).getTime()) / 60000)} min` });
      }
      if (base.sla.state === 'breached') flags.push({ code: 'sla_breached', label: 'SLA breached' });
      else if (base.sla.state === 'at_risk') flags.push({ code: 'sla_at_risk', label: 'SLA at risk' });
      if (j.lifecycleStatus === S.ON_HOLD) flags.push({ code: 'paused_before_start', label: 'Paused before work started' });
      if (eng && !eng.availability.online && [S.ASSIGNED, S.ACCEPTED].includes(j.lifecycleStatus)) flags.push({ code: 'engineer_offline', label: 'Engineer app offline' });
      const severity = flags.reduce((n, f) => n + (SEVERITY[f.code] || 0), 0);
      return { ...base, assignedAt: open?.assignedAt || null, flags, severity };
    })
    .sort((a, b) => b.severity - a.severity || new Date(a.sla.dueAt || 8.64e15) - new Date(b.sla.dueAt || 8.64e15));

  const recent = await JobAssignment.find({ vendorId: oid(vid), status: 'reassigned' })
    .sort({ reassignedAt: -1 }).limit(20)
    .populate('engineerId', 'name').populate('newEngineerId', 'name')
    .lean();

  return {
    data: rows,
    summary: {
      reassignable: rows.length,
      needsAttention: rows.filter((r) => r.flags.some((f) => SEVERITY[f.code] >= 2)).length,
      notAccepted: rows.filter((r) => r.flags.some((f) => f.code === 'not_accepted')).length,
      acceptWaitMinutes: ACCEPT_WAIT_MINUTES
    },
    recent: recent.map((r) => ({
      id: String(r._id),
      jobId: String(r.jobId),
      jobCode: r.jobCode,
      from: r.engineerId?.name || r.engineerName || null,
      to: r.newEngineerId?.name || null,
      reason: r.closeReason || '',
      at: r.reassignedAt || r.closedAt
    }))
  };
};

/** Assignment history with job details, filters and outcome counts. */
const assignmentHistory = async (vid, q = {}) => {
  const filter = { vendorId: oid(vid) };
  if (q.status) filter.status = { $in: String(q.status).split(',') };
  if (q.engineerId && mongoose.Types.ObjectId.isValid(q.engineerId)) filter.engineerId = oid(q.engineerId);
  if (q.from || q.to) {
    filter.assignedAt = {};
    if (q.from) filter.assignedAt.$gte = new Date(q.from);
    if (q.to) filter.assignedAt.$lte = new Date(q.to);
  }
  if (q.search) filter.jobCode = new RegExp(escapeRegex(String(q.search).trim()), 'i');
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 25));
  const countFilter = { ...filter };
  delete countFilter.status;
  const [rows, total, outcomes] = await Promise.all([
    JobAssignment.find(filter).sort({ assignedAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('engineerId', 'name phone').populate('previousEngineerId', 'name').populate('newEngineerId', 'name').lean(),
    JobAssignment.countDocuments(filter),
    JobAssignment.aggregate([{ $match: countFilter }, { $group: { _id: '$status', n: { $sum: 1 } } }])
  ]);
  const jobs = await B2BJob.find({ _id: { $in: rows.map((r) => r.jobId) } }).select('service city lifecycleStatus').lean();
  const jobBy = new Map(jobs.map((j) => [String(j._id), j]));
  return {
    data: rows.map((r) => {
      const j = jobBy.get(String(r.jobId));
      return {
        id: String(r._id),
        jobId: String(r.jobId),
        jobCode: r.jobCode,
        service: j?.service || null,
        city: j?.city || null,
        jobStatus: j?.lifecycleStatus || null,
        engineer: r.engineerId ? { id: String(r.engineerId._id), name: r.engineerId.name } : (r.engineerName ? { id: null, name: r.engineerName } : null),
        previousEngineer: r.previousEngineerId ? r.previousEngineerId.name : null,
        replacedBy: r.newEngineerId ? r.newEngineerId.name : null,
        assignedBy: r.assignedBy?.role || null,
        routingMode: r.routingMode || 'manual',
        status: r.status,
        isOpen: r.isOpen,
        reason: r.reason || '',
        closeReason: r.closeReason || '',
        assignedAt: r.assignedAt,
        acceptedAt: r.acceptedAt,
        rejectedAt: r.rejectedAt,
        reassignedAt: r.reassignedAt,
        closedAt: r.closedAt,
        responseMinutes: r.acceptedAt ? Math.round((new Date(r.acceptedAt) - new Date(r.assignedAt)) / 60000) : null
      };
    }),
    outcomes: Object.fromEntries(outcomes.map((o) => [o._id, o.n])),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  };
};

module.exports = { assignmentQueue, autoAssign, reassignmentBoard, assignmentHistory, ACCEPT_WAIT_MINUTES };
