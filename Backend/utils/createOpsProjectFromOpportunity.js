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
          defaultDays: m.defaultDays || m.durationDays || 1,
          proofTypes: m.proofTypes || []
        }));
      }
    }
  } catch {
    /* Project OS optional */
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

  if (milestones.length) {
    let cursor = new Date(project.startDate || Date.now());
    for (let idx = 0; idx < milestones.length; idx++) {
      const m = milestones[idx];
      const days = Number(m.defaultDays) || 1;
      cursor = new Date(cursor.getTime() + days * 86400000);
      await VendorOpsMilestone.create({
        vendorId: project.vendorId,
        projectId: project._id,
        title: m.title,
        serviceCategoryCode: code,
        sequence: m.order || idx + 1,
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
    }
  }

  return project;
};

module.exports = { createOpsProjectFromOpportunity };
