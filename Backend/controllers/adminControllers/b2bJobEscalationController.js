/**
 * Admin escalation queue (the "unassigned queue") and completion verification
 * for B2B pipeline jobs.
 *
 * A job lands in the queue when routing found no eligible vendor/engineer
 * (UNASSIGNED with a stated reason) or when it is stuck in allocation past its
 * SLA. Admin can see why, retry routing (optionally with a wider search),
 * route it to a specific vendor, or assign an eligible freelancer directly.
 * Every change goes through the job lifecycle + assignment services.
 */
const mongoose = require('mongoose');
const B2BJob = require('../../models/B2BJob');
const B2BCompany = require('../../models/B2BCompany');
const Engineer = require('../../models/Engineer');
const JobHistory = require('../../models/JobHistory');
const JobStatusTimeline = require('../../models/JobStatusTimeline');
const Opportunity = require('../../models/Opportunity');
const { LIFECYCLE: S } = require('../../services/jobStateMachine');
const { transitionJob, lifecycleOf } = require('../../services/jobLifecycle.service');
const { sendJobError, actorFromReq } = require('../../services/jobScope.service');

/** Jobs that need a human: parked for lack of an eligible vendor/engineer, or stalled. */
const buildEscalationFilter = (query = {}) => {
  const stalledBefore = new Date(Date.now() - (parseInt(query.stalledMinutes, 10) || 120) * 60 * 1000);
  const filter = {
    $or: [
      { status: 'escalated' },
      { allocationStage: 'admin_escalation' },
      { lifecycleStatus: { $in: [S.UNASSIGNED, S.ON_HOLD] }, assignedTo: null, assignedVendorId: null },
      {
        status: { $in: ['pending', 'searching_engineer'] },
        assignedTo: null,
        assignedVendorId: null,
        allocationUpdatedAt: { $lt: stalledBefore }
      }
    ]
  };
  if (query.companyId && mongoose.Types.ObjectId.isValid(query.companyId)) {
    return { $and: [{ companyId: new mongoose.Types.ObjectId(query.companyId) }, filter] };
  }
  return filter;
};

