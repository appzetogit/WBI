/**
 * Vendor team read/write model: the Vendor Panel "Engineers" section.
 *
 * One definition of an engineer's standing in a vendor's team, used by the
 * panel, the dashboard and routing alike:
 *
 *   PENDING   waiting for the vendor to approve a join request, or for WBI to
 *             verify documents — cannot receive jobs yet
 *   ACTIVE    verified, approved by the vendor, active in the team
 *   INACTIVE  deactivated/suspended by the vendor, suspended or rejected by WBI,
 *             or the account is disabled — cannot receive jobs
 *
 * Sources: Engineer (identity, verification, skills, coverage, schedule),
 * VendorWorkforceEngineer (the vendor's own active/deactivated flag, which
 * routing reads), VendorWorkforceLeave (approved leave), live job workload.
 */
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const Engineer = require('../models/Engineer');
const Vendor = require('../models/Vendor');
const JobAssignment = require('../models/JobAssignment');
const JobHistory = require('../models/JobHistory');
const VendorServiceCoverage = require('../models/VendorServiceCoverage');
const VendorWorkforceEngineer = require('../models/VendorWorkforceEngineer');
const VendorWorkforceLeave = require('../models/VendorWorkforceLeave');
const { LIFECYCLE: S } = require('./jobStateMachine');
const { JobAccessError } = require('./jobScope.service');
const {
  buildB2BJobSkillContext,
  engineerMatchesJob,
  isOnScheduleToday,
  MAX_ACTIVE_JOBS_PER_ENGINEER
} = require('./b2bEngineerEligibility');

const oid = (v) => new mongoose.Types.ObjectId(String(v._id || v));
const idStr = (v) => (v ? String(v._id || v) : null);

/** Job states in which an engineer is holding one of the vendor's jobs. */
const HOLDING_STATES = [S.ASSIGNED, S.REASSIGNED, S.ACCEPTED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.ON_HOLD];
const INACTIVE_ROSTER = ['suspended', 'deactivated'];

const TEAM_SELECT =
  'name phone email profilePhoto engineerType vendorId vendorApprovalStatus vendorRejectedReason approvalStatus ' +
  'verificationStatus rejectionReason isActive status serviceCategories subServices secondarySkills skills ' +
  'primaryCategory primarySkill workingDays workingHours emergencyService address workLocations rating ' +
  'completedJobs totalJobs totalExperienceYears linkedViaCode createdAt';

