/**
 * Job assignment service — who may do a job, and every change to who does it.
 *
 * - Eligibility is computed here, server-side, from the engineer's registered
 *   skills (b2bEngineerEligibility), location, availability and workload. The
 *   vendor "Assign" screen shows exactly this list; an assignment request for
 *   anyone not on it is refused.
 * - Every assignment change opens/closes an append-only JobAssignment row and
 *   moves the job through services/jobLifecycle.service.js. Nothing overwrites
 *   history.
 */
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const Engineer = require('../models/Engineer');
const Vendor = require('../models/Vendor');
const JobAssignment = require('../models/JobAssignment');
const VendorWorkforceEngineer = require('../models/VendorWorkforceEngineer');
const VendorWorkforceLeave = require('../models/VendorWorkforceLeave');
const { logAudit } = require('../utils/auditLogger');
const {
  buildB2BJobSkillContext,
  engineerMatchesJob,
  isOnScheduleToday,
  MAX_ACTIVE_JOBS_PER_ENGINEER
} = require('./b2bEngineerEligibility');
const { LIFECYCLE: S, JobTransitionError } = require('./jobStateMachine');
const { transitionJob, transitionJobPath, recordJobEvent, lifecycleOf } = require('./jobLifecycle.service');

const LOCATION_MATCH_RADIUS_KM = Math.max(
  1,
  parseInt(process.env.JOB_LOCATION_MATCH_RADIUS_KM || '50', 10)
);

/** Legacy statuses in which an engineer is holding a job (workload). */
const ACTIVE_LEGACY_STATUSES = ['assigned', 'accepted', 'travelling', 'arrived', 'in_progress', 'revision_required', 'on_hold'];

/** States from which a held job may be handed to another engineer. */
const REASSIGNABLE_STATES = [S.ASSIGNED, S.ACCEPTED, S.EN_ROUTE, S.ARRIVED, S.ON_HOLD];

/** States in which a job has no engineer and can receive one (funded jobs only). */
const ASSIGNABLE_STATES = [S.PENDING_ASSIGNMENT, S.ROUTED, S.UNASSIGNED, S.ON_HOLD, S.REJECTED, S.EXPIRED];