const listEscalations = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
    const filter = buildEscalationFilter(req.query);

    const [jobs, total, stageBreakdown] = await Promise.all([
      B2BJob.find(filter)
        .sort({ allocationUpdatedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(
          'jobId companyId source customerName phone service serviceKey subService city pincode address charge priority status ' +
            'lifecycleStatus allocationStage allocationReason allocationUpdatedAt rematchCount paymentStatus slaDueAt createdAt'
        )
        .lean(),
      B2BJob.countDocuments(filter),
      B2BJob.aggregate([{ $match: filter }, { $group: { _id: '$allocationStage', n: { $sum: 1 } } }])
    ]);

    const companyIds = [...new Set(jobs.map((j) => String(j.companyId)))];
    const companies = await B2BCompany.find({ _id: { $in: companyIds } })
      .select('companyName')
      .lean();
    const companyMap = new Map(companies.map((c) => [String(c._id), c.companyName]));

    return res.status(200).json({
      success: true,
      data: jobs.map((j) => ({
        ...j,
        lifecycleStatus: lifecycleOf(j),
        unassignedReason: j.allocationReason || null,
        companyName: companyMap.get(String(j.companyId)) || ''
      })),
      stageBreakdown: stageBreakdown.reduce((acc, r) => ({ ...acc, [r._id || 'unknown']: r.n }), {}),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('[admin b2b listEscalations]', error);
    return res.status(500).json({ success: false, message: 'Failed to load escalation queue' });
  }
};

const getEscalationDetail = async (req, res) => {
  try {
    const job = await B2BJob.findById(req.params.jobId).select('-startOtp -endOtp').lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const { getAssignmentHistory } = require('../../services/jobAssignment.service');
    const [company, history, opportunity, assignments] = await Promise.all([
      B2BCompany.findById(job.companyId).select('companyName email phone').lean(),
      JobHistory.find({ jobId: job._id }).sort({ createdAt: -1 }).limit(50).lean(),
      Opportunity.findOne({ 'assignment.b2bJobId': job._id })
        .sort({ createdAt: -1 })
        .select('opportunityCode type status categoryCode categoryName assignment.phase assignment.vendorQueue')
        .lean(),
      getAssignmentHistory(job._id)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        job: { ...job, lifecycleStatus: lifecycleOf(job) },
        company,
        history,
        assignments,
        opportunity: opportunity
          ? {
              ...opportunity,
              vendorQueueSize: opportunity.assignment?.vendorQueue?.length || 0
            }
          : null
      }
    });
  } catch (error) {
    console.error('[admin b2b getEscalationDetail]', error);
    return res.status(500).json({ success: false, message: 'Failed to load job detail' });
  }
};

/** POST /escalations/:jobId/retry  { note?, expandRadiusKm? } */
const retryAllocation = async (req, res) => {
  try {
    const { rematchB2BJob } = require('../../services/b2bJobRematch.service');
    const result = await rematchB2BJob(req.params.jobId, {
      actorRole: 'admin',
      actorId: req.user.id,
      note: String(req.body?.note || 'Admin retriggered allocation').slice(0, 200),
      expandRadiusKm: req.body?.expandRadiusKm
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }
    return res.status(200).json({
      success: true,
      message: 'Allocation restarted',
      data: { attempt: result.attempt, job: result.job }
    });
  } catch (error) {
    console.error('[admin b2b retryAllocation]', error);
    return res.status(500).json({ success: false, message: 'Failed to restart allocation' });
  }
};

/**
 * POST /escalations/:jobId/assign  { engineerId, note? }
 * Assign an eligible engineer directly (vendor-held jobs: that vendor's
 * engineers; unowned jobs: freelancers). Validated server-side.
 */
const manualAssign = async (req, res) => {
  try {
    const { engineerId, note } = req.body || {};
    if (!engineerId || !mongoose.Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, message: 'A valid engineerId is required' });
    }
    const job = await B2BJob.findById(req.params.jobId).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const { assignEngineer } = require('../../services/jobAssignment.service');
    const result = await assignEngineer({
      jobId: job._id,
      engineerId,
      actor: actorFromReq(req),
      reason: note ? `Manually assigned by admin — ${String(note).slice(0, 200)}` : 'Manually assigned by admin',
      routingMode: 'manual'
    });
    return res.status(200).json({
      success: true,
      message: `Assigned to ${result.job.assignedToName}`,
      data: result.job,
      eligibility: result.eligibility
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to assign engineer');
  }
};

/**
 * GET /escalations/:jobId/engineer-suggestions
 * Server-computed eligible engineers with the reasoning (skill, location,
 * availability, current jobs). Ineligible candidates are returned separately
 * with the reasons they were excluded.
 */
const suggestEngineers = async (req, res) => {
  try {
    const job = await B2BJob.findById(req.params.jobId).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    const { getAssignableEngineers } = require('../../services/jobAssignment.service');
    const { eligible, ineligible, skillResolved } = await getAssignableEngineers({ job });
    return res.status(200).json({ success: true, data: eligible, ineligible, skillResolved });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load engineers');
  }
};

/** GET /escalations/:jobId/vendor-candidates — ranked eligible vendors (hybrid routing). */
const suggestVendors = async (req, res) => {
  try {
    const job = await B2BJob.findById(req.params.jobId).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    const { findEligibleVendors } = require('../../services/jobRouting.service');
    const ranking = await findEligibleVendors(job);
    return res.status(200).json({ success: true, data: ranking.vendors, rejected: ranking.rejected, reason: ranking.reason, serviceKey: ranking.serviceKey });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load vendors');
  }
};

/**
 * POST /escalations/:jobId/route-to-vendor  { vendorId, reason, override? }
 * Manual / hybrid routing: hand the job to a chosen vendor. The vendor must be
 * eligible (coverage + skilled engineer) unless admin explicitly overrides
 * with a reason, which is audited.
 */
const routeToVendor = async (req, res) => {
  try {
    const { vendorId, reason, override = false } = req.body || {};
    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ success: false, message: 'A valid vendorId is required' });
    }
    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({ success: false, message: 'A reason is required to route a job manually' });
    }
    const job = await B2BJob.findById(req.params.jobId).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const { findEligibleVendors } = require('../../services/jobRouting.service');
    const ranking = await findEligibleVendors(job);
    const candidate = ranking.vendors.find((v) => v.vendorId === String(vendorId));
    if (!candidate && !override) {
      const rejected = ranking.rejected.find((v) => v.vendorId === String(vendorId));
      return res.status(422).json({
        success: false,
        code: 'VENDOR_NOT_ELIGIBLE',
        message: rejected
          ? `Vendor is not eligible: ${rejected.reasons.join('; ')}`
          : `Vendor does not cover ${ranking.serviceKey || job.service} for this location`,
        details: rejected || null
      });
    }

    const actor = actorFromReq(req);
    const { vendorClaimJob } = require('../../services/jobAssignment.service');
    const result = await vendorClaimJob({
      jobId: job._id,
      vendorId,
      actor,
      reason: `Routed to vendor by admin${override && !candidate ? ' (override)' : ''}: ${String(reason).slice(0, 200)}`
    });
    await B2BJob.updateOne({ _id: job._id }, { $addToSet: { notifiedVendors: new mongoose.Types.ObjectId(String(vendorId)) }, $set: { routingMode: 'manual' } });

    const { logAudit } = require('../../utils/auditLogger');
    await logAudit({
      actionType: override && !candidate ? 'JOB_ROUTING_OVERRIDE' : 'JOB_ROUTED_MANUALLY',
      eventMessage: `${job.jobId} routed to vendor ${vendorId}: ${reason}`,
      actorId: actor.id,
      actorRole: 'admin',
      targetId: job._id,
      targetType: 'B2BJob',
      changes: { vendorId: String(vendorId), override: Boolean(override && !candidate), eligibility: candidate || null }
    });

    try {
      const { createNotification } = require('../notificationControllers/notificationController');
      await createNotification({
        vendorId,
        type: 'b2b_job_request',
        title: 'Job assigned to you by WBI',
        message: `${job.service} — ${job.city}. Please assign an engineer.`,
        relatedId: job._id,
        relatedType: 'b2b_job',
        priority: 'high'
      });
    } catch (_) { /* non-blocking */ }

    return res.status(200).json({ success: true, message: 'Job routed to vendor', data: result.job });
  } catch (error) {
    return sendJobError(res, error, 'Failed to route job to vendor');
  }
};

