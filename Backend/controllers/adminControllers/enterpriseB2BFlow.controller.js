const {
  getFlowStatus,
  bootstrapFlowFromOpportunity,
  onMilestoneQaApproved,
  onMilestoneCustomerSignoff,
  onMilestoneB2bSignoff,
  resolveTemplateBundle
} = require('../../services/enterpriseB2BOrchestrator.service');
const EnterpriseProjectFlow = require('../../models/EnterpriseProjectFlow');

exports.getFlow = async (req, res) => {
  try {
    const { opportunityId, projectId, flowCode, b2bJobId } = req.query;
    const flow = await getFlowStatus({ opportunityId, projectId, flowCode, b2bJobId });
    if (!flow) {
      return res.status(404).json({ success: false, message: 'Enterprise flow not found' });
    }
    res.json({ success: true, data: flow });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.listFlows = async (req, res) => {
  try {
    const { status, categoryCode, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (categoryCode) filter.categoryCode = String(categoryCode).toUpperCase();
    const rows = await EnterpriseProjectFlow.find(filter)
      .sort({ updatedAt: -1 })
      .limit(Math.min(100, parseInt(limit, 10) || 50))
      .lean();
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.rebootstrap = async (req, res) => {
  try {
    const { opportunityId } = req.params;
    const flow = await bootstrapFlowFromOpportunity(opportunityId);
    res.json({ success: true, data: flow });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.approveMilestoneQa = async (req, res) => {
  try {
    const { projectId, milestoneId } = req.params;
    const result = await onMilestoneQaApproved({ projectId, milestoneId });
    if (result?.pending || result?.code === 'APPROVAL_PENDING') {
      return res.status(200).json({ success: true, pending: true, data: result });
    }
    if (result?.ok === false && result.status) {
      return res.status(result.status).json({ success: false, message: result.message, data: result });
    }
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.approveMilestoneCustomer = async (req, res) => {
  try {
    const { projectId, milestoneId } = req.params;
    const { approved = true } = req.body || {};
    const result = await onMilestoneCustomerSignoff({ projectId, milestoneId, approved });
    if (result?.pending || result?.code === 'APPROVAL_PENDING') {
      return res.status(200).json({ success: true, pending: true, data: result });
    }
    if (result?.ok === false && result.status) {
      return res.status(result.status).json({ success: false, message: result.message, data: result });
    }
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.approveMilestoneB2b = async (req, res) => {
  try {
    const { projectId, milestoneId } = req.params;
    const { approved = true } = req.body || {};
    const result = await onMilestoneB2bSignoff({ projectId, milestoneId, approved });
    if (result?.pending || result?.code === 'APPROVAL_PENDING') {
      return res.status(200).json({ success: true, pending: true, data: result });
    }
    if (result?.ok === false && result.status) {
      return res.status(result.status).json({ success: false, message: result.message, data: result });
    }
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.previewTemplateBundle = async (req, res) => {
  try {
    const code = String(req.params.categoryCode || '').toUpperCase();
    const bundle = await resolveTemplateBundle(code);
    res.json({
      success: true,
      data: {
        categoryCode: code,
        hasServiceConfig: !!bundle.serviceConfig,
        projectTemplate: bundle.projectTemplate
          ? { id: bundle.projectTemplate._id, name: bundle.projectTemplate.name, templateKey: bundle.projectTemplate.templateKey }
          : null,
        milestoneCount: bundle.milestoneTemplate?.milestones?.length || bundle.serviceConfig?.projectMilestones?.length || 0,
        paymentRules: bundle.serviceConfig?.paymentRules || {}
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
