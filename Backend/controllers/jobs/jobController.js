/**
 * Central Job API — one job entity, role-scoped views.
 *
 *   GET  /api/jobs/:id                      full job detail (role-scoped)
 *   GET  /api/jobs/:id/timeline             backend-sourced lifecycle timeline
 *   GET  /api/jobs/:id/assignments          append-only assignment history
 *   GET  /api/jobs/:id/eligible-engineers   server-computed candidates + reasoning
 *   POST /api/jobs/:id/assign               vendor (own) / admin
 *   POST /api/jobs/:id/reassign             vendor (own) / admin, reason required
 *   POST /api/jobs/:id/accept               vendor: take an offered job
 *   POST /api/jobs/:id/decline              vendor: decline an offer (or hand back a held job)
 *   POST /api/jobs/:id/release              vendor: hand back a held job with no engineer yet
 *   POST /api/jobs/:id/transition           role-limited, state-machine validated
 *   POST /api/jobs/bulk-assign              vendor (own) / admin
 *
 * Ownership is enforced here (services/jobScope.service.js), never by the UI:
 * a Vendor A token gets 403 on any Vendor B job.
 */
const mongoose = require('mongoose');
const B2BJob = require('../../models/B2BJob');
const JobHistory = require('../../models/JobHistory');
const JobStatusTimeline = require('../../models/JobStatusTimeline');
const AuditLog = require('../../models/AuditLog');
const { LIFECYCLE: S, LABELS, TRANSITIONS, deriveLifecycleFromLegacy, resumeTargetOf } = require('../../services/jobStateMachine');
const {
  roleOf,
  actorFromReq,
  loadJobForCaller,
  sendJobError,
  openVendorOfferFilter,
  JobAccessError
} = require('../../services/jobScope.service');
const { transitionJob } = require('../../services/jobLifecycle.service');
const assignmentSvc = require('../../services/jobAssignment.service');
const { slaState, vendorActions } = require('../../services/vendorJobs.service');

const oid = (v) => new mongoose.Types.ObjectId(String(v._id || v));
const idOf = (req) => req.user?._id || req.user?.id || req.userId;

const stateOf = (job) => job.lifecycleStatus || deriveLifecycleFromLegacy(job);

/** Does this caller hold (not merely have an offer for) the job? */
const holds = (req, job) => {
  const role = roleOf(req);
  const uid = String(idOf(req));
  if (role === 'ADMIN') return true;
  if (role === 'VENDOR') return String(job.assignedVendorId || '') === uid;
  if (role === 'ENGINEER') return String(job.assignedTo || '') === uid;
  if (role === 'B2B') return String(job.companyId || '') === String(req.companyId || req.user?.companyId || uid);
  return false;
};

// ── Visual timeline (every timestamp from backend records) ────────────────
const MILESTONES = [
  { key: 'CREATED', label: 'Created', states: [S.CREATED], field: 'createdAt' },
  { key: 'VENDOR_ASSIGNED', label: 'Vendor Assigned', events: ['VENDOR_ACCEPTED'] },
  { key: 'ENGINEER_ASSIGNED', label: 'Engineer Assigned', states: [S.ASSIGNED], field: 'assignedAt' },
  { key: 'ACCEPTED', label: 'Accepted', states: [S.ACCEPTED], field: 'acceptedAt' },
  { key: 'EN_ROUTE', label: 'En Route', states: [S.EN_ROUTE], field: 'travelStartedAt' },
  { key: 'ARRIVED', label: 'Arrived', states: [S.ARRIVED], field: 'arrivedAt' },
  { key: 'STARTED', label: 'Started', states: [S.IN_PROGRESS], field: 'startedAt' },
  { key: 'COMPLETED', label: 'Completed', states: [S.COMPLETED], field: 'completionSubmittedAt' },
  { key: 'VERIFICATION', label: 'Verification', states: [S.VERIFICATION] },
  { key: 'CLOSED', label: 'Closed', states: [S.CLOSED] }
];

