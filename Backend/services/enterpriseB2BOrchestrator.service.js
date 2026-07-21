/**
 * Enterprise B2B flow orchestrator — template-driven lifecycle + event hooks.
 * No hardcoded service logic: resolves ServiceConfig + Project OS templates by categoryCode.
 */
const mongoose = require('mongoose');
const EnterpriseProjectFlow = require('../models/EnterpriseProjectFlow');
const Opportunity = require('../models/Opportunity');
const ServiceConfig = require('../models/ServiceConfig');
const ServiceRequest = require('../models/ServiceRequest');
const VendorOpsProject = require('../models/VendorOpsProject');
const { startAssignmentForOpportunity } = require('./projectAssignmentEngine.service');
const { lockEscrowForProject, resolvePaymentRules } = require('./escrowReleaseEngine.service');

const pushTimeline = (flow, key, label, meta = {}) => {
  if (!Array.isArray(flow.timeline)) flow.timeline = [];
  flow.timeline.push({ key, label, at: new Date(), meta });
  flow.lastEventAt = new Date();
};

async function resolveTemplateBundle(categoryCode) {
  const code = String(categoryCode || '').toUpperCase();
  const serviceConfig = await ServiceConfig.findOne({ categoryCode: code, isActive: true }).lean();
  let projectTemplate = null;
  let milestoneTemplate = null;
  let workflowTemplate = null;

  try {
    const ProjectTemplate = require('../models/projectOS/ProjectTemplate');
    const WorkflowTemplate = require('../models/projectOS/WorkflowTemplate');
    const MilestoneTemplate = require('../models/projectOS/MilestoneTemplate');

    projectTemplate = await ProjectTemplate.findOne({
      categoryCode: code,
      status: 'PUBLISHED',
      isDeleted: { $ne: true },
      isSnapshot: { $ne: true }
    }).lean();

    if (projectTemplate?.workflowTemplateId) {
      workflowTemplate = await WorkflowTemplate.findById(projectTemplate.workflowTemplateId).lean();
    }
    if (projectTemplate?.milestoneTemplateId) {
      milestoneTemplate = await MilestoneTemplate.findById(projectTemplate.milestoneTemplateId).lean();
    }
  } catch (e) {
    console.warn('[enterpriseB2B] template resolve:', e.message);
  }

  return { serviceConfig, projectTemplate, milestoneTemplate, workflowTemplate };
}

/**
 * Create or refresh enterprise flow when an opportunity is queued for marketplace.
 */
async function bootstrapFlowFromOpportunity(opportunityId, opts = {}) {
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity) return null;

  const code = opportunity.categoryCode;
  const bundle = await resolveTemplateBundle(code);

  let flow = await EnterpriseProjectFlow.findOne({ opportunityId: opportunity._id });
  if (!flow) {
    flow = new EnterpriseProjectFlow({
      categoryCode: code,
      categoryName: opportunity.categoryName,
      opportunityId: opportunity._id,
      serviceRequestId: opportunity.assignment?.serviceRequestId || opts.serviceRequestId || null,
      status: 'submitted',
      assignmentPhase: opportunity.assignment?.phase || 'project_created'
    });
  }

  flow.configSnapshot = {
    paymentRules: bundle.serviceConfig?.paymentRules || {},
    commissionRules: bundle.serviceConfig?.commissionRules || {},
    approvalFlow: bundle.serviceConfig?.approvalFlow || {},
    slaRules: bundle.serviceConfig?.slaRules || []
  };
  flow.templateSnapshot = {
    serviceConfigVersion: bundle.serviceConfig?.version || 1,
    projectTemplateId: bundle.projectTemplate?._id || null,
    workflowTemplateId: bundle.workflowTemplate?._id || null,
    milestoneTemplateId: bundle.milestoneTemplate?._id || null
  };

  pushTimeline(flow, 'project_created', 'Project requirement created', {
    opportunityCode: opportunity.opportunityCode,
    type: opportunity.type
  });
  pushTimeline(flow, 'validation', 'Validation & service mapping', { categoryCode: code });

  if (opportunity.type === 'bulk_requirement' || opportunity.type === 'b2b_opportunity') {
    flow.status = 'approved';
    pushTimeline(flow, 'approved', 'Internal / customer approval (auto for B2B intake)', {});
  }

  await flow.save();
  return flow;
}