class TeamError extends Error {
  constructor(message, status = 409, code = 'TEAM_ACTION_REFUSED', details) {
    super(message);
    this.name = 'TeamError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * The engineer's standing in the vendor's team, with the reason a human
 * needs. Order matters: the most blocking condition wins.
 */
const teamStatusOf = (eng, rosterStatus) => {
  if (eng.vendorApprovalStatus === 'pending_approval') {
    return { status: 'PENDING', pendingOn: 'vendor', reason: 'Asked to join your team — waiting for your approval' };
  }
  if (eng.vendorApprovalStatus === 'rejected') {
    return { status: 'INACTIVE', inactiveBy: 'vendor', reason: `You declined the join request${eng.vendorRejectedReason ? `: ${eng.vendorRejectedReason}` : ''}` };
  }
  if (eng.approvalStatus === 'rejected') {
    return { status: 'INACTIVE', inactiveBy: 'wbi', reason: `WBI rejected verification${eng.rejectionReason ? `: ${eng.rejectionReason}` : ''}` };
  }
  if (eng.approvalStatus === 'suspended') return { status: 'INACTIVE', inactiveBy: 'wbi', reason: 'Suspended by WBI' };
  if (eng.isActive === false) return { status: 'INACTIVE', inactiveBy: 'wbi', reason: 'Account disabled' };
  if (rosterStatus === 'deactivated') return { status: 'INACTIVE', inactiveBy: 'vendor', reason: 'Deactivated by you' };
  if (rosterStatus === 'suspended') return { status: 'INACTIVE', inactiveBy: 'vendor', reason: 'Suspended by you' };
  if (eng.approvalStatus !== 'approved') {
    return { status: 'PENDING', pendingOn: 'wbi', reason: 'Waiting for WBI to verify documents' };
  }
  return { status: 'ACTIVE', reason: null };
};

/** Skills as the vendor sees them: primary first, no duplicates. */
const skillsOf = (eng) => {
  const seen = new Set();
  return [eng.primarySkill, ...(eng.secondarySkills || []), ...(eng.serviceCategories || [])]
    .map((s) => String(s || '').trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
};

/**
 * Engineers blocked from work by their vendor (deactivated/suspended in the
 * roster) or on approved leave today. Used by routing and the panel.
 * @returns {Promise<{ inactive: Map<string,string>, onLeave: Map<string,object>, rosterIdOf: Map<string,string> }>}
 */
const teamBlocks = async (engineerIds, vendorId = null, { vendorOf = null } = {}) => {
  const inactive = new Map();
  const onLeave = new Map();
  const rosterIdOf = new Map();
  const rosterStatusOf = new Map();
  if (!engineerIds.length) return { inactive, onLeave, rosterIdOf, rosterStatusOf };
  const found = await VendorWorkforceEngineer.find({
    linkedEngineerId: { $in: engineerIds.map(oid) },
    demoTag: null,
    ...(vendorId ? { vendorId: oid(vendorId) } : {})
  }).select('_id vendorId linkedEngineerId status').lean();
  // Only the roster of the engineer's current vendor counts (vendorOf: engineerId → vendorId).
  const roster = vendorOf ? found.filter((r) => vendorOf.get(String(r.linkedEngineerId)) === String(r.vendorId)) : found;
  const engOfRoster = new Map();
  roster.forEach((r) => {
    const e = String(r.linkedEngineerId);
    rosterIdOf.set(e, String(r._id));
    rosterStatusOf.set(e, r.status);
    engOfRoster.set(String(r._id), e);
    if (INACTIVE_ROSTER.includes(r.status)) inactive.set(e, r.status);
  });
  if (roster.length) {
    const now = new Date();
    const leaves = await VendorWorkforceLeave.find({
      engineerId: { $in: roster.map((r) => r._id) },
      status: 'approved',
      startDate: { $lte: now },
      endDate: { $gte: now },
      demoTag: null
    }).select('engineerId endDate leaveType reason').lean();
    leaves.forEach((l) => {
      const e = engOfRoster.get(String(l.engineerId));
      if (e) onLeave.set(e, { until: l.endDate, type: l.leaveType || null, reason: l.reason || '' });
    });
  }
  return { inactive, onLeave, rosterIdOf, rosterStatusOf };
};

/** Live workload: the vendor's jobs each engineer currently holds. */
const heldJobs = async (vid, engineerIds) => {
  const byEngineer = new Map();
  if (!engineerIds.length) return byEngineer;
  const jobs = await B2BJob.find({
    assignedVendorId: oid(vid),
    assignedTo: { $in: engineerIds.map(oid) },
    lifecycleStatus: { $in: HOLDING_STATES }
  }).select('jobId assignedTo lifecycleStatus service city slaDueAt').lean();
  jobs.forEach((j) => {
    const k = String(j.assignedTo);
    if (!byEngineer.has(k)) byEngineer.set(k, []);
    byEngineer.get(k).push({ id: String(j._id), jobCode: j.jobId, status: j.lifecycleStatus, service: j.service, city: j.city, slaDueAt: j.slaDueAt || null });
  });
  return byEngineer;
};

/**
 * Availability right now, with the same precedence routing uses:
 * not active → on leave → busy → off today (working days) → offline → available.
 */
const availabilityOf = (eng, team, { leave, jobs }) => {
  const online = String(eng.status || '').toUpperCase() === 'ONLINE';
  const onScheduleToday = isOnScheduleToday(eng);
  const activeJobs = jobs.filter((j) => j.status !== S.ON_HOLD).length;
  let status = 'available';
  if (team.status !== 'ACTIVE') status = 'unavailable';
  else if (leave) status = 'on_leave';
  else if (activeJobs > 0) status = activeJobs >= MAX_ACTIVE_JOBS_PER_ENGINEER ? 'at_capacity' : 'busy';
  else if (!onScheduleToday) status = 'off_today';
  else if (!online) status = 'offline';
  return {
    status,
    online,
    onScheduleToday,
    onLeave: Boolean(leave),
    leaveUntil: leave?.until || null,
    leaveType: leave?.type || null,
    activeJobs,
    maxActiveJobs: MAX_ACTIVE_JOBS_PER_ENGINEER,
    canTakeJobs: team.status === 'ACTIVE' && !leave && activeJobs < MAX_ACTIVE_JOBS_PER_ENGINEER
  };
};

/** What the vendor may do with this engineer now (the UI renders only these). */
const teamActionsOf = (team, jobs) => ({
  view: true,
  edit: team.status !== 'INACTIVE' || team.inactiveBy === 'vendor',
  approveJoin: team.pendingOn === 'vendor',
  rejectJoin: team.pendingOn === 'vendor',
  deactivate: team.status === 'ACTIVE' || team.pendingOn === 'wbi',
  deactivateBlockedBy: jobs.length ? jobs.map((j) => j.jobCode) : [],
  reactivate: team.status === 'INACTIVE' && team.inactiveBy === 'vendor' && team.reason !== null && !/declined the join/.test(team.reason)
});

/**
 * Every engineer in the vendor's team with status, availability, skills,
 * coverage, schedule and live workload.
 * @param {string} vid
 * @param {{ engineerIds?: string[] }} [opts]
 */
const vendorTeam = async (vid, { engineerIds = null } = {}) => {
  const filter = { vendorId: oid(vid) };
  if (engineerIds) filter._id = { $in: engineerIds.map(oid) };
  const engineers = await Engineer.find(filter).select(TEAM_SELECT).sort({ name: 1 }).lean();
  const ids = engineers.map((e) => String(e._id));
  const [blocks, jobsBy] = await Promise.all([teamBlocks(ids, vid), heldJobs(vid, ids)]);

  return engineers.map((eng) => {
    const key = String(eng._id);
    const team = teamStatusOf(eng, blocks.rosterStatusOf.get(key));
    const jobs = jobsBy.get(key) || [];
    const availability = availabilityOf(eng, team, { leave: blocks.onLeave.get(key), jobs });
    return {
      raw: eng,
      id: key,
      rosterId: blocks.rosterIdOf.get(key) || null,
      name: eng.name,
      phone: eng.phone || '',
      email: eng.email || '',
      photo: eng.profilePhoto || null,
      type: eng.engineerType === 'vendor_engineer' ? 'VENDOR_ENGINEER' : 'FREELANCER',
      status: team.status,
      statusReason: team.reason,
      pendingOn: team.pendingOn || null,
      inactiveBy: team.inactiveBy || null,
      verification: {
        wbi: eng.approvalStatus || 'pending',
        vendor: eng.vendorApprovalStatus || 'not_required',
        joinedVia: eng.linkedViaCode ? 'invite' : 'added_by_vendor'
      },
      availability,
      skills: skillsOf(eng),
      experienceYears: eng.totalExperienceYears || 0,
      coverage: {
        city: eng.workLocations?.primaryArea || eng.address?.city || null,
        cities: eng.workLocations?.availableCities || [],
        radiusKm: eng.workLocations?.serviceRadius ?? null
      },
      schedule: {
        workingDays: eng.workingDays || [],
        workingHours: eng.workingHours || null,
        emergencyService: Boolean(eng.emergencyService)
      },
      currentJobs: jobs,
      completedJobs: eng.completedJobs || 0,
      rating: Number(eng.rating) > 0 ? Number(eng.rating) : null,
      joinedAt: eng.createdAt,
      actions: teamActionsOf(team, jobs)
    };
  });
};

/** Section counts over a computed team. */
const teamCounts = (team) => {
  const counts = {
    all: team.length,
    pending: 0,
    active: 0,
    inactive: 0,
    pendingOnVendor: 0,
    pendingOnWbi: 0,
    availability: { available: 0, busy: 0, at_capacity: 0, on_leave: 0, off_today: 0, offline: 0 }
  };
  team.forEach((e) => {
    counts[e.status.toLowerCase()] += 1;
    if (e.pendingOn === 'vendor') counts.pendingOnVendor += 1;
    if (e.pendingOn === 'wbi') counts.pendingOnWbi += 1;
    if (e.status === 'ACTIVE' && counts.availability[e.availability.status] !== undefined) counts.availability[e.availability.status] += 1;
  });
  return counts;
};

const loadOwnEngineer = async (vid, engineerId) => {
  if (!mongoose.Types.ObjectId.isValid(String(engineerId))) throw new TeamError('Invalid engineer id', 400, 'BAD_ID');
  const eng = await Engineer.findById(engineerId).select(TEAM_SELECT).lean();
  if (!eng) throw new TeamError('Engineer not found', 404, 'NOT_FOUND');
  if (idStr(eng.vendorId) !== idStr(vid)) throw new JobAccessError('This engineer is not in your team');
  return eng;
};

/** Roster row for an engineer (the vendor's own active flag lives there). */
const ensureRosterRow = async (vid, eng) => {
  const find = () => VendorWorkforceEngineer.findOne({ vendorId: oid(vid), linkedEngineerId: eng._id, demoTag: null });
  let row = await find();
  if (row) return row;
  // The workforce sync builds complete roster rows for vendor-approved engineers.
  const { syncLinkedEngineers } = require('./vendorWorkforceSync.service');
  await syncLinkedEngineers(vid).catch(() => {});
  row = await find();
  if (row) return row;
  const vendor = await Vendor.findById(vid).select('approvedServices').lean();
  const primary = (vendor?.approvedServices || []).find((s) => s.status !== 'suspended') || {};
  try {
    return await VendorWorkforceEngineer.create({
      vendorId: oid(vid),
      linkedEngineerId: eng._id,
      name: eng.name || 'Engineer',
      email: eng.email || '',
      phone: eng.phone || '',
      photo: eng.profilePhoto || '',
      role: 'Field Engineer',
      department: 'Operations',
      serviceCategoryCode: primary.categoryCode || 'GEN',
      serviceCategoryName: primary.categoryName || 'General',
      primarySkill: eng.primarySkill || '',
      city: eng.address?.city || '',
      status: 'active',
      availability: 'available',
      demoTag: null
    });
  } catch (err) {
    // A concurrent request created it (unique vendorId + linkedEngineerId).
    if (err?.code === 11000) return find();
    throw err;
  }
};

const audit = (actionType, { vid, actor, eng, message, changes }) => {
  const { logAudit } = require('../utils/auditLogger');
  return logAudit({
    actionType,
    eventMessage: message,
    actorId: actor?.id ? oid(actor.id) : oid(vid),
    actorRole: actor?.role || 'vendor',
    targetId: eng._id,
    targetType: 'Engineer',
    changes
  }).catch(() => {});
};

const tellEngineer = async (eng, { type, title, message, reason }, vid = null) => {
  try {
    const { getIO } = require('../sockets');
    getIO()?.to([`engineer:${eng._id}`, `worker:${eng._id}`]).emit('engineer:teamStatus', { type, title, message });
  } catch (_) { /* non-blocking */ }
  try {
    const { notifyEngineer } = require('./engineerNotify.service');
    await notifyEngineer(eng._id, { type, category: 'account', title, message, priority: 'high' });
  } catch (_) { /* non-blocking */ }
  try {
    const vendor = vid ? await Vendor.findById(vid).select('businessName name').lean() : null;
    const { emitAsync } = require('./notification/notificationOrchestrator.service');
    emitAsync('engineer_team_update', {
      targets: { engineerId: eng._id },
      data: {
        type,
        title,
        message,
        reason: reason || undefined,
        name: eng.name,
        vendorName: vendor ? (vendor.businessName || vendor.name) : undefined
      }
    });
  } catch (_) { /* non-blocking */ }
};

/**
 * Deactivate or reactivate an engineer in the vendor's team. Deactivation is
 * refused while the engineer holds any of the vendor's jobs, so no job is
 * left with an engineer who can no longer act on it.
 */
const setTeamActive = async ({ vid, engineerId, active, reason, actor, mode = 'deactivated' }) => {
  const eng = await loadOwnEngineer(vid, engineerId);
  const why = String(reason || '').trim().slice(0, 300);
  const [row] = await vendorTeam(vid, { engineerIds: [engineerId] });

  if (active) {
    if (!row.actions.reactivate) {
      throw new TeamError(
        row.status === 'ACTIVE' ? 'This engineer is already active' : `Cannot reactivate: ${row.statusReason}`,
        409, 'NOT_REACTIVATABLE'
      );
    }
  } else {
    if (why.length < 3) throw new TeamError('A reason is required to deactivate an engineer', 400, 'REASON_REQUIRED');
    if (!row.actions.deactivate) throw new TeamError(`Cannot deactivate: ${row.statusReason || 'engineer is not active'}`, 409, 'NOT_DEACTIVATABLE');
    if (row.currentJobs.length) {
      throw new TeamError(
        `${eng.name} is on ${row.currentJobs.length} of your job(s) (${row.currentJobs.map((j) => j.jobCode).join(', ')}). Reassign them first.`,
        409, 'ENGINEER_HAS_JOBS', { jobs: row.currentJobs }
      );
    }
  }

  const roster = await ensureRosterRow(vid, eng);
  roster.status = active ? 'active' : (mode === 'suspended' ? 'suspended' : 'deactivated');
  await roster.save();

  await audit(active ? 'VENDOR_ENGINEER_REACTIVATED' : 'VENDOR_ENGINEER_DEACTIVATED', {
    vid, actor, eng,
    message: `${eng.name} ${active ? 'reactivated' : `deactivated: ${why}`} by vendor ${vid}`,
    changes: { teamStatus: roster.status, reason: why || undefined }
  });
  await tellEngineer(eng, active
    ? { type: 'engineer_team_reactivated', title: 'You are active again', message: 'Your vendor reactivated you. You can receive jobs again.' }
    : {
      type: 'engineer_team_deactivated',
      title: mode === 'suspended' ? 'Suspended by your vendor' : 'Deactivated by your vendor',
      message: 'You will not receive new jobs from your vendor until you are reactivated.',
      reason: why
    }, vid);

  const [after] = await vendorTeam(vid, { engineerIds: [engineerId] });
  return after;
};

/**
 * Decide a join request made with the vendor's invite link. Approving only
 * accepts the engineer into the team; WBI verification is separate and is
 * never granted by a vendor.
 */
const decideJoinRequest = async ({ vid, engineerId, approve, reason, actor }) => {
  const eng = await Engineer.findOne({
    _id: engineerId,
    vendorId: oid(vid),
    engineerType: 'vendor_engineer',
    vendorApprovalStatus: 'pending_approval'
  });
  if (!eng) throw new TeamError('No pending join request from this engineer', 404, 'NOT_FOUND');
  const why = String(reason || '').trim().slice(0, 500);

  if (approve) {
    eng.vendorApprovalStatus = 'approved';
    eng.vendorRejectedReason = null;
    await eng.save();
    await ensureRosterRow(vid, eng);
  } else {
    eng.vendorApprovalStatus = 'rejected';
    eng.vendorRejectedReason = why || 'Rejected by vendor';
    eng.vendorId = null;
    await eng.save();
  }

  await audit(approve ? 'VENDOR_ENGINEER_JOIN_APPROVED' : 'VENDOR_ENGINEER_JOIN_REJECTED', {
    vid, actor, eng,
    message: `Join request from ${eng.name} ${approve ? 'approved' : `rejected: ${why || 'no reason'}`}`,
    changes: { vendorApprovalStatus: eng.vendorApprovalStatus }
  });
  await tellEngineer(eng, approve
    ? {
      type: 'engineer_vendor_approved',
      title: 'Join request approved',
      message: eng.approvalStatus === 'approved'
        ? 'Your vendor approved your join request. You can now receive assigned jobs.'
        : 'Your vendor approved your join request. You can receive jobs once WBI verifies your documents.'
    }
    : {
      type: 'engineer_vendor_rejected',
      title: 'Join request declined',
      message: 'Your vendor declined your request to join their team.',
      reason: eng.vendorRejectedReason
    }, vid);

  if (!approve) return { id: String(eng._id), name: eng.name, status: 'REMOVED' };
  const [after] = await vendorTeam(vid, { engineerIds: [String(eng._id)] });
  return after;
};

/**
 * Skills matrix: for every service the vendor offers, which engineers match
 * it using the exact routing matcher, how many can work now, and the gaps
 * that stop routing from sending the vendor that work.
 */
const skillsMatrix = async (vid) => {
  const [vendor, coverage, team] = await Promise.all([
    Vendor.findById(vid).select('approvedServices').lean(),
    VendorServiceCoverage.find({ vendorId: oid(vid) }).lean(),
    vendorTeam(vid)
  ]);
  const coverageByKey = new Map(coverage.map((c) => [c.serviceKey, c]));
  const services = (vendor?.approvedServices || [])
    .filter((s) => s.categoryCode)
    .map((s) => ({
      serviceKey: String(s.categoryCode).toUpperCase(),
      serviceName: s.categoryName || s.name || s.categoryCode,
      suspended: s.status === 'suspended'
    }));

  const matchedByEngineer = new Map(team.map((e) => [e.id, []]));
  const rows = [];
  for (const svc of services) {
    const context = await buildB2BJobSkillContext({ service: svc.serviceName, serviceKey: svc.serviceKey });
    const matched = team.filter((e) => engineerMatchesJob(e.raw, context).eligible);
    matched.forEach((e) => matchedByEngineer.get(e.id).push(svc.serviceKey));
    const active = matched.filter((e) => e.status === 'ACTIVE');
    const cov = coverageByKey.get(svc.serviceKey);
    const covered = Boolean(cov && cov.active && ((cov.coverageCities || []).length || (cov.coveragePincodes || []).length));
    let gap = null;
    if (svc.suspended) gap = 'service_suspended';
    else if (!active.length) gap = covered ? 'no_active_engineer' : 'no_engineer_no_coverage';
    else if (!covered) gap = 'no_coverage';
    else if (!active.some((e) => e.availability.canTakeJobs)) gap = 'none_available_now';
    rows.push({
      ...svc,
      covered,
      coverageAreas: cov ? (cov.coverageCities || []).length + (cov.coveragePincodes || []).length : 0,
      engineers: {
        active: active.length,
        available: active.filter((e) => e.availability.canTakeJobs).length,
        pending: matched.filter((e) => e.status === 'PENDING').length,
        inactive: matched.filter((e) => e.status === 'INACTIVE').length
      },
      activeEngineers: active.map((e) => ({ id: e.id, name: e.name, availability: e.availability.status })),
      gap
    });
  }

  // Skills your engineers have that none of your services use.
  const other = new Map();
  team.forEach((e) => {
    if (matchedByEngineer.get(e.id).length) return;
    e.skills.forEach((s) => {
      const k = s.toLowerCase();
      if (!other.has(k)) other.set(k, { skill: s, engineers: [] });
      other.get(k).engineers.push({ id: e.id, name: e.name });
    });
  });

  return {
    services: rows,
    engineers: team.map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status,
      pendingOn: e.pendingOn,
      skills: e.skills,
      matchesServices: matchedByEngineer.get(e.id),
      experienceYears: e.experienceYears
    })),
    unmatchedSkills: [...other.values()],
    summary: {
      services: rows.length,
      servicesWithGaps: rows.filter((r) => r.gap).length,
      engineersWithoutMatch: team.filter((e) => e.status !== 'INACTIVE' && !matchedByEngineer.get(e.id).length).length
    }
  };
};