const buildTimeline = (job, events) => {
  const current = stateOf(job);
  const byState = new Map();
  const byEvent = new Map();
  for (const e of events) {
    if (e.toStatus && e.toStatus !== e.fromStatus) byState.set(e.toStatus, e); // latest wins (events sorted asc)
    if (e.event) byEvent.set(e.event, e);
  }
  const milestones = MILESTONES.map((m) => {
    let hit = null;
    for (const st of m.states || []) if (byState.has(st)) hit = byState.get(st);
    for (const ev of m.events || []) if (byEvent.has(ev)) hit = byEvent.get(ev);
    const at = hit?.createdAt || (m.field ? job[m.field] : null) || null;
    const skipped = m.key === 'VENDOR_ASSIGNED' && !job.assignedVendorId && !hit;
    return {
      key: m.key,
      label: m.label,
      reached: Boolean(at) && !skipped,
      at: skipped ? null : at,
      implied: Boolean(hit?.meta?.implied),
      actorRole: hit?.role || null,
      remark: hit?.remark || null,
      skipped
    };
  });
  return {
    current,
    currentLabel: LABELS[current] || current,
    milestones,
    events: events.map((e) => ({
      id: String(e._id),
      at: e.createdAt,
      from: e.fromStatus,
      to: e.toStatus,
      event: e.event,
      legacyStatus: e.status,
      role: e.role,
      remark: e.remark,
      implied: Boolean(e.meta?.implied)
    }))
  };
};

/** Actions the caller may take on this job now (the UI renders only these). */
const allowedActions = (req, job) => {
  const role = roleOf(req);
  const state = stateOf(job);
  if (role === 'VENDOR') return vendorActions(job, idOf(req));
  if (role === 'ADMIN') {
    return {
      view: true,
      timeline: true,
      assign: !job.assignedTo && assignmentSvc.ASSIGNABLE_STATES.includes(state),
      reassign: Boolean(job.assignedTo) && assignmentSvc.REASSIGNABLE_STATES.includes(state),
      retryRouting: !job.assignedTo && !job.assignedVendorId && [S.ROUTED, S.UNASSIGNED, S.ON_HOLD, S.REJECTED, S.EXPIRED, S.FAILED, S.PENDING_ASSIGNMENT].includes(state),
      routeToVendor: !job.assignedTo && !job.assignedVendorId && [S.ROUTED, S.UNASSIGNED, S.ON_HOLD, S.VALIDATED].includes(state),
      hold: (TRANSITIONS[state] || []).includes(S.ON_HOLD),
      resume: Boolean(resumeTargetOf(job)),
      resumeTo: resumeTargetOf(job),
      cancel: (TRANSITIONS[state] || []).includes(S.CANCELLED),
      verify: [S.COMPLETED, S.VERIFICATION].includes(state)
    };
  }
  if (role === 'B2B') {
    return {
      view: true,
      timeline: true,
      cancel: (TRANSITIONS[state] || []).includes(S.CANCELLED),
      approveWork: [S.COMPLETED, S.VERIFICATION].includes(state),
      retryRouting: !job.assignedTo && !job.assignedVendorId && [S.UNASSIGNED, S.ON_HOLD, S.REJECTED, S.EXPIRED, S.FAILED].includes(state)
    };
  }
  return { view: true, timeline: true };
};

/**
 * GET /api/jobs/:id
 */