/**
 * Link VendorOpsProject after vendor accepts; optionally lock escrow from paid service request.
 */
async function onVendorOpsProjectCreated({ opportunityId, projectId, vendorId }) {
  const opp = opportunityId
    ? await Opportunity.findById(opportunityId)
        .select('assignment.b2bJobId assignment.b2bCompanyId assignment.serviceRequestId')
        .lean()
    : null;

  const flow = await EnterpriseProjectFlow.findOne({ opportunityId });
  if (!flow) {
    await bootstrapFlowFromOpportunity(opportunityId);
  }
  const updated = await EnterpriseProjectFlow.findOneAndUpdate(
    { opportunityId },
    {
      $set: {
        vendorOpsProjectId: projectId,
        vendorId,
        status: 'vendor_assigned',
        assignmentPhase: 'awaiting_engineer',
        ...(opp?.assignment?.b2bJobId ? { b2bJobId: opp.assignment.b2bJobId } : {}),
        ...(opp?.assignment?.b2bCompanyId ? { b2bCompanyId: opp.assignment.b2bCompanyId } : {})
      }
    },
    { new: true }
  );
  if (updated) {
    pushTimeline(updated, 'vendor_assigned', 'Vendor committed — assign engineers', { projectId, vendorId });
    await updated.save();
  }

  let gross = 0;
  let paymentId = null;
  const srId = opp?.assignment?.serviceRequestId;
  if (srId) {
    const sr = await ServiceRequest.findById(srId).select('payment').lean();
    if (sr?.payment?.status === 'paid' && sr.payment.escrowStatus === 'held') {
      gross = Number(sr.payment.amount) || 0;
      paymentId = sr.payment.razorpayPaymentId;
    }
  }
  const project = await VendorOpsProject.findById(projectId).select('budget serviceCategoryCode').lean();
  if (!gross && project?.budget) gross = Number(project.budget);

  if (gross > 0) {
    await lockEscrowForProject({
      projectId,
      opportunityId,
      grossAmount: gross,
      paymentId,
      categoryCode: project?.serviceCategoryCode,
      configSnapshot: updated?.configSnapshot
    });
    await EnterpriseProjectFlow.updateOne(
      { opportunityId },
      {
        $set: {
          status: 'escrow_locked',
          'escrow.grossAmount': gross,
          'escrow.heldAmount': gross,
          'escrow.status': 'held'
        }
      }
    );
    const f2 = await EnterpriseProjectFlow.findOne({ opportunityId });
    if (f2) {
      pushTimeline(f2, 'escrow_locked', 'Customer funds held in escrow', { gross });
      await f2.save();
    }
  }

  return updated;
}

async function onEngineerAssigned(opportunityId, engineerId) {
  const flow = await EnterpriseProjectFlow.findOne({ opportunityId });
  if (!flow) return null;
  flow.status = 'engineer_assigned';
  pushTimeline(flow, 'engineer_assigned', 'Engineer accepted job', { engineerId });
  await flow.save();
  return flow;
}

async function onAssignmentEscalation(opportunityId, reason = 'vendor_queue_exhausted') {
  const flow = await EnterpriseProjectFlow.findOne({ opportunityId });
  if (!flow) return null;
  flow.status = 'admin_escalation';
  flow.assignmentPhase = reason;
  pushTimeline(flow, 'admin_escalation', 'Assignment escalated to admin', { reason });
  await flow.save();

  try {
    if (global.io) {
      global.io.to('admin-room').emit('enterprise:assignment_escalation', {
        opportunityId,
        flowCode: flow.flowCode,
        reason
      });
    }
  } catch (_) {}

  return flow;
}

