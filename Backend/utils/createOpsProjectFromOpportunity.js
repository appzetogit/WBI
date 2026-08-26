const mongoose = require('mongoose');
const ServiceConfig = require('../models/ServiceConfig');
const VendorOpsProject = require('../models/VendorOpsProject');
const VendorOpsMilestone = require('../models/VendorOpsMilestone');

/**
 * Create VendorOpsProject + milestones from an awarded Opportunity.
 */
const createOpsProjectFromOpportunity = async (opportunity, vendorId, amount = 0) => {
  const code = String(opportunity.categoryCode || '').toUpperCase();
  const config = await ServiceConfig.findOne({ categoryCode: code, isActive: true }).lean().catch(() => null);

  // Prefer Project OS template milestones when linked by categoryCode
  let milestones = (config?.projectMilestones || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  milestones = milestones.map((m) => ({
    ...m,
    paymentPercent: Number(m.paymentPercent) || 0
  }));
  try {
    const ProjectTemplate = require('../models/projectOS/ProjectTemplate');
    const tpl = await ProjectTemplate.findOne({
      categoryCode: code,
      status: 'PUBLISHED',
      isDeleted: { $ne: true },
      isSnapshot: { $ne: true }
    })
      .select('templateKey milestoneTemplateId name')
      .lean();
    if (tpl?.milestoneTemplateId) {
      const MilestoneTemplate = require('../models/projectOS/MilestoneTemplate');
      const mt = await MilestoneTemplate.findById(tpl.milestoneTemplateId).lean();
      if (mt?.milestones?.length) {
        milestones = mt.milestones.map((m, idx) => ({
          order: m.order ?? idx + 1,
          title: m.title || m.name,
          defaultDays: m.defaultDays || m.durationDays || m.slaDays || 1,
          paymentPercent: Number(m.invoicePercentage) || Number(m.paymentPercent) || 0,
          proofTypes: m.proofTypes || []
        }));
      }
    }
  } catch {
    /* Project OS optional */
  }

  const paySum = milestones.reduce((s, m) => s + (Number(m.paymentPercent) || 0), 0);
  if (paySum > 0 && Math.abs(paySum - 100) > 0.5) {
    const scale = 100 / paySum;
    milestones = milestones.map((m) => ({
      ...m,
      paymentPercent: Math.round((Number(m.paymentPercent) || 0) * scale)
    }));
  }

  const clientName =
    opportunity.clientInfo?.company ||
    opportunity.clientInfo?.name ||
    'Client';

  const project = await VendorOpsProject.create({
    vendorId: new mongoose.Types.ObjectId(vendorId),
    title: opportunity.title,
    clientName,
    clientType: opportunity.clientInfo?.clientType === 'b2b' ? 'b2b' : 'individual',
    serviceCategoryCode: code || 'GEN',
    serviceCategoryName: opportunity.categoryName || config?.categoryName || code,
    projectType: opportunity.type === 'bulk_requirement' ? 'project' : 'installation',
    priority: opportunity.priority === 'urgent' ? 'urgent' : opportunity.priority === 'high' ? 'high' : 'normal',
    budget: Number(amount) || opportunity.budget?.max || opportunity.budget?.min || 0,
    city: opportunity.requirements?.cities?.[0] || opportunity.clientInfo?.city || '',
    siteCount: opportunity.requirements?.totalSites || 1,
    startDate: opportunity.requirements?.startDate || new Date(),
    status: 'planning',
    currentStage: milestones[0]?.title || 'Planning',
    upcomingMilestone: milestones[0]?.title || '',
    progress: 0,
    paymentStatus: 'pending',
    opportunityId: opportunity._id || null
  });

  const approvalFlow = config?.approvalFlow || {};
  const { initMilestoneSignoffs } = require('../services/milestoneApproval.service');

  if (milestones.length) {
    let cursor = new Date(project.startDate || Date.now());
    for (let idx = 0; idx < milestones.length; idx++) {
      const m = milestones[idx];
      const days = Number(m.defaultDays) || 1;
      cursor = new Date(cursor.getTime() + days * 86400000);
      const ms = new VendorOpsMilestone({
        vendorId: project.vendorId,
        projectId: project._id,
        title: m.title,
        serviceCategoryCode: code,
        sequence: m.order || idx + 1,
        paymentPercent: Number(m.paymentPercent) || 0,
        dueDate: new Date(cursor),
        status: 'pending',
        progress: 0,
        tasks: (m.proofTypes || []).map((p) => ({
          title: String(p).replace(/_/g, ' '),
          priority: 'normal',
          status: 'todo',
          checklist: []
        }))
      });
      initMilestoneSignoffs(ms, approvalFlow);
      await ms.save();
    }
  }

  try {
    const { onVendorOpsProjectCreated } = require('../services/enterpriseB2BOrchestrator.service');
    await onVendorOpsProjectCreated({
      opportunityId: opportunity._id,
      projectId: project._id,
      vendorId
    });
  } catch (orchErr) {
    console.warn('[createOpsProjectFromOpportunity] enterprise flow hook:', orchErr.message);
  }

  return project;
};

module.exports = { createOpsProjectFromOpportunity };