const avg = (sum, n) => (n ? Math.round(sum / n / 60000) : null);
const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);

/**
 * Per-engineer performance for a period, from assignment history and job
 * records only (no stored scores).
 */
const teamPerformance = async (vid, { from, to, engineerIds = null } = {}) => {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 90 * 86400000);
  const team = await vendorTeam(vid, { engineerIds });
  const ids = team.map((e) => oid(e.id));
  const vendorId = oid(vid);

  const [assignRows, jobRows] = await Promise.all([
    JobAssignment.aggregate([
      { $match: { vendorId, engineerId: { $in: ids }, assignedAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$engineerId',
          assigned: { $sum: 1 },
          accepted: { $sum: { $cond: [{ $gt: ['$acceptedAt', null] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          reassignedAway: { $sum: { $cond: [{ $eq: ['$status', 'reassigned'] }, 1, 0] } },
          responseMs: { $sum: { $cond: [{ $gt: ['$acceptedAt', null] }, { $subtract: ['$acceptedAt', '$assignedAt'] }, 0] } }
        }
      }
    ]),
    B2BJob.aggregate([
      { $match: { assignedVendorId: vendorId, assignedTo: { $in: ids }, completionSubmittedAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$assignedTo',
          jobIds: { $push: '$_id' },
          completed: { $sum: 1 },
          closed: { $sum: { $cond: [{ $eq: ['$lifecycleStatus', S.CLOSED] }, 1, 0] } },
          closedValue: { $sum: { $cond: [{ $eq: ['$lifecycleStatus', S.CLOSED] }, { $ifNull: ['$charge', 0] }, 0] } },
          slaTracked: { $sum: { $cond: [{ $gt: ['$slaDueAt', null] }, 1, 0] } },
          slaMet: { $sum: { $cond: [{ $and: [{ $gt: ['$slaDueAt', null] }, { $lte: ['$completionSubmittedAt', '$slaDueAt'] }] }, 1, 0] } },
          workMs: { $sum: { $cond: [{ $gt: ['$startedAt', null] }, { $subtract: ['$completionSubmittedAt', '$startedAt'] }, 0] } },
          workN: { $sum: { $cond: [{ $gt: ['$startedAt', null] }, 1, 0] } },
          totalMs: { $sum: { $cond: [{ $gt: ['$assignedAt', null] }, { $subtract: ['$completionSubmittedAt', '$assignedAt'] }, 0] } },
          totalN: { $sum: { $cond: [{ $gt: ['$assignedAt', null] }, 1, 0] } }
        }
      }
    ])
  ]);

  // Work sent back by the client for rework, on jobs submitted in the period.
  const submittedJobIds = jobRows.flatMap((r) => r.jobIds);
  const revisionRows = submittedJobIds.length
    ? await JobHistory.aggregate([
      { $match: { jobId: { $in: submittedJobIds }, fromStatus: S.VERIFICATION, toStatus: S.IN_PROGRESS } },
      { $group: { _id: '$jobId', n: { $sum: 1 } } }
    ])
    : [];
  const revisionsByJob = new Map(revisionRows.map((r) => [String(r._id), r.n]));

  const aBy = new Map(assignRows.map((r) => [String(r._id), r]));
  const jBy = new Map(jobRows.map((r) => [String(r._id), r]));

  const rows = team.map((e) => {
    const a = aBy.get(e.id) || {};
    const j = jBy.get(e.id) || {};
    const revisions = (j.jobIds || []).reduce((n, id) => n + (revisionsByJob.get(String(id)) ? 1 : 0), 0);
    const answered = (a.accepted || 0) + (a.rejected || 0);
    return {
      id: e.id,
      name: e.name,
      status: e.status,
      availability: e.availability.status,
      assigned: a.assigned || 0,
      accepted: a.accepted || 0,
      rejected: a.rejected || 0,
      reassignedAway: a.reassignedAway || 0,
      acceptanceRate: pct(a.accepted || 0, answered),
      avgResponseMinutes: avg(a.responseMs || 0, a.accepted || 0),
      completed: j.completed || 0,
      closed: j.closed || 0,
      closedValue: Math.round((j.closedValue || 0) * 100) / 100,
      slaCompliance: pct(j.slaMet || 0, j.slaTracked || 0),
      slaTracked: j.slaTracked || 0,
      avgWorkMinutes: avg(j.workMs || 0, j.workN || 0),
      avgTurnaroundMinutes: avg(j.totalMs || 0, j.totalN || 0),
      revisions,
      firstTimeRightRate: j.completed ? pct(j.completed - revisions, j.completed) : null,
      activeJobs: e.availability.activeJobs,
      rating: e.rating
    };
  }).sort((x, y) => y.completed - x.completed || y.assigned - x.assigned || x.name.localeCompare(y.name));

  const sum = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const totalsSlaMet = jobRows.reduce((n, r) => n + (r.slaMet || 0), 0);
  const totalsSlaTracked = jobRows.reduce((n, r) => n + (r.slaTracked || 0), 0);
  return {
    period: { from: start, to: end },
    rows,
    totals: {
      engineers: rows.length,
      assigned: sum('assigned'),
      accepted: sum('accepted'),
      rejected: sum('rejected'),
      completed: sum('completed'),
      closed: sum('closed'),
      closedValue: Math.round(sum('closedValue') * 100) / 100,
      revisions: sum('revisions'),
      acceptanceRate: pct(sum('accepted'), sum('accepted') + sum('rejected')),
      slaCompliance: pct(totalsSlaMet, totalsSlaTracked),
      firstTimeRightRate: sum('completed') ? pct(sum('completed') - sum('revisions'), sum('completed')) : null
    }
  };
};

/** Full profile of one engineer in the vendor's team. */
const engineerDetail = async (vid, engineerId) => {
  await loadOwnEngineer(vid, engineerId);
  const [[row], perf, assignments] = await Promise.all([
    vendorTeam(vid, { engineerIds: [engineerId] }),
    teamPerformance(vid, { engineerIds: [engineerId] }),
    JobAssignment.find({ vendorId: oid(vid), engineerId: oid(engineerId) })
      .select('jobId jobCode status isOpen assignedAt acceptedAt rejectedAt reassignedAt completedAt cancelledAt closeReason reason')
      .sort({ assignedAt: -1 })
      .limit(20)
      .lean()
  ]);
  let leaves = [];
  if (row.rosterId) {
    leaves = await VendorWorkforceLeave.find({ engineerId: oid(row.rosterId), endDate: { $gte: new Date(Date.now() - 30 * 86400000) }, demoTag: null })
      .select('leaveType startDate endDate status reason')
      .sort({ startDate: -1 })
      .limit(10)
      .lean();
  }
  const { raw, ...profile } = row;
  return {
    ...profile,
    workingHours: raw.workingHours || null,
    performance: perf.rows[0] || null,
    performancePeriod: perf.period,
    assignments: assignments.map((a) => ({
      id: String(a._id),
      jobId: String(a.jobId),
      jobCode: a.jobCode,
      status: a.status,
      open: a.isOpen,
      assignedAt: a.assignedAt,
      acceptedAt: a.acceptedAt,
      endedAt: a.completedAt || a.rejectedAt || a.reassignedAt || a.cancelledAt || null,
      note: a.closeReason || a.reason || ''
    })),
    leaves: leaves.map((l) => ({ type: l.leaveType, from: l.startDate, to: l.endDate, status: l.status, reason: l.reason || '' }))
  };
};

module.exports = {
  TeamError,
  HOLDING_STATES,
  teamStatusOf,
  teamBlocks,
  vendorTeam,
  teamCounts,
  setTeamActive,
  decideJoinRequest,
  skillsMatrix,
  teamPerformance,
  engineerDetail
};