async function tryReleaseMilestoneEscrow({ projectId, milestoneId, flow }) {
  const activeFlow =
    flow || (await EnterpriseProjectFlow.findOne({ vendorOpsProjectId: projectId }));
  if (!activeFlow) {
    const { releaseMilestoneEscrow } = require('./escrowReleaseEngine.service');
    return releaseMilestoneEscrow({ projectId, milestoneId });
  }

  const { releaseMilestoneEscrow } = require('./escrowReleaseEngine.service');
  const result = await releaseMilestoneEscrow({
    projectId,
    milestoneId,
    categoryCode: activeFlow.categoryCode,
    configSnapshot: activeFlow.configSnapshot
  });

  if (result.code === 'APPROVAL_PENDING') {
    if (result.pendingParty === 'customer') {
      activeFlow.status = 'awaiting_customer_approval';
      pushTimeline(activeFlow, 'awaiting_customer', 'Waiting for customer sign-off', { milestoneId });
    } else if (result.pendingParty === 'b2b') {
      activeFlow.status = 'awaiting_b2b_approval';
      pushTimeline(activeFlow, 'awaiting_b2b', 'Waiting for B2B client sign-off', { milestoneId });
    } else {
      activeFlow.status = 'qa_review';
    }
    await activeFlow.save();
    return { ok: false, pending: true, ...result };
  }

  if (result.ok) {
    activeFlow.status = 'milestone_released';
    pushTimeline(activeFlow, 'milestone_released', 'Escrow milestone slice released', result);
    if (activeFlow.escrow) {
      activeFlow.escrow.releasedAmount =
        (Number(activeFlow.escrow.releasedAmount) || 0) + (result.released || 0);
      activeFlow.escrow.status = result.ledgerStatus || 'partial_release';
    }
    await activeFlow.save();
  }
  return result;
}

async function onMilestoneQaApproved({ projectId, milestoneId }) {
  const flow = await EnterpriseProjectFlow.findOne({ vendorOpsProjectId: projectId });
  const { markMilestoneQaPassed } = require('./milestoneApproval.service');
  const qa = await markMilestoneQaPassed(milestoneId);
  if (!qa.ok) return qa;

  if (flow) {
    flow.status = 'qa_review';
    pushTimeline(flow, 'qa_passed', 'QA verification passed', { milestoneId });
    await flow.save();
  }

  return tryReleaseMilestoneEscrow({ projectId, milestoneId, flow });
}

async function onMilestoneCustomerSignoff({ projectId, milestoneId, approved = true }) {
  const { markMilestoneCustomerSignoff } = require('./milestoneApproval.service');
  const signed = await markMilestoneCustomerSignoff(milestoneId, { approved });
  if (!signed.ok) return signed;
  if (!approved) {
    return { ok: false, status: 400, message: 'Customer rejected milestone' };
  }
  const flow = await EnterpriseProjectFlow.findOne({ vendorOpsProjectId: projectId });
  if (flow) {
    pushTimeline(flow, 'customer_approved', 'Customer signed off milestone', { milestoneId });
    flow.status = 'customer_approved';
    await flow.save();
  }
  return tryReleaseMilestoneEscrow({ projectId, milestoneId, flow });
}

async function onMilestoneB2bSignoff({ projectId, milestoneId, approved = true }) {
  const { markMilestoneB2bSignoff } = require('./milestoneApproval.service');
  const signed = await markMilestoneB2bSignoff(milestoneId, { approved });
  if (!signed.ok) return signed;
  if (!approved) {
    return { ok: false, status: 400, message: 'B2B client rejected milestone' };
  }
  const flow = await EnterpriseProjectFlow.findOne({ vendorOpsProjectId: projectId });
  if (flow) {
    pushTimeline(flow, 'b2b_approved', 'B2B client signed off milestone', { milestoneId });
    await flow.save();
  }
  return tryReleaseMilestoneEscrow({ projectId, milestoneId, flow });
}

async function startAssignmentForFlow(opportunityId, opts = {}) {
  const flow = await bootstrapFlowFromOpportunity(opportunityId, opts);
  flow.status = 'assignment_active';
  pushTimeline(flow, 'assignment_started', 'Dynamic assignment engine started', {});
  await flow.save();
  await startAssignmentForOpportunity(opportunityId, opts);
  return flow;
}

async function getAssignmentMode(categoryCode, configSnapshot = null) {
  const rules = await resolvePaymentRules(categoryCode, configSnapshot);
  const mode = String(rules.assignmentMode || rules.marketplaceMode || 'engineer_direct').toLowerCase();
  if (mode === 'vendor_marketplace' || mode === 'vendor_first') return 'vendor_marketplace';
  return 'engineer_direct';
}

/**
 * B2B portal / bulk job — enterprise flow + wallet escrow + optional vendor marketplace.
 */