class AssignmentError extends Error {
  constructor(message, status = 422, details = undefined, code = 'ASSIGNMENT_REJECTED') {
    super(message);
    this.name = 'AssignmentError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

const idStr = (v) => (v ? String(v._id || v) : null);
const oid = (v) => (v ? new mongoose.Types.ObjectId(String(v._id || v)) : null);
const normalizeCity = (c) => String(c || '').trim().toLowerCase().replace(/\s+/g, ' ');

const haversineKm = (a, b) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const jobPoint = (job) => {
  const c = job?.coordinates?.coordinates;
  if (Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && !(c[0] === 0 && c[1] === 0)) {
    return { lng: c[0], lat: c[1] };
  }
  return null;
};

const engineerPoint = (eng) => {
  const c = eng?.geoLocation?.coordinates;
  if (Array.isArray(c) && c.length === 2 && !(c[0] === 0 && c[1] === 0)) return { lng: c[0], lat: c[1] };
  if (Number.isFinite(eng?.location?.lat) && Number.isFinite(eng?.location?.lng)) {
    return { lat: eng.location.lat, lng: eng.location.lng };
  }
  return null;
};

const engineerCities = (eng) => {
  const out = new Set();
  [eng?.address?.city, eng?.workLocations?.primaryArea, ...(eng?.workLocations?.availableCities || []), ...(eng?.workLocations?.secondaryAreas || [])]
    .map(normalizeCity)
    .filter(Boolean)
    .forEach((c) => out.add(c));
  return out;
};

const evaluateLocation = (eng, job) => {
  const cityMatch = Boolean(job.city) && engineerCities(eng).has(normalizeCity(job.city));
  const a = engineerPoint(eng);
  const b = jobPoint(job);
  const distanceKm = a && b ? Number(haversineKm(a, b).toFixed(1)) : null;
  const radius = Math.max(LOCATION_MATCH_RADIUS_KM, Number(eng?.workLocations?.serviceRadius) || 0);
  const withinRadius = distanceKm !== null && distanceKm <= radius;
  return {
    matched: cityMatch || withinRadius,
    basis: withinRadius ? 'distance' : cityMatch ? 'city' : 'none',
    distanceKm,
    radiusKm: radius
  };
};

const ENGINEER_SELECT =
  'name phone email profilePhoto engineerType vendorId vendorApprovalStatus approvalStatus isActive status ' +
  'serviceCategories subServices secondarySkills skills primaryCategory primarySkill workingDays emergencyService ' +
  'geoLocation location address workLocations rating completedJobs totalJobs';

/** Live workload per engineer (one aggregate). */
const activeJobCounts = async (engineerIds) => {
  const counts = new Map();
  if (!engineerIds.length) return counts;
  const rows = await B2BJob.aggregate([
    { $match: { assignedTo: { $in: engineerIds.map(oid) }, status: { $in: ACTIVE_LEGACY_STATUSES } } },
    { $group: { _id: '$assignedTo', n: { $sum: 1 } } }
  ]);
  rows.forEach((r) => counts.set(String(r._id), r.n));
  return counts;
};

/** Vendor roster state (suspended / on leave) keyed by Engineer id. */
const vendorRosterState = async (vendorId, engineerIds) => {
  const state = new Map();
  if (!vendorId || !engineerIds.length) return state;
  const roster = await VendorWorkforceEngineer.find({ vendorId, linkedEngineerId: { $in: engineerIds.map(oid) } })
    .select('_id linkedEngineerId status')
    .lean();
  const byWf = new Map(roster.map((r) => [String(r._id), String(r.linkedEngineerId)]));
  roster.forEach((r) => state.set(String(r.linkedEngineerId), { rosterStatus: r.status, onLeave: false }));

  if (roster.length) {
    const now = new Date();
    const leaves = await VendorWorkforceLeave.find({
      vendorId,
      engineerId: { $in: roster.map((r) => r._id) },
      status: 'approved',
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).select('engineerId').lean();
    leaves.forEach((l) => {
      const engId = byWf.get(String(l.engineerId));
      if (engId && state.has(engId)) state.get(engId).onLeave = true;
    });
  }
  return state;
};

/**
 * Evaluate engineers for a job. Returns every candidate with a verdict and
 * the reasoning a human needs to pick one (skill, location, availability,
 * current job count), ranked best-first among the eligible.
 */
const evaluateEngineers = async ({ job, engineers, vendorId = null }) => {
  const skillContext = await buildB2BJobSkillContext(job);
  const ids = engineers.map((e) => e._id);
  const [counts, roster] = await Promise.all([activeJobCounts(ids), vendorRosterState(vendorId, ids)]);

  const evaluated = engineers.map((eng) => {
    const reasons = [];
    const key = String(eng._id);

    if (eng.approvalStatus !== 'approved') reasons.push('Engineer is not approved by WBI');
    if (eng.isActive === false) reasons.push('Engineer account is inactive');
    if (vendorId) {
      if (idStr(eng.vendorId) !== idStr(vendorId)) reasons.push('Engineer does not belong to this vendor');
      if (!['approved', 'not_required', undefined, null].includes(eng.vendorApprovalStatus)) {
        reasons.push('Engineer has not been approved by this vendor');
      }
    }

    const skill = engineerMatchesJob(eng, skillContext);
    if (!skill.eligible) reasons.push(`No skill match for "${job.service}"`);

    const location = evaluateLocation(eng, job);
    if (!location.matched) {
      reasons.push(
        location.distanceKm !== null
          ? `Outside service area (${location.distanceKm} km away, limit ${location.radiusKm} km)`
          : `Does not cover ${job.city || 'the job location'}`
      );
    }

    const rosterState = roster.get(key) || {};
    const suspended = ['suspended', 'deactivated'].includes(rosterState.rosterStatus);
    if (suspended) reasons.push(rosterState.rosterStatus === 'deactivated' ? 'Engineer is deactivated in your team' : 'Engineer is suspended in your team');
    if (rosterState.onLeave) reasons.push('Engineer is on approved leave today');

    const activeJobs = counts.get(key) || 0;
    const saturated = activeJobs >= MAX_ACTIVE_JOBS_PER_ENGINEER;
    if (saturated) reasons.push(`Already holding ${activeJobs} active job(s) (limit ${MAX_ACTIVE_JOBS_PER_ENGINEER})`);

    const online = String(eng.status || '').toUpperCase() === 'ONLINE';
    const onSchedule = isOnScheduleToday(eng);
    let availability = 'available';
    if (suspended) availability = 'suspended';
    else if (rosterState.onLeave) availability = 'on_leave';
    else if (activeJobs > 0) availability = 'busy';
    else if (!online) availability = 'offline';

    const eligible = reasons.length === 0;
    let score = 0;
    if (eligible) {
      score += location.basis === 'distance' && location.distanceKm !== null ? Math.max(0, 30 - location.distanceKm) : 15;
      score += online ? 20 : 0;
      score += onSchedule ? 10 : 0;
      score -= activeJobs * 12;
      score += (Number(eng.rating) || 0) * 2;
    }

    return {
      engineerId: key,
      name: eng.name,
      phone: eng.phone || '',
      photo: eng.profilePhoto || null,
      engineerType: eng.engineerType || 'freelancer',
      vendorId: idStr(eng.vendorId),
      eligible,
      reasons,
      skillMatch: { matched: skill.eligible, basis: skill.reason },
      locationMatch: location,
      availability: { status: availability, online, onScheduleToday: onSchedule },
      activeJobs,
      maxActiveJobs: MAX_ACTIVE_JOBS_PER_ENGINEER,
      rating: Number(eng.rating) || 0,
      completedJobs: Number(eng.completedJobs) || 0,
      score: Number(score.toFixed(1))
    };
  });

  const eligible = evaluated.filter((c) => c.eligible).sort((a, b) => b.score - a.score);
  const ineligible = evaluated.filter((c) => !c.eligible);
  return { eligible, ineligible, skillResolved: skillContext.resolved };
};

/**
 * Candidate engineers for a job.
 * Vendor-held (or vendorId given): that vendor's own engineers only.
 * Otherwise: approved freelancers near the job (admin / unassigned queue).
 */
const getAssignableEngineers = async ({ job, vendorId = null }) => {
  const vid = vendorId || job.assignedVendorId || null;
  let engineers;
  if (vid) {
    engineers = await Engineer.find({ vendorId: oid(vid) }).select(ENGINEER_SELECT).limit(300).lean();
  } else {
    const point = jobPoint(job);
    const base = {
      approvalStatus: 'approved',
      isActive: true,
      roleType: { $in: ['Engineer', 'Both'] },
      engineerType: { $ne: 'vendor_engineer' }
    };
    const radiusKm = Math.max(LOCATION_MATCH_RADIUS_KM, Number(job.routingMaxRadiusKm) || 0, 100);
    engineers = point
      ? await Engineer.find({
        ...base,
        geoLocation: { $nearSphere: { $geometry: { type: 'Point', coordinates: [point.lng, point.lat] }, $maxDistance: radiusKm * 1000 } }
      }).select(ENGINEER_SELECT).limit(100).lean()
      : await Engineer.find({ ...base, 'address.city': new RegExp(`^${String(job.city || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
        .select(ENGINEER_SELECT).limit(100).lean();
  }
  return evaluateEngineers({ job, engineers, vendorId: vid });
};

/** Resolve an engineer reference that may be an Engineer id or a vendor roster id. */
const resolveEngineer = async (engineerRef, vendorId = null) => {
  if (!engineerRef || !mongoose.Types.ObjectId.isValid(String(engineerRef))) return null;
  let engineer = await Engineer.findById(engineerRef).select(ENGINEER_SELECT).lean();
  if (!engineer && vendorId) {
    const roster = await VendorWorkforceEngineer.findOne({ _id: engineerRef, vendorId }).select('linkedEngineerId').lean();
    if (roster?.linkedEngineerId) engineer = await Engineer.findById(roster.linkedEngineerId).select(ENGINEER_SELECT).lean();
  }
  return engineer;
};

const assertEligible = async ({ job, engineerRef, vendorId }) => {
  const engineer = await resolveEngineer(engineerRef, vendorId);
  if (!engineer) throw new AssignmentError('Engineer not found', 404);
  const { eligible, ineligible } = await evaluateEngineers({ job, engineers: [engineer], vendorId });
  if (!eligible.length) {
    const verdict = ineligible[0];
    // A vendor asking for someone outside its roster is an authorization failure.
    const notOwned = vendorId && verdict?.reasons?.includes('Engineer does not belong to this vendor');
    throw new AssignmentError(
      notOwned ? 'This engineer does not belong to your organisation' : `Engineer is not eligible: ${verdict.reasons.join('; ')}`,
      notOwned ? 403 : 422,
      verdict
    );
  }
  return { engineer, verdict: eligible[0] };
};

// ── Assignment history rows ────────────────────────────────────────────────

const openAssignment = async ({ job, engineer, vendorId, actor, reason, routingMode, eligibility, previous = null }) => {
  try {
    return await JobAssignment.create({
      jobId: job._id,
      jobCode: job.jobId,
      assignmentType: vendorId ? 'vendor_engineer' : 'freelancer',
      vendorId: vendorId ? oid(vendorId) : null,
      engineerId: engineer._id,
      engineerName: engineer.name,
      assignedBy: { actorId: actor.id ? oid(actor.id) : null, role: actor.role || 'system' },
      routingMode: routingMode || 'manual',
      reason: reason || '',
      eligibility: eligibility
        ? {
          skillMatch: eligibility.skillMatch,
          locationMatch: eligibility.locationMatch,
          availability: eligibility.availability,
          activeJobs: eligibility.activeJobs
        }
        : undefined,
      previousEngineerId: previous?.engineerId || null,
      previousAssignmentId: previous?._id || null
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new AssignmentError('This job already has an engineer assigned. Use reassign instead.', 409, undefined, 'ALREADY_ASSIGNED');
    }
    throw err;
  }
};

const CLOSE_TIMESTAMP = {
  rejected: 'rejectedAt',
  reassigned: 'reassignedAt',
  cancelled: 'cancelledAt',
  completed: 'completedAt',
  released: 'closedAt'
};

const closeOpenAssignment = async ({ jobId, status, actor = {}, reason = '', extra = {} }) => {
  const now = new Date();
  const set = {
    status,
    isOpen: false,
    closedAt: now,
    closeReason: reason,
    closedBy: { actorId: actor.id ? oid(actor.id) : null, role: actor.role || 'system' },
    ...extra
  };
  if (CLOSE_TIMESTAMP[status]) set[CLOSE_TIMESTAMP[status]] = now;
  return JobAssignment.findOneAndUpdate({ jobId: oid(jobId), isOpen: true }, { $set: set }, { new: true });
};

/**
 * Jobs assigned before JobAssignment existed have no open row. Create one
 * from the job's current fields so the history is complete from here on.
 */
const ensureOpenAssignment = async (job) => {
  if (!job.assignedTo) return null;
  const open = await JobAssignment.findOne({ jobId: job._id, isOpen: true }).read('primary');
  if (open) return open;
  const state = lifecycleOf(job);
  try {
    return await JobAssignment.create({
      jobId: job._id,
      jobCode: job.jobId,
      assignmentType: job.assignedVendorId ? 'vendor_engineer' : 'freelancer',
      vendorId: job.assignedVendorId || null,
      engineerId: job.assignedTo,
      engineerName: job.assignedToName || '',
      assignedBy: { actorId: null, role: 'system' },
      routingMode: 'auto',
      reason: 'Recorded from pre-existing assignment',
      status: [S.ACCEPTED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.COMPLETED, S.VERIFICATION].includes(state) ? 'accepted' : 'assigned',
      assignedAt: job.assignedAt || job.updatedAt || new Date(),
      acceptedAt: job.acceptedAt || null
    });
  } catch (err) {
    if (err?.code === 11000) return JobAssignment.findOne({ jobId: job._id, isOpen: true }).read('primary');
    throw err;
  }
};

const setRosterAvailability = async (vendorId, engineerId, availability, todayTask = '') => {
  if (!vendorId || !engineerId) return;
  await VendorWorkforceEngineer.updateOne(
    { vendorId: oid(vendorId), linkedEngineerId: oid(engineerId) },
    { $set: { availability, ...(todayTask !== null ? { todayTask } : {}) } }
  ).catch(() => {});
};

const emitTo = (rooms, event, payload) => {
  try {
    const { getIO } = require('../sockets');
    const io = getIO();
    if (io && rooms.length) io.to(rooms).emit(event, payload);
  } catch (_) { /* non-blocking */ }
};

const notifyEngineerAssigned = async (job, engineer, { reassigned = false } = {}) => {
  const payload = {
    jobId: job.jobId,
    mongoId: idStr(job),
    customerName: job.customerName,
    address: job.address,
    city: job.city,
    service: job.service,
    preferredDate: job.preferredDate,
    vendorId: idStr(job.assignedVendorId),
    reassigned
  };
  emitTo([`engineer:${idStr(engineer)}`, `worker:${idStr(engineer)}`], 'engineer:jobAssigned', payload);
  try {
    const { notifyEngineer } = require('./engineerNotify.service');
    await notifyEngineer(engineer._id, {
      type: 'worker_assigned',
      pushType: 'b2b_job_assigned',
      category: 'jobs',
      title: reassigned ? 'Job reassigned to you' : 'New job assigned',
      message: `${job.service || 'Job'} ${job.jobId} — ${job.city || ''}`.trim(),
      relatedId: job._id,
      relatedType: 'b2b_job',
      priority: 'high',
      data: { jobId: job.jobId, mongoId: idStr(job) }
    });
  } catch (_) { /* non-blocking */ }
};

const notifyVendor = async (vendorId, { type, title, message, job }) => {
  if (!vendorId) return;
  emitTo([`vendor:${idStr(vendorId)}`], 'vendor:jobNotice', { type, title, message, jobId: idStr(job), jobCode: job.jobId });
  try {
    const { createNotification } = require('../controllers/notificationControllers/notificationController');
    await createNotification({
      vendorId,
      type,
      title,
      message,
      relatedId: job._id,
      relatedType: 'b2b_job',
      priority: 'high'
    });
  } catch (_) { /* non-blocking */ }
};

const audit = (actionType, { actor, job, changes, message }) =>
  logAudit({
    actionType,
    eventMessage: message,
    actorId: actor.id ? oid(actor.id) : job._id,
    actorRole: actor.role || 'system',
    targetId: job._id,
    targetType: 'B2BJob',
    changes
  });

/**
 * A job parked in the unassigned queue had its escrow returned to the B2B
 * wallet. Before anyone is given the job again, the funds are re-held so the
 * work is always paid for.
 */
const ensureJobFunded = async (job) => {
  const charge = Number(job.charge) || 0;
  if (charge <= 0 || ['escrow_locked', 'deducted', 'released'].includes(job.paymentStatus)) return;
  if (job.status === 'pending_wallet') {
    throw new AssignmentError('This job is waiting for the company wallet to be funded', 409, undefined, 'NOT_FUNDED');
  }
  const { holdB2BJobEscrow } = require('./escrowReleaseEngine.service');
  const escrow = await holdB2BJobEscrow({ companyId: job.companyId, jobId: job._id, amount: charge, remark: `Re-fund ${job.jobId}` });
  if (!escrow.ok && !escrow.alreadyHeld) {
    throw new AssignmentError(
      escrow.reason === 'insufficient_balance'
        ? 'The company wallet balance is insufficient to fund this job'
        : `Could not hold escrow (${escrow.reason})`,
      409,
      undefined,
      'NOT_FUNDED'
    );
  }
  await B2BJob.updateOne({ _id: job._id }, { $set: { paymentStatus: 'escrow_locked', payoutStatus: 'none' } });
};

// ── Operations ─────────────────────────────────────────────────────────────

/**
 * Assign an engineer to a job that has none.
 * @param {object} p
 * @param {string} p.jobId
 * @param {string} p.engineerId       Engineer id (or vendor roster id)
 * @param {object} p.actor            { id, role: 'vendor'|'admin'|'company'|'system' }
 * @param {string} [p.vendorScopeId]  vendor acting (must own the job)
 * @param {string} [p.reason]
 * @param {string} [p.routingMode]
 */
const assignEngineer = async ({ jobId, engineerId, actor, vendorScopeId = null, reason = '', routingMode = 'manual' }) => {
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job) throw new AssignmentError('Job not found', 404);

  if (vendorScopeId && idStr(job.assignedVendorId) !== idStr(vendorScopeId)) {
    throw new AssignmentError('You do not have permission to assign this job', 403);
  }
  if (job.assignedTo) {
    throw new AssignmentError('This job already has an engineer. Use reassign to change it.', 409, undefined, 'ALREADY_ASSIGNED');
  }
  const state = lifecycleOf(job);
  if (!ASSIGNABLE_STATES.includes(state)) {
    throw new JobTransitionError(`A job in ${state} cannot be assigned`, { from: state, to: S.ASSIGNED });
  }

  const vendorId = job.assignedVendorId || null;
  const { engineer, verdict } = await assertEligible({ job, engineerRef: engineerId, vendorId });
  if (!vendorId && engineer.engineerType === 'vendor_engineer') {
    throw new AssignmentError(
      "This engineer works for a vendor. Route the job to that vendor first; the vendor assigns its own engineers.",
      422
    );
  }

  await ensureJobFunded(job);
  const row = await openAssignment({ job, engineer, vendorId, actor, reason, routingMode, eligibility: verdict });
  const steps = [];
  if (state !== S.PENDING_ASSIGNMENT) {
    steps.push({
      to: S.PENDING_ASSIGNMENT,
      reason: 'Queued for assignment',
      event: 'QUEUED_FOR_ASSIGNMENT'
    });
  }
  steps.push({
    to: S.ASSIGNED,
    reason: reason || `Assigned to ${engineer.name}`,
    event: 'ENGINEER_ASSIGNED',
    filter: { assignedTo: null },
    patch: {
      assignedTo: engineer._id,
      assignedToName: engineer.name,
      assignedAt: new Date(),
      acceptedAt: null,
      assignmentType: vendorId ? 'vendor_engineer' : 'freelancer',
      currentAssignmentId: row._id,
      allocationStage: 'allocated',
      allocationReason: `Assigned to ${engineer.name}`,
      allocationUpdatedAt: new Date()
    },
    meta: { assignmentId: String(row._id), engineerId: String(engineer._id), eligibility: verdict }
  });

  let updated;
  try {
    updated = await transitionJobPath({ jobId: job._id, steps, actor });
  } catch (err) {
    await closeOpenAssignment({ jobId: job._id, status: 'cancelled', actor, reason: `Assignment aborted: ${err.message}` }).catch(() => {});
    throw err;
  }

  await setRosterAvailability(vendorId, engineer._id, 'on_project', job.service || 'Assigned job');
  await notifyEngineerAssigned(updated, engineer);
  await audit('JOB_ENGINEER_ASSIGNED', {
    actor,
    job: updated,
    message: `${engineer.name} assigned to ${job.jobId}`,
    changes: { engineerId: String(engineer._id), vendorId: idStr(vendorId), assignmentId: String(row._id) }
  });
  return { job: updated, assignment: row, eligibility: verdict };
};

/**
 * Replace the engineer on a job. Closes the current assignment as REASSIGNED,
 * opens a new one, keeps both in history, notifies both engineers.
 */
const reassignEngineer = async ({ jobId, newEngineerId, actor, vendorScopeId = null, reason }) => {
  if (!reason || String(reason).trim().length < 3) {
    throw new AssignmentError('A reason is required to reassign a job', 400);
  }
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job) throw new AssignmentError('Job not found', 404);
  if (vendorScopeId && idStr(job.assignedVendorId) !== idStr(vendorScopeId)) {
    throw new AssignmentError('You do not have permission to reassign this job', 403);
  }

  const state = lifecycleOf(job);
  if (!job.assignedTo) {
    throw new AssignmentError('This job has no engineer to replace. Use assign instead.', 409);
  }
  if (!REASSIGNABLE_STATES.includes(state)) {
    throw new JobTransitionError(
      `A job in ${state} cannot be reassigned (allowed: ${REASSIGNABLE_STATES.join(', ')})`,
      { from: state, to: S.REASSIGNED }
    );
  }
  if (idStr(job.assignedTo) === idStr(newEngineerId)) {
    throw new AssignmentError('The new engineer is already assigned to this job', 409);
  }

  const vendorId = job.assignedVendorId || null;
  const { engineer, verdict } = await assertEligible({ job, engineerRef: newEngineerId, vendorId });
  const previousEngineerId = job.assignedTo;

  const previous = await ensureOpenAssignment(job);
  const closed = await closeOpenAssignment({
    jobId: job._id,
    status: 'reassigned',
    actor,
    reason,
    extra: { newEngineerId: engineer._id }
  });
  if (!closed) {
    throw new AssignmentError('The assignment changed while reassigning. Refresh and try again.', 409, undefined, 'CONCURRENT_UPDATE');
  }

  const row = await openAssignment({
    job, engineer, vendorId, actor, reason, routingMode: 'manual', eligibility: verdict, previous: previous || closed
  });
  await JobAssignment.updateOne({ _id: closed._id }, { $set: { nextAssignmentId: row._id } }).catch(() => {});

  const updated = await transitionJobPath({
    jobId: job._id,
    actor,
    extraRooms: [`engineer:${idStr(previousEngineerId)}`],
    steps: [
      {
        to: S.REASSIGNED,
        reason,
        event: 'ENGINEER_REASSIGNED',
        meta: { previousEngineerId: idStr(previousEngineerId), newEngineerId: idStr(engineer._id), closedAssignmentId: String(closed._id) }
      },
      {
        to: S.ASSIGNED,
        reason: `Reassigned to ${engineer.name}`,
        event: 'ENGINEER_ASSIGNED',
        patch: {
          assignedTo: engineer._id,
          assignedToName: engineer.name,
          assignedAt: new Date(),
          acceptedAt: null,
          travelStartedAt: null,
          arrivedAt: null,
          startOtp: null,
          startOtpSentAt: null,
          startOtpVerifiedAt: null,
          currentAssignmentId: row._id
        },
        meta: { assignmentId: String(row._id), eligibility: verdict }
      }
    ]
  });

  emitTo([`engineer:${idStr(previousEngineerId)}`, `worker:${idStr(previousEngineerId)}`], 'engineer:jobUnassigned', {
    jobId: job.jobId,
    mongoId: idStr(job),
    reason
  });
  await setRosterAvailability(vendorId, previousEngineerId, 'available', '');
  await setRosterAvailability(vendorId, engineer._id, 'on_project', job.service || 'Assigned job');
  await notifyEngineerAssigned(updated, engineer, { reassigned: true });
  try {
    const { notifyEngineer } = require('./engineerNotify.service');
    await notifyEngineer(previousEngineerId, {
      type: 'job_cancelled',
      category: 'jobs',
      title: 'Job reassigned',
      message: `${job.jobId} was reassigned: ${reason}`,
      relatedId: job._id,
      relatedType: 'b2b_job'
    });
  } catch (_) { /* non-blocking */ }
  await audit('JOB_ENGINEER_REASSIGNED', {
    actor,
    job: updated,
    message: `${job.jobId} reassigned from ${previousEngineerId} to ${engineer.name}: ${reason}`,
    changes: {
      previousEngineerId: idStr(previousEngineerId),
      newEngineerId: String(engineer._id),
      closedAssignmentId: String(closed._id),
      newAssignmentId: String(row._id),
      reason
    }
  });
  return { job: updated, assignment: row, previousAssignment: closed, eligibility: verdict };
};

/**
 * Engineer accepts. Either the job is ASSIGNED to them, or it is an open
 * broadcast offer (ROUTED) they were notified of — first acceptance wins.
 */
const acceptAssignment = async ({ jobId, engineerId, location = null }) => {
  const actor = { id: engineerId, role: 'engineer' };
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job) throw new AssignmentError('Job not found', 404);
  const state = lifecycleOf(job);

  if (state === S.ASSIGNED && idStr(job.assignedTo) === idStr(engineerId)) {
    const open = await ensureOpenAssignment(job);
    const updated = await transitionJob({
      jobId: job._id,
      to: S.ACCEPTED,
      actor,
      reason: 'Engineer accepted the job',
      event: 'ENGINEER_ACCEPTED',
      filter: { assignedTo: oid(engineerId) },
      patch: { acceptedAt: new Date() },
      meta: location ? { location } : undefined
    });
    if (open) {
      await JobAssignment.updateOne({ _id: open._id }, { $set: { status: 'accepted', acceptedAt: new Date() } });
    }
    await notifyVendor(job.assignedVendorId, {
      type: 'job_accepted',
      title: 'Engineer accepted job',
      message: `${job.assignedToName || 'Engineer'} accepted ${job.jobId}`,
      job: updated
    });
    return updated;
  }

  const offered = (job.notifiedEngineers || []).map(String).includes(String(engineerId)) &&
    !(job.declinedEngineers || []).map(String).includes(String(engineerId));
  if (state === S.ROUTED && offered && !job.assignedTo) {
    const engineer = await Engineer.findById(engineerId).select(ENGINEER_SELECT).lean();
    if (!engineer) throw new AssignmentError('Engineer not found', 404);
    if (engineer.approvalStatus !== 'approved' || engineer.isActive === false) {
      throw new AssignmentError('Your account is not approved/active', 403);
    }
    if (engineer.engineerType === 'vendor_engineer') {
      throw new AssignmentError('Vendor engineers receive jobs through their vendor', 403);
    }
    const row = await openAssignment({
      job, engineer, vendorId: null, actor, reason: 'Accepted broadcast offer', routingMode: 'auto'
    });
    let updated;
    try {
      updated = await transitionJobPath({
        jobId: job._id,
        actor,
        steps: [
          {
            to: S.ASSIGNED,
            reason: `Offer claimed by ${engineer.name}`,
            event: 'ENGINEER_ASSIGNED',
            filter: { assignedTo: null },
            patch: {
              assignedTo: engineer._id,
              assignedToName: engineer.name,
              assignedAt: new Date(),
              assignmentType: 'freelancer',
              currentAssignmentId: row._id,
              allocationStage: 'allocated',
              allocationReason: `Accepted by ${engineer.name}`,
              allocationUpdatedAt: new Date()
            },
            meta: { assignmentId: String(row._id), via: 'broadcast_offer' }
          },
          {
            to: S.ACCEPTED,
            reason: 'Engineer accepted the job',
            event: 'ENGINEER_ACCEPTED',
            patch: { acceptedAt: new Date() }
          }
        ]
      });
    } catch (err) {
      await closeOpenAssignment({ jobId: job._id, status: 'cancelled', actor, reason: `Offer claim failed: ${err.message}` }).catch(() => {});
      if (err.code === 'CONCURRENT_UPDATE' || err.name === 'JobTransitionError') {
        throw new AssignmentError('This job has already been taken by another engineer', 409, undefined, 'ALREADY_ASSIGNED');
      }
      throw err;
    }
    await JobAssignment.updateOne({ _id: row._id }, { $set: { status: 'accepted', acceptedAt: new Date() } });
    const losers = (job.notifiedEngineers || []).map(String).filter((id) => id !== String(engineerId));
    losers.forEach((id) =>
      emitTo([`engineer:${id}`, `worker:${id}`], 'engineer:b2bJobOfferClosed', { jobId: job.jobId, mongoId: idStr(job) })
    );
    return updated;
  }

  if (job.assignedTo && idStr(job.assignedTo) !== idStr(engineerId)) {
    throw new AssignmentError('This job has already been assigned to another engineer', 409, undefined, 'ALREADY_ASSIGNED');
  }
  // An engineer who was never offered this job is told nothing about it —
  // not its state, not that it exists for someone else.
  if (!offered) {
    throw new AssignmentError('This job was not offered to you', 403, undefined, 'NOT_OFFERED');
  }
  throw new JobTransitionError(`This job cannot be accepted while it is ${state}`, { from: state, to: S.ACCEPTED });
};

/**
 * Engineer declines.
 * - Assigned engineer: assignment closed as REJECTED, job REJECTED →
 *   PENDING_ASSIGNMENT. A vendor-held job goes back to that vendor's queue
 *   (vendor notified); an unowned job is routed again without this engineer.
 * - Offer recipient only: removed from the offer; the job is untouched.
 */
const rejectAssignment = async ({ jobId, engineerId, reason, remarks = '' }) => {
  if (!reason || !String(reason).trim()) throw new AssignmentError('Rejection reason is mandatory', 400);
  const actor = { id: engineerId, role: 'engineer' };
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job) throw new AssignmentError('Job not found', 404);
  const state = lifecycleOf(job);

  if (idStr(job.assignedTo) === idStr(engineerId)) {
    if (state !== S.ASSIGNED) {
      throw new JobTransitionError(
        `You can only reject a job before accepting it (job is ${state}). Ask your vendor or admin to reassign it.`,
        { from: state, to: S.REJECTED }
      );
    }
    await ensureOpenAssignment(job);
    const full = `${reason}${remarks ? ` — ${remarks}` : ''}`;
    await closeOpenAssignment({ jobId: job._id, status: 'rejected', actor, reason: full });

    const vendorHeld = Boolean(job.assignedVendorId);
    const now = new Date();
    await transitionJob({
      jobId: job._id,
      to: S.REJECTED,
      actor,
      reason: `Engineer rejected: ${full}`,
      event: 'ENGINEER_REJECTED',
      filter: { assignedTo: oid(engineerId) },
      patch: {
        rejectionReason: reason,
        rejectionRemarks: remarks,
        rejectedAt: now,
        rejectedBy: oid(engineerId),
        assignedTo: null,
        assignedToName: null,
        acceptedAt: null,
        currentAssignmentId: null,
        // Never re-offer the job to the engineer who just turned it down.
        notifiedEngineers: [...new Set([...(job.notifiedEngineers || []).map(String), String(engineerId)])].map(oid),
        declinedEngineers: [...new Set([...(job.declinedEngineers || []).map(String), String(engineerId)])].map(oid)
      },
      extraRooms: [`engineer:${idStr(engineerId)}`]
    });
    let updated = await transitionJob({
      jobId: job._id,
      to: S.PENDING_ASSIGNMENT,
      actor: { role: 'system' },
      reason: vendorHeld ? 'Returned to vendor for reassignment' : 'Returned to the assignment queue',
      event: 'REQUEUED_AFTER_REJECTION',
      patch: {
        allocationStage: vendorHeld ? 'allocated' : 'not_started',
        allocationReason: vendorHeld
          ? `Engineer rejected (${reason}). Awaiting vendor reassignment.`
          : `Engineer rejected (${reason}). Re-routing.`,
        allocationUpdatedAt: now
      }
    });
    await setRosterAvailability(job.assignedVendorId, engineerId, 'available', '');

    if (vendorHeld) {
      await notifyVendor(job.assignedVendorId, {
        type: 'job_rejected',
        title: 'Engineer rejected a job',
        message: `${job.assignedToName || 'Engineer'} rejected ${job.jobId}: ${reason}. Please reassign.`,
        job: updated
      });
    } else {
      // Unowned job: route it again (excluding this engineer).
      try {
        updated = await transitionJob({
          jobId: job._id,
          to: S.ROUTED,
          actor: { role: 'system' },
          reason: 'Re-routing after engineer rejection',
          event: 'ROUTING_RESTARTED',
          patch: { currentWave: 0, waveStartedAt: null, allocationStage: 'engineer_waves', allocationUpdatedAt: new Date() }
        });
        const { queueJobMatching } = require('./b2bMatchingService');
        await queueJobMatching(job._id);
      } catch (err) {
        console.warn(`[jobAssignment] re-route after rejection failed for ${job.jobId}:`, err.message);
      }
    }
    await audit('JOB_ENGINEER_REJECTED', {
      actor, job: updated, message: `Engineer ${engineerId} rejected ${job.jobId}: ${full}`, changes: { reason, remarks }
    });
    return updated;
  }

  const offered = (job.notifiedEngineers || []).map(String).includes(String(engineerId));
  if (offered && !job.assignedTo) {
    await B2BJob.updateOne({ _id: job._id }, { $addToSet: { declinedEngineers: oid(engineerId) } });
    await recordJobEvent({
      jobId: job._id,
      event: 'OFFER_DECLINED',
      actor,
      remark: `Engineer declined the offer: ${reason}`,
      meta: { remarks }
    });
    return B2BJob.findById(job._id).lean();
  }

  throw new AssignmentError('This job is not assigned or offered to you', 403);
};


/**
 * Move an engineer's job forward along the field path (ACCEPTED → EN_ROUTE →
 * ARRIVED → IN_PROGRESS) up to `target`. Only the assigned engineer may do
 * this. Steps the client skipped are recorded as implied, so the timeline
 * stays truthful. ASSIGNED is first accepted (recorded in JobAssignment).
 */
const FIELD_PATH = [S.ACCEPTED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS];
const advanceEngineerJob = async ({ job, engineerId, target, patch = {}, reason, event, location = null }) => {
  if (idStr(job.assignedTo) !== idStr(engineerId)) {
    throw new AssignmentError('This job is not assigned to you', 403);
  }
  let state = lifecycleOf(job);
  if (state === S.ASSIGNED) {
    await acceptAssignment({ jobId: job._id, engineerId, location });
    state = S.ACCEPTED;
  }
  const from = FIELD_PATH.indexOf(state);
  const to = FIELD_PATH.indexOf(target);
  if (from === -1 || to === -1 || from >= to) {
    throw new JobTransitionError(`Cannot move job from ${state} to ${target}`, { from: state, to: target });
  }
  const steps = FIELD_PATH.slice(from + 1, to + 1).map((st) => (
    st === target
      ? { to: st, reason, event, patch, filter: { assignedTo: oid(engineerId) } }
      : { to: st, reason: `${st.replace('_', ' ').toLowerCase()} (implied by next action)`, event: `IMPLIED_${st}`, meta: { implied: true } }
  ));
  return transitionJobPath({ jobId: job._id, steps, actor: { id: engineerId, role: 'engineer' } });
};

/** Close the open assignment when the job finishes or is cancelled. */
const closeAssignmentForJob = async ({ jobId, outcome, actor = { role: 'system' }, reason = '' }) => {
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (job?.assignedTo) await ensureOpenAssignment(job);
  const closed = await closeOpenAssignment({ jobId, status: outcome, actor, reason });
  if (closed && job?.assignedVendorId) await setRosterAvailability(job.assignedVendorId, closed.engineerId, 'available', '');
  return closed;
};

/**
 * Cancel a job (state machine decides whether that is still allowed), close
 * its open assignment, return escrow to the B2B wallet and tell everyone who
 * holds or was offered it.
 */
const cancelJob = async ({ jobId, actor, reason }) => {
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job) throw new AssignmentError('Job not found', 404);
  const rooms = [
    ...(job.notifiedVendors || []).map((v) => `vendor:${v}`),
    ...(job.assignedTo ? [`engineer:${job.assignedTo}`] : [])
  ];
  const updated = await transitionJob({
    jobId: job._id,
    to: S.CANCELLED,
    actor,
    reason: `Cancelled: ${reason}`,
    event: 'JOB_CANCELLED',
    patch: { allocationReason: `Cancelled: ${reason}`, allocationUpdatedAt: new Date() },
    extraRooms: rooms
  });
  await closeAssignmentForJob({ jobId: job._id, outcome: 'cancelled', actor, reason });

  let refund = null;
  try {
    const { refundB2BJobEscrow } = require('./escrowReleaseEngine.service');
    refund = await refundB2BJobEscrow({ jobId: job._id, reason: `cancelled_by_${actor.role}` });
  } catch (err) {
    console.warn(`[jobAssignment] refund on cancel failed for ${job.jobId}:`, err.message);
  }
  if (job.assignedVendorId) {
    await notifyVendor(job.assignedVendorId, {
      type: 'job_cancelled',
      title: 'Job cancelled',
      message: `${job.jobId} was cancelled: ${reason}`,
      job: updated
    });
  }
  await audit('JOB_CANCELLED', { actor, job: updated, message: `${job.jobId} cancelled: ${reason}`, changes: { reason } });
  return { job: updated, refund };
};

/** Full assignment history for a job, oldest first. */
const getAssignmentHistory = (jobId) =>
  JobAssignment.find({ jobId: oid(jobId) })
    .sort({ assignedAt: 1, createdAt: 1 })
    .populate('engineerId', 'name phone profilePhoto')
    .populate('vendorId', 'businessName name')
    .lean();

/** Vendor takes an offered (ROUTED) job into its queue. First vendor wins. */
const vendorClaimJob = async ({ jobId, vendorId, actor, reason = 'Vendor accepted the job request' }) => {
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job) throw new AssignmentError('Job not found', 404);
  if (idStr(job.assignedVendorId) === idStr(vendorId)) return { job, alreadyClaimed: true };
  if (job.assignedVendorId || job.assignedTo) {
    throw new AssignmentError('This job was just claimed by another vendor or engineer and is no longer available.', 409, undefined, 'ALREADY_ASSIGNED');
  }
  const vendor = await Vendor.findById(vendorId).select('businessName name').lean();
  await ensureJobFunded(job);
  const updated = await transitionJob({
    jobId: job._id,
    to: S.PENDING_ASSIGNMENT,
    actor,
    reason,
    event: 'VENDOR_ACCEPTED',
    expectFrom: [S.ROUTED, S.VALIDATED, S.UNASSIGNED, S.ON_HOLD],
    filter: { assignedVendorId: null, assignedTo: null },
    patch: {
      assignedVendorId: oid(vendorId),
      assignedVendorName: vendor?.businessName || vendor?.name || null,
      assignmentType: 'vendor_engineer',
      allocationStage: 'allocated',
      allocationReason: 'Accepted by vendor. Awaiting engineer assignment.',
      allocationUpdatedAt: new Date()
    },
    meta: { vendorId: String(vendorId) }
  });
  const others = (job.notifiedVendors || []).map(String).filter((v) => v !== String(vendorId));
  others.forEach((v) => emitTo([`vendor:${v}`], 'vendor:jobOfferClosed', { jobId: idStr(job), jobCode: job.jobId }));
  (job.notifiedEngineers || []).forEach((e) =>
    emitTo([`engineer:${e}`, `worker:${e}`], 'engineer:b2bJobOfferClosed', { jobId: job.jobId, mongoId: idStr(job) })
  );
  return { job: updated, alreadyClaimed: false };
};

/**
 * A vendor hands back a job it accepted but has not staffed yet. The job goes
 * back to routing and is never silently dropped: vendors whose offer is still
 * open see it again, otherwise it is offered to other eligible vendors or
 * escalated to the unassigned queue. The hand-back stays on the job as a
 * vendor rejection of kind "released".
 */
const vendorReleaseJob = async ({ jobId, vendorId, actor, reason }) => {
  const why = String(reason || '').trim().slice(0, 300);
  if (why.length < 3) throw new AssignmentError('A reason is required to hand a job back', 400);
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job) throw new AssignmentError('Job not found', 404);
  if (idStr(job.assignedVendorId) !== idStr(vendorId)) throw new AssignmentError('This job is not held by you', 403);
  if (job.assignedTo || lifecycleOf(job) !== S.PENDING_ASSIGNMENT) {
    throw new AssignmentError(
      'An engineer is already on this job. Reassign the engineer instead of handing the job back.',
      409, undefined, 'ENGINEER_ON_JOB'
    );
  }
  const vendorName = job.assignedVendorName || 'the vendor';
  const handedBack = `Handed back by ${vendorName}: ${why}`;
  const updated = await transitionJob({
    jobId: job._id,
    to: S.ROUTED,
    actor,
    reason: `Vendor handed the job back: ${why}`,
    event: 'VENDOR_RELEASED',
    expectFrom: [S.PENDING_ASSIGNMENT],
    filter: { assignedVendorId: oid(vendorId), assignedTo: null },
    patch: {
      assignedVendorId: null,
      assignedVendorName: null,
      assignmentType: 'unassigned',
      allocationStage: 'vendor_marketplace',
      allocationReason: handedBack,
      allocationUpdatedAt: new Date(),
      vendorRejections: [
        ...(job.vendorRejections || []),
        { vendorId: oid(vendorId), reason: why, rejectedAt: new Date(), kind: 'released' }
      ]
    },
    meta: { vendorId: idStr(vendorId) },
    // The vendor no longer holds the job, so tell its room explicitly.
    extraRooms: [`vendor:${idStr(vendorId)}`]
  });
  await audit('JOB_VENDOR_RELEASED', {
    actor,
    job: updated,
    message: `${job.jobId} ${handedBack}`,
    changes: { vendorId: idStr(vendorId), reason: why }
  });
  const { reopenVendorOffers } = require('./b2bMatchingService');
  const { reopenedFor } = await reopenVendorOffers(job._id, handedBack);
  const fresh = await B2BJob.findById(job._id).read('primary').lean();
  return { job: fresh, reopenedFor };
};

module.exports = {
  AssignmentError,
  ASSIGNABLE_STATES,
  REASSIGNABLE_STATES,
  LOCATION_MATCH_RADIUS_KM,
  evaluateEngineers,
  getAssignableEngineers,
  resolveEngineer,
  assignEngineer,
  reassignEngineer,
  acceptAssignment,
  rejectAssignment,
  advanceEngineerJob,
  closeAssignmentForJob,
  cancelJob,
  ensureJobFunded,
  ensureOpenAssignment,
  getAssignmentHistory,
  vendorClaimJob,
  vendorReleaseJob,
  activeJobCounts
};
