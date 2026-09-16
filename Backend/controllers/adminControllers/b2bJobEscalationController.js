/**
 * Admin escalation queue for B2B jobs.
 *
 * A job lands here when neither the engineer waves, the vendor marketplace nor
 * the freelancer pool could take it. Admin can see why, retry the automated
 * allocation, or assign an engineer directly.
 */
const mongoose = require('mongoose');
const B2BJob = require('../../models/B2BJob');
const B2BCompany = require('../../models/B2BCompany');
const Engineer = require('../../models/Engineer');
const JobHistory = require('../../models/JobHistory');
const Opportunity = require('../../models/Opportunity');

/** Jobs that need a human: escalated, or parked in a stage past its SLA. */
const buildEscalationFilter = (query = {}) => {
  const stalledBefore = new Date(Date.now() - (parseInt(query.stalledMinutes, 10) || 120) * 60 * 1000);
  const filter = {
    $or: [
      { status: 'escalated' },
      { allocationStage: 'admin_escalation' },
      {
        status: { $in: ['pending', 'searching_engineer'] },
        assignedTo: null,
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
          'jobId companyId customerName phone service subService city address charge priority status ' +
            'allocationStage allocationReason allocationUpdatedAt rematchCount paymentStatus createdAt'
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
      data: jobs.map((j) => ({ ...j, companyName: companyMap.get(String(j.companyId)) || '' })),
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
    const job = await B2BJob.findById(req.params.jobId).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const [company, history, opportunity] = await Promise.all([
      B2BCompany.findById(job.companyId).select('companyName email phone').lean(),
      JobHistory.find({ jobId: job._id }).sort({ createdAt: -1 }).limit(30).lean(),
      Opportunity.findOne({ 'assignment.b2bJobId': job._id })
        .sort({ createdAt: -1 })
        .select('opportunityCode type status categoryCode categoryName assignment.phase assignment.vendorQueue')
        .lean()
    ]);

    return res.status(200).json({
      success: true,
      data: {
        job,
        company,
        history,
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

const retryAllocation = async (req, res) => {
  try {
    const { rematchB2BJob } = require('../../services/b2bJobRematch.service');
    const result = await rematchB2BJob(req.params.jobId, {
      actorRole: 'admin',
      actorId: req.user.id,
      note: String(req.body?.note || 'Admin retriggered allocation').slice(0, 200)
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }
    return res.status(200).json({
      success: true,
      message: 'Allocation restarted',
      data: { attempt: result.attempt }
    });
  } catch (error) {
    console.error('[admin b2b retryAllocation]', error);
    return res.status(500).json({ success: false, message: 'Failed to restart allocation' });
  }
};

/**
 * Direct assignment bypasses matching entirely — used when admin already knows
 * who will do the work. Escrow is re-held first so the job stays funded.
 */
const manualAssign = async (req, res) => {
  try {
    const { engineerId, note } = req.body || {};
    if (!engineerId || !mongoose.Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, message: 'A valid engineerId is required' });
    }

    const job = await B2BJob.findById(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    if (['completed', 'closed', 'cancelled'].includes(job.status)) {
      return res.status(400).json({ success: false, message: `Job is already ${job.status}` });
    }
    if (job.assignedTo) {
      return res.status(400).json({ success: false, message: 'Job already has an assigned engineer' });
    }

    const engineer = await Engineer.findById(engineerId).select('name phone approvalStatus isActive');
    if (!engineer) return res.status(404).json({ success: false, message: 'Engineer not found' });
    if (engineer.approvalStatus !== 'approved' || engineer.isActive === false) {
      return res.status(400).json({ success: false, message: 'Engineer is not approved / active' });
    }

    const charge = Number(job.charge) || 0;
    if (charge > 0) {
      const { holdB2BJobEscrow } = require('../../services/escrowReleaseEngine.service');
      const escrow = await holdB2BJobEscrow({
        companyId: job.companyId,
        jobId: job._id,
        amount: charge,
        remark: `Admin manual assign ${job.jobId}`
      });
      if (!escrow.ok) {
        return res.status(400).json({
          success: false,
          message:
            escrow.reason === 'insufficient_balance'
              ? 'Company wallet balance is insufficient to fund this job'
              : `Could not hold escrow (${escrow.reason})`
        });
      }
      job.paymentStatus = 'escrow_locked';
    }

    const { assignJobToEngineer } = require('../../services/b2bMatchingService');
    // The matcher only assigns jobs it considers still in-flight.
    job.status = 'searching_engineer';
    await job.save();
    await assignJobToEngineer(job, engineer);

    await JobHistory.create({
      jobId: job._id,
      status: 'assigned',
      remark: `Manually assigned to ${engineer.name} by admin${note ? ` — ${note}` : ''}.`,
      role: 'admin'
    }).catch(() => {});

    const fresh = await B2BJob.findById(job._id).select('status assignedTo assignedToName').lean();
    if (fresh?.status !== 'assigned') {
      return res.status(500).json({ success: false, message: 'Assignment did not complete — check job state' });
    }

    return res.status(200).json({
      success: true,
      message: `Assigned to ${engineer.name}`,
      data: fresh
    });
  } catch (error) {
    console.error('[admin b2b manualAssign]', error);
    return res.status(500).json({ success: false, message: 'Failed to assign engineer' });
  }
};

/** Candidate engineers for manual assignment, nearest first when we have coords. */
const suggestEngineers = async (req, res) => {
  try {
    const job = await B2BJob.findById(req.params.jobId).select('coordinates city service').lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const base = { approvalStatus: 'approved', isActive: true, roleType: { $in: ['Engineer', 'Both'] } };
    const coords = job.coordinates?.coordinates || [];
    let engineers = [];

    if (coords.length === 2 && !(coords[0] === 0 && coords[1] === 0)) {
      engineers = await Engineer.find({
        ...base,
        geoLocation: {
          $nearSphere: {
            $geometry: { type: 'Point', coordinates: [coords[0], coords[1]] },
            $maxDistance: 200000
          }
        }
      })
        .select('name phone status city averageRating secondarySkills')
        .limit(25)
        .lean();
    }

    if (!engineers.length) {
      engineers = await Engineer.find(base)
        .select('name phone status city averageRating secondarySkills')
        .limit(25)
        .lean();
    }

    return res.status(200).json({ success: true, data: engineers });
  } catch (error) {
    console.error('[admin b2b suggestEngineers]', error);
    return res.status(500).json({ success: false, message: 'Failed to load engineers' });
  }
};

/**
 * Services that no catalog category covers — the reason a batch of jobs cannot
 * be routed at all. Admin fixes these by adding the category, then retrying.
 */
const listUnmatchedServices = async (_req, res) => {
  try {
    const rows = await B2BJob.aggregate([
      { $match: { allocationReason: { $regex: 'No service category configured', $options: 'i' } } },
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
      const q = String(search).trim();
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

/**
 * Admin QA/Review: Approve B2B job completion & release escrow payout
 */
const approveCompletion = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { remarks } = req.body;

    const job = await B2BJob.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (['completed', 'cancelled', 'failed'].includes(job.status)) {
      return res.status(400).json({ success: false, message: `Job is already ${job.status}` });
    }

    const now = new Date();
    job.status = 'completed';
    job.trackingStatus = 'completed';
    job.completedAt = job.completedAt || now;

    await job.save();

    // Release held B2B escrow payment
    try {
      const { releaseB2BJobEscrowPayment } = require('../../services/escrowReleaseEngine.service');
      const releaseResult = await releaseB2BJobEscrowPayment({
        jobId: job._id,
        actor: { id: adminId, role: 'admin' }
      });
      console.log(`[Admin Approve B2B Job] Escrow release result for ${job.jobId}:`, releaseResult);
      if (releaseResult?.ok) {
        job.payoutStatus = 'released';
        await job.save();
      }
    } catch (escrowErr) {
      console.error('[Admin Approve B2B Job] Escrow release error:', escrowErr.message);
    }

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId: job.assignedTo,
      status: 'completed',
      remarks: remarks || 'Admin approved job completion & released escrow payment'
    });

    await JobHistory.create({
      jobId: job._id,
      status: 'completed',
      remark: `Admin approved completion. ${remarks || ''}`,
      role: 'admin',
      changedBy: adminId
    });

    // Realtime Sockets
    try {
      const { getIO } = require('../../sockets');
      const io = getIO();
      if (io) {
        const payload = { jobId: job._id.toString(), status: 'completed', trackingStatus: 'completed', updatedAt: now };
        io.to(`b2b:${job.companyId.toString()}`).emit('b2b:jobStatusUpdated', payload);
        io.to('admin').emit('b2b:jobStatusUpdated', payload);
        if (job.assignedTo) {
          io.to(`engineer:${job.assignedTo.toString()}`).emit('b2b:jobStatusUpdated', payload);
        }
      }
    } catch (e) {
      /* ignore socket emit warning */
    }

    return res.status(200).json({
      success: true,
      message: 'Job completion approved and payout released successfully.',
      job
    });
  } catch (error) {
    console.error('[admin b2b approveCompletion]', error);
    return res.status(500).json({ success: false, message: 'Failed to approve job completion' });
  }
};

/**
 * Admin QA/Review: Request Revision / Reject B2B job completion
 */
const rejectCompletion = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { remarks } = req.body;

    if (!remarks || !String(remarks).trim()) {
      return res.status(400).json({ success: false, message: 'Revision / Rejection remarks are required' });
    }

    const job = await B2BJob.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const now = new Date();
    job.status = 'revision_required';
    job.trackingStatus = 'revision_required';
    job.incompleteRemarks = remarks;
    job.payoutStatus = 'held';

    await job.save();

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId: job.assignedTo,
      status: 'revision_required',
      remarks: `Admin requested revision: ${remarks}`
    });

    await JobHistory.create({
      jobId: job._id,
      status: 'revision_required',
      remark: `Admin rejected submission / requested revision: ${remarks}`,
      role: 'admin',
      changedBy: adminId
    });

    // Realtime Sockets
    try {
      const { getIO } = require('../../sockets');
      const io = getIO();
      if (io) {
        const payload = { jobId: job._id.toString(), status: 'revision_required', trackingStatus: 'revision_required', updatedAt: now };
        io.to(`b2b:${job.companyId.toString()}`).emit('b2b:jobStatusUpdated', payload);
        io.to('admin').emit('b2b:jobStatusUpdated', payload);
        if (job.assignedTo) {
          io.to(`engineer:${job.assignedTo.toString()}`).emit('b2b:jobStatusUpdated', payload);
        }
      }
    } catch (e) {
      /* ignore socket emit warning */
    }

    return res.status(200).json({
      success: true,
      message: 'Revision requested from engineer successfully.',
      job
    });
  } catch (error) {
    console.error('[admin b2b rejectCompletion]', error);
    return res.status(500).json({ success: false, message: 'Failed to request revision' });
  }
};

module.exports = {
  listEscalations,
  getEscalationDetail,
  retryAllocation,
  manualAssign,
  suggestEngineers,
  listUnmatchedServices,
  listSubmissions,
  getSubmissionDetail,
  approveCompletion,
  rejectCompletion
};