async function bootstrapFlowFromB2BJob(jobId) {
  const B2BJob = require('../models/B2BJob');
  const job = await B2BJob.findById(jobId).lean();
  if (!job) return null;

  const { resolveCategoryCode } = require('../utils/createOpportunityFromEnquiry');
  const categoryCode = await resolveCategoryCode({
    enquiryType: 'b2b',
    equipmentType: [job.service, job.subService].filter(Boolean)
  });
  const bundle = await resolveTemplateBundle(categoryCode);
  const categoryName = bundle.serviceConfig?.categoryName || job.service;

  let flow = await EnterpriseProjectFlow.findOne({ b2bJobId: job._id });
  if (!flow) {
    flow = new EnterpriseProjectFlow({
      categoryCode,
      categoryName,
      b2bJobId: job._id,
      b2bCompanyId: job.companyId,
      status: 'escrow_locked',
      escrow: {
        currency: 'INR',
        grossAmount: Number(job.charge) || 0,
        heldAmount: Number(job.charge) || 0,
        releasedAmount: 0,
        status: job.paymentStatus === 'deducted' ? 'held' : 'pending'
      }
    });
  }

  flow.configSnapshot = {
    paymentRules: bundle.serviceConfig?.paymentRules || {},
    commissionRules: bundle.serviceConfig?.commissionRules || {},
    approvalFlow: bundle.serviceConfig?.approvalFlow || {},
    slaRules: bundle.serviceConfig?.slaRules || []
  };
  flow.templateSnapshot = {
    serviceConfigVersion: bundle.serviceConfig?.version || 1,
    projectTemplateId: bundle.projectTemplate?._id || null,
    workflowTemplateId: bundle.workflowTemplate?._id || null,
    milestoneTemplateId: bundle.milestoneTemplate?._id || null
  };

  const { parseApprovalFlow } = require('./milestoneApproval.service');
  const af = parseApprovalFlow(flow.configSnapshot);
  if (!flow.jobSignoffs) flow.jobSignoffs = {};
  flow.jobSignoffs.customer = af.customerSignoffRequired ? 'pending' : 'not_required';
  flow.jobSignoffs.b2b = af.b2bSignoffRequired ? 'pending' : 'not_required';

  pushTimeline(flow, 'submitted', 'B2B job submitted', { jobId: job.jobId });
  pushTimeline(flow, 'escrow_locked', 'B2B wallet funds reserved', {
    amount: job.charge,
    paymentStatus: job.paymentStatus
  });
  await flow.save();

  if (job.paymentStatus === 'deducted' && Number(job.charge) > 0) {
    const EscrowLedger = require('../models/EscrowLedger');
    const existing = await EscrowLedger.findOne({ sourceType: 'b2b_job', sourceId: job._id }).lean();
    if (!existing) {
      await EscrowLedger.create({
        paymentId: job._id,
        sourceType: 'b2b_job',
        sourceId: job._id,
        grossAmount: job.charge,
        heldAmount: job.charge,
        status: 'held',
        releaseReason: `b2b:${job.jobId}`
      });
    }
  }

  const mode = await getAssignmentMode(categoryCode, flow.configSnapshot);
  if (mode === 'vendor_marketplace' && job.status === 'searching_engineer') {
    const { createOpportunityFromB2BJob } = require('../utils/createOpportunityFromEnquiry');
    const fresh = await B2BJob.findById(jobId);
    const { opportunity, eligibleCount } = await createOpportunityFromB2BJob(fresh);
    if (opportunity) {
      flow.opportunityId = opportunity._id;
      flow.status = 'assignment_active';
      pushTimeline(flow, 'assignment_started', 'Routed to vendor marketplace', {
        opportunityId: opportunity._id,
        eligibleCount
      });
      await flow.save();
      await B2BJob.updateOne({ _id: job._id }, { $set: { status: 'pending' } });
    }
  }

  return flow;
}

async function releaseB2BJobEscrow(jobId) {
  const EscrowLedger = require('../models/EscrowLedger');
  await EscrowLedger.updateOne(
    { sourceType: 'b2b_job', sourceId: jobId },
    { $set: { status: 'released', releaseReason: 'job_completed_approved' } }
  );
}

