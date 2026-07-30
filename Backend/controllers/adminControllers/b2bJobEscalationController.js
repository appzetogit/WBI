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

module.exports = {
  listEscalations,
  getEscalationDetail,
  retryAllocation,
  manualAssign,
  suggestEngineers,
  listUnmatchedServices
};