/**
 * Services that no catalog category covers — the reason a batch of jobs cannot
 * be routed at all. Admin fixes these by adding the category, then retrying.
 */
const listUnmatchedServices = async (_req, res) => {
  try {
    const rows = await B2BJob.aggregate([
      { $match: { allocationReason: { $regex: 'not an offered service|No service category configured', $options: 'i' } } },
      {
        $group: {
          _id: '$service',
          jobs: { $sum: 1 },
          cities: { $addToSet: '$city' },
          lastSeen: { $max: '$allocationUpdatedAt' }
        }
      },
      { $sort: { jobs: -1 } }
    ]);
    return res.status(200).json({
      success: true,
      data: rows.map((r) => ({
        service: r._id,
        jobs: r.jobs,
        cities: (r.cities || []).filter(Boolean),
        lastSeen: r.lastSeen
      }))
    });
  } catch (error) {
    console.error('[admin b2b listUnmatchedServices]', error);
    return res.status(500).json({ success: false, message: 'Failed to load unmatched services' });
  }
};

/**
 * Admin QA/Review: List submitted B2B job completions
 */
const listSubmissions = async (req, res) => {
  try {
    const { status, search, page: pageReq, limit: limitReq } = req.query;
    const page = Math.max(1, parseInt(pageReq, 10) || 1);
    const limit = Math.min(100, parseInt(limitReq, 10) || 25);

    const filter = {};
    if (status && status !== 'all') {
      if (status === 'pending_review') {
        filter.status = { $in: ['completion_submitted', 'admin_review'] };
      } else {
        filter.status = status;
      }
    } else {
      filter.status = { $in: ['completion_submitted', 'admin_review', 'completed', 'revision_required'] };
    }

    if (search && String(search).trim()) {
      const q = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(q, 'i');
      filter.$or = [
        { jobId: regex },
        { customerName: regex },
        { service: regex },
        { city: regex },
        { assignedToName: regex }
      ];
    }

    const [jobs, total, countsAgg] = await Promise.all([
      B2BJob.find(filter)
        .populate('companyId', 'companyName email phone')
        .populate('assignedTo', 'name phone email engineerType')
        .populate('assignedVendorId', 'vendorName businessName phone')
        .sort({ completionSubmittedAt: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-startOtp -endOtp')
        .lean(),
      B2BJob.countDocuments(filter),
      B2BJob.aggregate([
        { $match: { status: { $in: ['completion_submitted', 'admin_review', 'completed', 'revision_required'] } } },
        { $group: { _id: '$status', n: { $sum: 1 } } }
      ])
    ]);

    const countsMap = countsAgg.reduce((acc, r) => ({ ...acc, [r._id]: r.n }), {});
    const counts = {
      all: (countsMap.completion_submitted || 0) + (countsMap.admin_review || 0) + (countsMap.completed || 0) + (countsMap.revision_required || 0),
      pending_review: (countsMap.completion_submitted || 0) + (countsMap.admin_review || 0),
      completed: countsMap.completed || 0,
      revision_required: countsMap.revision_required || 0
    };

    return res.status(200).json({
      success: true,
      data: jobs,
      counts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('[admin b2b listSubmissions]', error);
    return res.status(500).json({ success: false, message: 'Failed to load submission queue' });
  }
};

/**
 * Admin QA/Review: Get submission detail for a specific B2B Job
 */
const getSubmissionDetail = async (req, res) => {
  try {
    const job = await B2BJob.findById(req.params.jobId)
      .populate('companyId', 'companyName email phone address')
      .populate('assignedTo', 'name phone email engineerType vendorId rating')
      .populate('assignedVendorId', 'vendorName businessName phone email')
      .select('-startOtp -endOtp')
      .lean();

    if (!job) return res.status(404).json({ success: false, message: 'Job submission not found' });

    const timeline = await JobStatusTimeline.find({ jobId: job._id }).sort({ createdAt: 1 }).lean();
    const history = await JobHistory.find({ jobId: job._id }).sort({ createdAt: -1 }).limit(30).lean();

    return res.status(200).json({
      success: true,
      data: {
        job,
        timeline,
        history
      }
    });
  } catch (error) {
    console.error('[admin b2b getSubmissionDetail]', error);
    return res.status(500).json({ success: false, message: 'Failed to load submission detail' });
  }
};

const emitToEngineer = (job, payload) => {
  try {
    const { getIO } = require('../../sockets');
    const io = getIO();
    if (io && job.assignedTo) io.to(`engineer:${String(job.assignedTo)}`).emit('b2b:jobStatusUpdated', payload);
  } catch (_) { /* non-blocking */ }
};

/**
 * Admin QA/Review: Approve B2B job completion & release escrow payout.
 * Only a job whose work was submitted (COMPLETED / VERIFICATION) can be
 * approved — approving a job nobody worked on would release payment for
 * nothing.
 */
const approveCompletion = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { remarks } = req.body || {};

    const job = await B2BJob.findById(jobId).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const now = new Date();
    const updated = await transitionJob({
      jobId: job._id,
      to: S.CLOSED,
      actor: { id: adminId, role: 'admin' },
      expectFrom: [S.COMPLETED, S.VERIFICATION],
      reason: remarks ? `Verified by admin: ${String(remarks).slice(0, 300)}` : 'Verified and closed by admin',
      event: 'VERIFIED_CLOSED',
      patch: { completedAt: job.completedAt || now }
    });

    let payout = null;
    try {
      const { releaseB2BJobEscrowPayment } = require('../../services/escrowReleaseEngine.service');
      payout = await releaseB2BJobEscrowPayment({ jobId: job._id, actor: { id: adminId, role: 'admin' } });
      if (!payout?.ok) console.warn(`[Admin Approve B2B Job] payout not released for ${job.jobId}:`, payout?.reason);
    } catch (escrowErr) {
      console.error('[Admin Approve B2B Job] Escrow release error:', escrowErr.message);
    }

    const { closeAssignmentForJob } = require('../../services/jobAssignment.service');
    await closeAssignmentForJob({ jobId: job._id, outcome: 'completed', actor: { id: adminId, role: 'admin' }, reason: 'Job verified and closed' })
      .catch((e) => console.warn('[Admin Approve B2B Job] assignment close:', e.message));

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId: job.assignedTo,
      status: 'completed',
      remarks: remarks || 'Admin approved job completion & released escrow payment'
    });

    emitToEngineer(updated, { jobId: String(job._id), status: updated.status, trackingStatus: updated.trackingStatus, updatedAt: now });

    const fresh = await B2BJob.findById(job._id).select('-startOtp -endOtp').lean();
    return res.status(200).json({
      success: true,
      message: payout?.ok
        ? 'Job completion approved and payout released successfully.'
        : `Job completion approved. Payout not released: ${payout?.reason || 'see payment logs'}`,
      job: fresh,
      payout
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to approve job completion');
  }
};

/**
 * Admin QA/Review: Request revision — the job goes back to IN_PROGRESS for
 * the same engineer; payout stays held.
 */
const rejectCompletion = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { remarks } = req.body || {};

    if (!remarks || !String(remarks).trim()) {
      return res.status(400).json({ success: false, message: 'Revision / Rejection remarks are required' });
    }

    const job = await B2BJob.findById(jobId).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const updated = await transitionJob({
      jobId: job._id,
      to: S.IN_PROGRESS,
      actor: { id: adminId, role: 'admin' },
      expectFrom: [S.COMPLETED, S.VERIFICATION],
      reason: `Revision requested by admin: ${String(remarks).slice(0, 300)}`,
      event: 'REVISION_REQUESTED',
      patch: { incompleteRemarks: remarks, payoutStatus: 'held' }
    });

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId: job.assignedTo,
      status: 'revision_required',
      remarks: `Admin requested revision: ${remarks}`
    });

    emitToEngineer(updated, { jobId: String(job._id), status: updated.status, trackingStatus: updated.trackingStatus, updatedAt: new Date() });

    return res.status(200).json({
      success: true,
      message: 'Revision requested from engineer successfully.',
      job: updated
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to request revision');
  }
};

module.exports = {
  listEscalations,
  getEscalationDetail,
  retryAllocation,
  manualAssign,
  suggestEngineers,
  suggestVendors,
  routeToVendor,
  listUnmatchedServices,
  listSubmissions,
  getSubmissionDetail,
  approveCompletion,
  rejectCompletion
};