exports.getJob = async (req, res) => {
  try {
    const job = await loadJobForCaller(req, req.params.id, 'read', { select: '-startOtp -endOtp' });
    const role = roleOf(req);
    const holder = holds(req, job);

    const [populated, events, workUpdates, assignments] = await Promise.all([
      B2BJob.findById(job._id)
        .select('companyId assignedVendorId assignedTo batchId')
        .populate('companyId', 'companyName email phone')
        .populate('assignedVendorId', 'businessName name phone')
        .populate('assignedTo', 'name phone profilePhoto rating')
        .populate('batchId', 'batchId fileName')
        .lean(),
      JobHistory.find({ jobId: job._id }).sort({ createdAt: 1, _id: 1 }).lean(),
      JobStatusTimeline.find({ jobId: job._id }).sort({ createdAt: 1 }).lean(),
      holder || role === 'ADMIN' ? assignmentSvc.getAssignmentHistory(job._id) : Promise.resolve([])
    ]);

    let payment = null;
    if (holder && ['VENDOR', 'ADMIN', 'B2B'].includes(role)) {
      const { paymentsForJobs } = require('../../services/jobPayments.service');
      const [row] = await paymentsForJobs([job], { perspective: role === 'VENDOR' ? 'vendor' : 'admin' });
      payment = role === 'B2B'
        ? { jobAmount: row.jobAmount, status: row.status, escrowStatus: job.paymentStatus }
        : row;
    }

    // Parts carry the vendor's own costs: only the holding vendor and admin see them.
    const partItems = (role === 'ADMIN' || (role === 'VENDOR' && holder))
      ? await require('../../services/jobParts.service').partsForJob(job._id)
      : [];

    const audit = (role === 'ADMIN' || (role === 'VENDOR' && holder))
      ? await AuditLog.find({ targetId: job._id }).sort({ createdAt: -1 }).limit(50)
        .select('actionType eventMessage actorRole changes createdAt').lean()
      : [];

    const state = stateOf(job);
    const showContact = holder;
    return res.status(200).json({
      success: true,
      data: {
        overview: {
          id: String(job._id),
          jobCode: job.jobId,
          source: job.source || 'B2B',
          status: state,
          statusLabel: LABELS[state] || state,
          legacyStatus: job.status,
          priority: job.priority,
          routingMode: job.routingMode || 'auto',
          unassignedReason: [S.UNASSIGNED, S.ON_HOLD, S.ROUTED].includes(state) && !job.assignedVendorId ? job.unassignedReason || job.allocationReason || null : null,
          isOffer: !holder,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt
        },
        customer: {
          name: showContact ? job.customerName : null,
          phone: showContact ? job.phone : null,
          email: showContact ? job.email : null
        },
        b2b: job.companyId
          ? {
            companyId: String(job.companyId),
            companyName: populated?.companyId?.companyName || null,
            batch: populated?.batchId ? { id: String(populated.batchId._id), code: populated.batchId.batchId } : null,
            deviceId: job.deviceId,
            siteId: job.siteId
          }
          : null,
        service: {
          service: job.service,
          subService: job.subService,
          serviceKey: job.serviceKey || null,
          subServiceKey: job.subServiceKey || null
        },
        location: {
          address: showContact ? job.address : null,
          city: job.city,
          state: job.state,
          pincode: job.pincode,
          coordinates: showContact && job.coordinates?.coordinates
            ? { lng: job.coordinates.coordinates[0], lat: job.coordinates.coordinates[1] }
            : null
        },
        schedule: { preferredDate: job.preferredDate, preferredTime: job.preferredTime },
        sla: { ...slaState(job), targetHours: job.slaTarget || null },
        assignment: {
          type: job.assignmentType,
          vendor: job.assignedVendorId
            ? { id: String(job.assignedVendorId), name: populated?.assignedVendorId?.businessName || populated?.assignedVendorId?.name || job.assignedVendorName }
            : null,
          engineer: job.assignedTo
            ? {
              id: String(job.assignedTo),
              name: job.assignedToName || populated?.assignedTo?.name,
              phone: showContact ? populated?.assignedTo?.phone || null : null,
              photo: populated?.assignedTo?.profilePhoto || null,
              rating: populated?.assignedTo?.rating ?? null
            }
            : null,
          assignedAt: job.assignedAt,
          acceptedAt: job.acceptedAt,
          lastRejection: job.rejectedAt ? { at: job.rejectedAt, reason: job.rejectionReason, remarks: job.rejectionRemarks } : null,
          history: assignments
        },
        parts: { partsReplaced: job.partsReplaced || '', quoteAdjustmentAmount: job.quoteAdjustmentAmount || 0, items: partItems },
        attachments: holder
          ? {
            beforePhotos: job.beforePhotos || [],
            afterPhotos: job.afterPhotos || [],
            customerSignature: job.customerSignature || null,
            customerUnavailablePhotos: job.customerUnavailablePhotos || [],
            checklist: job.checklist || []
          }
          : null,
        workUpdates: holder
          ? workUpdates.map((w) => ({ at: w.createdAt, status: w.status, remarks: w.remarks }))
          : [],
        timeline: buildTimeline(job, events),
        payment,
        audit,
        actions: allowedActions(req, job)
      }
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load job');
  }
};

/** GET /api/jobs/:id/timeline */
exports.getTimeline = async (req, res) => {
  try {
    const job = await loadJobForCaller(req, req.params.id, 'read');
    const events = await JobHistory.find({ jobId: job._id }).sort({ createdAt: 1, _id: 1 }).lean();
    return res.status(200).json({ success: true, data: buildTimeline(job, events) });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load timeline');
  }
};

/** GET /api/jobs/:id/assignments */
exports.getAssignments = async (req, res) => {
  try {
    const job = await loadJobForCaller(req, req.params.id, 'read');
    if (!holds(req, job)) throw new JobAccessError('Only the job holder can view its assignment history');
    const rows = await assignmentSvc.getAssignmentHistory(job._id);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load assignment history');
  }
};

/** GET /api/jobs/:id/eligible-engineers — vendor (own engineers) / admin */
exports.getEligibleEngineers = async (req, res) => {
  try {
    const role = roleOf(req);
    if (!['VENDOR', 'ADMIN'].includes(role)) throw new JobAccessError('Access denied');
    const job = await loadJobForCaller(req, req.params.id, 'write');
    const vendorId = role === 'VENDOR' ? idOf(req) : job.assignedVendorId || null;
    const result = await assignmentSvc.getAssignableEngineers({ job, vendorId });
    return res.status(200).json({
      success: true,
      data: result.eligible,
      ineligible: result.ineligible,
      skillResolved: result.skillResolved,
      job: { id: String(job._id), jobCode: job.jobId, service: job.service, serviceKey: job.serviceKey, city: job.city, pincode: job.pincode, status: stateOf(job) }
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load eligible engineers');
  }
};

const requireVendorOrAdmin = (req) => {
  const role = roleOf(req);
  if (!['VENDOR', 'ADMIN'].includes(role)) throw new JobAccessError('Only the vendor holding the job or an admin can do this');
  return role;
};

/** POST /api/jobs/:id/assign  { engineerId, notes? } */
exports.assign = async (req, res) => {
  try {
    const role = requireVendorOrAdmin(req);
    const job = await loadJobForCaller(req, req.params.id, 'write');
    const { engineerId, notes } = req.body || {};
    if (!engineerId || !mongoose.Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, message: 'A valid engineerId is required' });
    }
    const result = await assignmentSvc.assignEngineer({
      jobId: job._id,
      engineerId,
      actor: actorFromReq(req),
      vendorScopeId: role === 'VENDOR' ? idOf(req) : null,
      reason: notes ? String(notes).slice(0, 300) : undefined,
      routingMode: 'manual'
    });
    return res.status(200).json({
      success: true,
      message: `Assigned to ${result.job.assignedToName}`,
      data: { jobId: String(result.job._id), status: result.job.lifecycleStatus, assignment: result.assignment, eligibility: result.eligibility }
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to assign engineer');
  }
};

/** POST /api/jobs/:id/reassign  { engineerId, reason } */
exports.reassign = async (req, res) => {
  try {
    const role = requireVendorOrAdmin(req);
    const job = await loadJobForCaller(req, req.params.id, 'write');
    const { engineerId, reason } = req.body || {};
    if (!engineerId || !mongoose.Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, message: 'A valid engineerId is required' });
    }
    const result = await assignmentSvc.reassignEngineer({
      jobId: job._id,
      newEngineerId: engineerId,
      actor: actorFromReq(req),
      vendorScopeId: role === 'VENDOR' ? idOf(req) : null,
      reason
    });
    return res.status(200).json({
      success: true,
      message: `Reassigned to ${result.job.assignedToName}`,
      data: {
        jobId: String(result.job._id),
        status: result.job.lifecycleStatus,
        assignment: result.assignment,
        previousAssignment: result.previousAssignment,
        eligibility: result.eligibility
      }
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to reassign engineer');
  }
};

/** POST /api/jobs/:id/accept — vendor takes an offered job (first vendor wins). */
exports.accept = async (req, res) => {
  try {
    if (roleOf(req) !== 'VENDOR') throw new JobAccessError('Only vendors accept job offers here');
    const job = await loadJobForCaller(req, req.params.id, 'read');
    const vid = oid(idOf(req));
    if (String(job.assignedVendorId || '') === String(vid)) {
      return res.status(200).json({ success: true, message: 'You already hold this job', data: { jobId: String(job._id), status: stateOf(job) } });
    }
    if (!(await B2BJob.exists({ _id: job._id, ...openVendorOfferFilter(vid) }))) {
      throw new JobAccessError('This job is no longer available to you', 409);
    }
    const { job: updated } = await assignmentSvc.vendorClaimJob({ jobId: job._id, vendorId: vid, actor: actorFromReq(req) });
    return res.status(200).json({
      success: true,
      message: 'Job accepted. Assign one of your engineers.',
      data: { jobId: String(updated._id), status: updated.lifecycleStatus }
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to accept job');
  }
};

/** Vendor hands back a held job that has no engineer yet (see vendorReleaseJob). */
const releaseHeldJob = async (req, res, job) => {
  const { job: after, reopenedFor } = await assignmentSvc.vendorReleaseJob({
    jobId: job._id,
    vendorId: idOf(req),
    actor: actorFromReq(req),
    reason: req.body?.reason
  });
  const state = stateOf(after);
  return res.status(200).json({
    success: true,
    message: state === S.ON_HOLD
      ? 'Job handed back. No other vendor could take it, so WBI operations will place it.'
      : reopenedFor.length
        ? `Job handed back and re-offered to ${reopenedFor.length} other vendor(s).`
        : 'Job handed back. It is being routed to other vendors.',
    data: { jobId: String(after._id), status: state }
  });
};

/** POST /api/jobs/:id/release  { reason } — vendor hands back a job it holds. */
exports.release = async (req, res) => {
  try {
    if (roleOf(req) !== 'VENDOR') throw new JobAccessError('Only the vendor holding the job can hand it back');
    const job = await loadJobForCaller(req, req.params.id, 'write');
    return await releaseHeldJob(req, res, job);
  } catch (error) {
    return sendJobError(res, error, 'Failed to hand the job back');
  }
};

/** POST /api/jobs/:id/decline  { reason } — vendor declines an offer, or hands back a held job. */
exports.decline = async (req, res) => {
  try {
    if (roleOf(req) !== 'VENDOR') throw new JobAccessError('Only vendors decline job offers here');
    const job = await loadJobForCaller(req, req.params.id, 'read');
    const vid = oid(idOf(req));
    if (String(job.assignedVendorId || '') === String(vid)) return await releaseHeldJob(req, res, job);
    if (!(await B2BJob.exists({ _id: job._id, ...openVendorOfferFilter(vid) }))) {
      throw new JobAccessError('This job is not an open offer to you', 409);
    }
    const reason = String(req.body?.reason || 'Declined by vendor').slice(0, 300);
    await B2BJob.updateOne({ _id: job._id }, { $push: { vendorRejections: { vendorId: vid, reason, rejectedAt: new Date(), kind: 'offer_declined' } } });
    const { recordJobEvent } = require('../../services/jobLifecycle.service');
    await recordJobEvent({ jobId: job._id, event: 'VENDOR_DECLINED', actor: actorFromReq(req), remark: `Vendor declined: ${reason}` });
    const { onVendorOfferDeclined } = require('../../services/b2bMatchingService');
    await onVendorOfferDeclined(job._id);
    return res.status(200).json({ success: true, message: 'Offer declined' });
  } catch (error) {
    return sendJobError(res, error, 'Failed to decline job');
  }
};

/**
 * Which canonical targets each role may request through the generic
 * transition endpoint. Field progress (accept/travel/arrive/start/complete)
 * belongs to the engineer endpoints (they carry OTP/photo evidence); assignment
 * and verification have their own endpoints.
 */
const ROLE_TARGETS = {
  ADMIN: {
    [S.ON_HOLD]: { reason: true },
    [S.CANCELLED]: { reason: true },
    // Resume: back to the field state the job was paused in.
    [S.EN_ROUTE]: { from: [S.ON_HOLD], resume: true },
    [S.ARRIVED]: { from: [S.ON_HOLD], resume: true },
    [S.IN_PROGRESS]: { from: [S.ON_HOLD], resume: true },
    [S.PENDING_ASSIGNMENT]: { from: [S.ON_HOLD, S.FAILED, S.REJECTED] }
  },
  VENDOR: {
    [S.ON_HOLD]: { reason: true, from: [S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS] },
    [S.EN_ROUTE]: { from: [S.ON_HOLD], resume: true },
    [S.ARRIVED]: { from: [S.ON_HOLD], resume: true },
    [S.IN_PROGRESS]: { from: [S.ON_HOLD], resume: true }
  },
  B2B: {
    [S.CANCELLED]: { reason: true }
  }
};

/** POST /api/jobs/:id/transition  { to, reason } */
exports.transition = async (req, res) => {
  try {
    const role = roleOf(req);
    const to = String(req.body?.to || '').toUpperCase();
    const reason = String(req.body?.reason || '').trim();
    const rule = ROLE_TARGETS[role]?.[to];
    if (!rule) {
      return res.status(403).json({
        success: false,
        code: 'TRANSITION_NOT_PERMITTED',
        message: `Your role cannot move a job to ${to || '(none)'}` +
          (ROLE_TARGETS[role] ? `. Allowed: ${Object.keys(ROLE_TARGETS[role]).join(', ')}` : '')
      });
    }
    if (rule.reason && reason.length < 3) {
      return res.status(400).json({ success: false, message: `A reason is required to move a job to ${to}` });
    }
    const job = await loadJobForCaller(req, req.params.id, 'write');
    const actor = actorFromReq(req);

    if (to === S.CANCELLED) {
      const result = await assignmentSvc.cancelJob({ jobId: job._id, actor, reason });
      return res.status(200).json({ success: true, message: 'Job cancelled', data: result });
    }

    // Resume only to where the job was paused (never skip field steps).
    if (rule.resume && stateOf(job) === S.ON_HOLD) {
      const target = resumeTargetOf(job);
      if (!target) {
        return res.status(409).json({
          success: false,
          code: 'NOT_RESUMABLE',
          message: job.assignedTo
            ? 'This job was paused before the engineer started out. Reassign it instead.'
            : 'This job has no engineer. Assign one instead of resuming.'
        });
      }
      if (target !== to) {
        return res.status(409).json({
          success: false,
          code: 'WRONG_RESUME_TARGET',
          message: `This job was paused at ${LABELS[target] || target}; it resumes there, not at ${LABELS[to] || to}.`
        });
      }
    }

    const updated = await transitionJob({
      jobId: job._id,
      to,
      actor,
      reason: reason || undefined,
      expectFrom: rule.from || null,
      event: `${actor.role.toUpperCase()}_${to}`
    });
    return res.status(200).json({ success: true, message: `Job moved to ${to}`, data: { jobId: String(updated._id), status: updated.lifecycleStatus } });
  } catch (error) {
    return sendJobError(res, error, 'Failed to change job status');
  }
};

/** POST /api/jobs/bulk-assign  { assignments: [{ jobId, engineerId }] } */
exports.bulkAssign = async (req, res) => {
  try {
    const role = requireVendorOrAdmin(req);
    const items = Array.isArray(req.body?.assignments) ? req.body.assignments.slice(0, 50) : [];
    if (!items.length) return res.status(400).json({ success: false, message: 'assignments[] is required (max 50)' });

    const results = [];
    for (const item of items) {
      try {
        const job = await loadJobForCaller(req, item.jobId, 'write');
        const r = await assignmentSvc.assignEngineer({
          jobId: job._id,
          engineerId: item.engineerId,
          actor: actorFromReq(req),
          vendorScopeId: role === 'VENDOR' ? idOf(req) : null,
          reason: 'Bulk assignment',
          routingMode: 'manual'
        });
        results.push({ jobId: String(job._id), jobCode: job.jobId, ok: true, engineer: r.job.assignedToName });
      } catch (err) {
        results.push({ jobId: String(item.jobId), ok: false, status: err.status || 500, code: err.code || null, message: err.message });
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    return res.status(succeeded ? 200 : 422).json({
      success: succeeded > 0,
      message: `${succeeded} of ${results.length} assigned`,
      data: results
    });
  } catch (error) {
    return sendJobError(res, error, 'Bulk assignment failed');
  }
};