async function onB2BJobCompleted(jobId, { status = 'completed' } = {}) {
  const flow = await EnterpriseProjectFlow.findOne({ b2bJobId: jobId });
  if (!flow) return { skipped: true };

  const { parseApprovalFlow } = require('./milestoneApproval.service');
  const af = parseApprovalFlow(flow.configSnapshot);

  if (status === 'completed') {
    pushTimeline(flow, 'work_completed', 'Field work marked complete', {});

    const needsCustomer =
      af.customerSignoffRequired && flow.jobSignoffs?.customer === 'pending';
    const needsB2b = af.b2bSignoffRequired && flow.jobSignoffs?.b2b === 'pending';

    if (needsCustomer || needsB2b) {
      if (needsCustomer) {
        flow.status = 'awaiting_customer_approval';
        pushTimeline(flow, 'awaiting_customer', 'Awaiting customer sign-off', {});
      } else {
        flow.status = 'awaiting_b2b_approval';
        pushTimeline(flow, 'awaiting_b2b', 'Awaiting B2B client sign-off', {});
      }
      await flow.save();
      return { ok: true, pendingSignoff: true, flow };
    }

    flow.status = 'closed';
    pushTimeline(flow, 'closed', 'B2B field job completed', {});
    await releaseB2BJobEscrow(jobId);
    if (flow.escrow) {
      flow.escrow.releasedAmount = flow.escrow.heldAmount;
      flow.escrow.status = 'released';
    }
  } else {
    flow.status = 'cancelled';
    pushTimeline(flow, 'cancelled', 'B2B job closed incomplete', { status });
  }
  await flow.save();
  return flow;
}

async function resolveB2BJobRef(jobRef) {
  const B2BJob = require('../models/B2BJob');
  if (mongoose.Types.ObjectId.isValid(jobRef)) {
    const byId = await B2BJob.findById(jobRef).lean();
    if (byId) return byId;
  }
  return B2BJob.findOne({ jobId: String(jobRef) }).lean();
}

async function finalizeB2BJobAfterSignoffs(flow, jobId) {
  const stillNeedCustomer = flow.jobSignoffs?.customer === 'pending';
  const stillNeedB2b = flow.jobSignoffs?.b2b === 'pending';

  if (stillNeedCustomer) {
    flow.status = 'awaiting_customer_approval';
    await flow.save();
    return { ok: true, pending: 'customer_signoff', flow };
  }
  if (stillNeedB2b) {
    flow.status = 'awaiting_b2b_approval';
    await flow.save();
    return { ok: true, pending: 'b2b_signoff', flow };
  }

  flow.status = 'closed';
  pushTimeline(flow, 'closed', 'B2B job closed after sign-offs', {});
  await releaseB2BJobEscrow(jobId);
  if (flow.escrow) {
    flow.escrow.releasedAmount = flow.escrow.heldAmount;
    flow.escrow.status = 'released';
  }
  await flow.save();
  return { ok: true, flow };
}

async function approveB2BJobWork(jobId, companyId, { party = 'b2b', approved = true } = {}) {
  const B2BJob = require('../models/B2BJob');
  let job;
  if (party === 'customer') {
    job = await resolveB2BJobRef(jobId);
  } else {
    job = await B2BJob.findOne({ _id: jobId, companyId }).lean();
  }
  if (!job) return { ok: false, status: 404, message: 'Job not found' };

  const flow = await EnterpriseProjectFlow.findOne({ b2bJobId: job._id });
  if (!flow) return { ok: false, status: 404, message: 'Enterprise flow not found' };

  if (!flow.jobSignoffs) flow.jobSignoffs = {};
  const now = new Date();

  if (party === 'b2b') {
    if (flow.jobSignoffs.b2b === 'not_required') {
      return { ok: true, skipped: true, message: 'B2B sign-off not required' };
    }
    flow.jobSignoffs.b2b = approved ? 'approved' : 'rejected';
    flow.jobSignoffs.b2bAt = now;
    pushTimeline(flow, 'b2b_approved', approved ? 'B2B client approved work' : 'B2B client rejected', {});
  } else if (party === 'customer') {
    if (flow.jobSignoffs.customer === 'not_required') {
      return { ok: true, skipped: true, message: 'Customer sign-off not required' };
    }
    flow.jobSignoffs.customer = approved ? 'approved' : 'rejected';
    flow.jobSignoffs.customerAt = now;
    pushTimeline(
      flow,
      'customer_approved',
      approved ? 'End customer approved work' : 'End customer rejected work',
      {}
    );
  } else {
    return { ok: false, status: 400, message: 'Invalid approval party' };
  }

  if (!approved) {
    flow.status = 'cancelled';
    await flow.save();
    return { ok: false, status: 400, message: 'Work rejected' };
  }

  return finalizeB2BJobAfterSignoffs(flow, job._id);
}

