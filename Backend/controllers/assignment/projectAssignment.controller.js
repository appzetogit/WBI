const Opportunity = require('../../models/Opportunity');
const VendorOpsMilestone = require('../../models/VendorOpsMilestone');
const EnterpriseProjectFlow = require('../../models/EnterpriseProjectFlow');
const ProjectAssignmentConfig = require('../../models/ProjectAssignmentConfig');
const {
  getPublicTimeline,
  getAssignmentConfig,
  freelancerAcceptProject,
  findMatchingFreelancers
} = require('../../services/projectAssignmentEngine.service');
const { requireOwnedServiceRequest } = require('../../services/serviceRequestAccess.service');

/** GET /api/public/service-requests/:requestCode/assignment (owner only) */
exports.getAssignmentByRequestCode = async (req, res) => {
  try {
    const owned = await requireOwnedServiceRequest(req, res);
    if (!owned) return;
    const sr = owned.toObject();

    let opportunity = null;
    if (sr.opportunityId) {
      opportunity = await Opportunity.findById(sr.opportunityId).lean();
    } else {
      opportunity = await Opportunity.findOne({
        'assignment.serviceRequestId': sr._id
      }).lean();
    }

    const paymentPending = sr.payment?.status === 'pending';

    let pendingCustomerMilestones = [];
    const oppIdForFlow = opportunity?._id || sr.opportunityId;
    const flowOr = [{ serviceRequestId: sr._id }];
    if (oppIdForFlow) flowOr.push({ opportunityId: oppIdForFlow });
    const flow = await EnterpriseProjectFlow.findOne({ $or: flowOr })
      .select('vendorOpsProjectId')
      .lean();
    const projectId = flow?.vendorOpsProjectId;
    if (projectId) {
      pendingCustomerMilestones = await VendorOpsMilestone.find({
        projectId,
        customerSignoff: 'pending',
        qaStatus: 'passed'
      })
        .select('_id title milestoneCode sequence')
        .sort({ sequence: 1 })
        .lean();
    }

    if (!opportunity) {
      const timeline = paymentPending
        ? [
            { key: 'payment', label: 'Complete payment', done: false, current: true },
            { key: 'matching', label: 'Vendor matching', done: false, current: false }
          ]
        : getPublicTimeline({ _id: sr._id, assignment: { phase: 'project_created', timeline: [] } });

      return res.json({
        success: true,
        data: {
          requestCode: sr.requestCode,
          status: sr.status,
          paymentStatus: sr.payment?.status,
          paymentAmount: sr.payment?.amount,
          phase: paymentPending ? 'awaiting_payment' : 'project_created',
          timeline,
          message: paymentPending
            ? 'Complete payment to start vendor matching'
            : 'Waiting for vendor matching',
          pendingCustomerMilestones
        }
      });
    }

    res.json({
      success: true,
      data: {
        requestCode: sr.requestCode,
        opportunityId: opportunity._id,
        opportunityCode: opportunity.opportunityCode,
        status: sr.status,
        paymentStatus: sr.payment?.status,
        paymentAmount: sr.payment?.amount,
        phase: opportunity.assignment?.phase,
        requiredEngineers: opportunity.assignment?.requiredEngineers || 1,
        timeline: getPublicTimeline(opportunity),
        events: opportunity.assignment?.timeline || [],
        pendingCustomerMilestones,
        vendorOpsProjectId: projectId || null
      }
    });
  } catch (error) {
    console.error('getAssignmentByRequestCode', error);
    res.status(500).json({ success: false, message: 'Failed to load assignment status' });
  }
};

/** Admin: list assignment configs */
exports.listAssignmentConfigs = async (req, res) => {
  try {
    const docs = await ProjectAssignmentConfig.find().sort({ categoryCode: 1 }).lean();
    res.json({ success: true, data: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Admin: upsert config */
exports.upsertAssignmentConfig = async (req, res) => {
  try {
    const categoryCode = String(req.params.categoryCode || req.body.categoryCode || 'DEFAULT').toUpperCase();
    const allowed = [
      'label',
      'isActive',
      'vendorResponseTimeoutMinutes',
      'maxVendorsToNotify',
      'vendorRetryCount',
      'vendorBatchSize',
      'priorityMode',
      'releaseToFreelancerOnVendorExhausted',
      'freelancerPoolVendorId',
      'scoringWeights'
    ];
    const patch = { categoryCode };
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.vendorResponseTimeoutMinutes != null) {
      patch.vendorResponseTimeoutMinutes = Math.min(1440, Math.max(5, Number(patch.vendorResponseTimeoutMinutes)));
    }
    if (patch.maxVendorsToNotify != null) {
      patch.maxVendorsToNotify = Math.min(50, Math.max(1, Number(patch.maxVendorsToNotify)));
    }
    if (patch.vendorBatchSize != null) {
      patch.vendorBatchSize = Math.min(20, Math.max(1, Number(patch.vendorBatchSize)));
    }
    if (patch.freelancerPoolVendorId === '') patch.freelancerPoolVendorId = null;

    const doc = await ProjectAssignmentConfig.findOneAndUpdate(
      { categoryCode },
      { $set: patch },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Engineer: list freelancer pool projects */
exports.listFreelancerPool = async (req, res) => {
  try {
    const engineerId = req.user._id || req.user.id;
    const opportunities = await Opportunity.find({
      status: 'open',
      'assignment.phase': 'freelancer_pool'
    })
      .sort({ 'assignment.freelancerPoolReleasedAt': -1 })
      .limit(30)
      .lean();

    const list = opportunities.map((o) => ({
      _id: o._id,
      opportunityCode: o.opportunityCode,
      title: o.title,
      city: o.clientInfo?.city,
      budget: o.budget,
      requiredEngineers: o.assignment?.requiredEngineers || 1,
      categoryName: o.categoryName
    }));

    res.json({ success: true, data: { jobs: list, engineerId } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Engineer: accept from pool with confirmation checklist */
exports.acceptFreelancerPool = async (req, res) => {
  try {
    const engineerId = req.user._id || req.user.id;
    const { id } = req.params;
    const body = req.body || {};
    const result = await freelancerAcceptProject(id, engineerId, body);
    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }
    res.json({
      success: true,
      message: 'Project accepted. Coordinate your team and begin execution.',
      data: {
        opportunityId: result.opportunity._id,
        projectId: result.projectId || null,
        opsWarning: result.opsWarning || null,
        confirmation: result.confirmation || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = exports;