async function approveServiceRequestMilestoneCustomer({ serviceRequestId, milestoneId, approved = true }) {
  const sr = await ServiceRequest.findById(serviceRequestId).select('requestCode opportunityId').lean();
  if (!sr) return { ok: false, status: 404, message: 'Service request not found' };

  let projectId = null;
  const flow = await EnterpriseProjectFlow.findOne({
    $or: [{ serviceRequestId }, { opportunityId: sr.opportunityId }]
  }).lean();
  if (flow?.vendorOpsProjectId) {
    projectId = flow.vendorOpsProjectId;
  } else if (sr.opportunityId) {
    const VendorOpsProject = require('../models/VendorOpsProject');
    const p = await VendorOpsProject.findOne({ opportunityId: sr.opportunityId }).select('_id').lean();
    projectId = p?._id;
  }
  if (!projectId) {
    return { ok: false, status: 404, message: 'No vendor project linked to this request yet' };
  }

  return onMilestoneCustomerSignoff({ projectId, milestoneId, approved });
}

/**
 * When all ops jobs complete — release milestone escrow slices or fall back to SR escrow.
 */
async function autoFinalizeProjectEscrow(projectId) {
  const milestones = await require('../models/VendorOpsMilestone')
    .find({ projectId })
    .sort({ sequence: 1 })
    .lean();
  const withPay = milestones.filter((m) => Number(m.paymentPercent) > 0);
  const EscrowLedger = require('../models/EscrowLedger');
  const projectLedger = await EscrowLedger.findOne({
    sourceType: 'project',
    sourceId: projectId,
    status: { $in: ['held', 'partial_release'] }
  }).lean();

  if (projectLedger && withPay.length) {
    const { markMilestoneQaPassed } = require('./milestoneApproval.service');
    for (const m of withPay) {
      const doc = await require('../models/VendorOpsMilestone').findById(m._id);
      if (!doc || doc.status === 'completed') continue;
      await markMilestoneQaPassed(m._id);
      await tryReleaseMilestoneEscrow({
        projectId,
        milestoneId: m._id,
        flow: await EnterpriseProjectFlow.findOne({ vendorOpsProjectId: projectId })
      });
    }
    const flow = await EnterpriseProjectFlow.findOne({ vendorOpsProjectId: projectId });
    if (flow) {
      const pending = await require('../models/VendorOpsMilestone').countDocuments({
        projectId,
        status: { $ne: 'completed' }
      });
      if (!pending) {
        flow.status = 'payment_released';
        pushTimeline(flow, 'payment_released', 'All milestones settled');
        flow.status = 'closed';
        pushTimeline(flow, 'closed', 'Project closed');
        await flow.save();
      }
    }
    return { ok: true, mode: 'milestone' };
  }

  const { releaseVendorEscrowIfProjectComplete } = require('./serviceRequestPayment.service');
  return releaseVendorEscrowIfProjectComplete(projectId);
}

async function getFlowStatus({ opportunityId, projectId, flowCode, b2bJobId }) {
  const q = {};
  if (opportunityId) q.opportunityId = opportunityId;
  else if (projectId) q.vendorOpsProjectId = projectId;
  else if (b2bJobId) q.b2bJobId = b2bJobId;
  else if (flowCode) q.flowCode = flowCode;
  else return null;
  return EnterpriseProjectFlow.findOne(q).lean();
}

module.exports = {
  resolveTemplateBundle,
  bootstrapFlowFromOpportunity,
  bootstrapFlowFromB2BJob,
  onVendorOpsProjectCreated,
  onEngineerAssigned,
  onAssignmentEscalation,
  onMilestoneQaApproved,
  onMilestoneCustomerSignoff,
  onMilestoneB2bSignoff,
  tryReleaseMilestoneEscrow,
  onB2BJobCompleted,
  approveB2BJobWork,
  approveServiceRequestMilestoneCustomer,
  autoFinalizeProjectEscrow,
  startAssignmentForFlow,
  getFlowStatus,
  getAssignmentMode,
  resolvePaymentRules
};
