/**
 * WBI Project OS — Core Project Controller
 * Handles project CRUD, dashboard data assembly, metrics, and module config.
 */

const ProjectOS = require('../../models/projectOS/ProjectOS');
const ProjectTemplate = require('../../models/projectOS/ProjectTemplate');
const ProjectMilestone = require('../../models/projectOS/ProjectMilestone');
const ProjectActivity = require('../../models/projectOS/ProjectActivity');
const MilestoneTemplate = require('../../models/projectOS/MilestoneTemplate');
const { resolveAllMetrics } = require('../../engines/metricResolver');
const { transitionProject, logActivity } = require('../../engines/workflowEngine');

// ─── GET all projects (role-filtered) ────────────────────────────────────────
exports.listProjects = async (req, res) => {
  try {
    const { status, category, page = 1, limit = 20, search } = req.query;
    const actorId = req.user?._id || req.user?.id;
    const role = (req.userRole || '').toLowerCase();

    const query = { isDeleted: false };

    // Role-based filtering
    if (role === 'vendor') query.vendorId = actorId;
    else if (role === 'b2b') { query.clientId = actorId; query.clientType = 'B2B'; }
    else if (role === 'engineer') {
      // Engineers see projects they have tasks in (handled via task lookup)
      const ProjectTask = require('../models/projectOS/ProjectTask');
      const taskProjects = await ProjectTask.distinct('project', { assignedTo: actorId, isDeleted: false });
      query._id = { $in: taskProjects };
    }

    if (status) query.status = status;
    if (category) query.category = category.toUpperCase();
    if (search) query.title = { $regex: search, $options: 'i' };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [projects, total] = await Promise.all([
      ProjectOS.find(query)
        .select('projectCode title category executionType status progress health slaStatus stats contractValue startDate expectedEndDate vendorName clientName createdAt')
        .sort({ lastActivityAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ProjectOS.countDocuments(query)
    ]);

    res.json({ success: true, data: projects, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET single project ───────────────────────────────────────────────────────
exports.getProject = async (req, res) => {
  try {
    const project = await ProjectOS.findById(req.params.id)
      .populate('projectTemplateId', 'name category executionType modules widgets status')
      .lean();

    if (!project || project.isDeleted) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    res.json({ success: true, data: project });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST create project ──────────────────────────────────────────────────────
exports.createProject = async (req, res) => {
  try {
    const { projectTemplateId, ...body } = req.body;

    // Load and validate template
    const template = await ProjectTemplate.findById(projectTemplateId).lean();
    if (!template) return res.status(404).json({ success: false, message: 'Project template not found' });
    if (template.status !== 'PUBLISHED') {
      return res.status(400).json({ success: false, message: 'Can only create projects from PUBLISHED templates' });
    }

    // Freeze a snapshot of the template at creation time
    const { _id, __v, createdAt, updatedAt, ...templateSnap } = template;

    const actorId = req.user?._id || req.user?.id;
    const actorRole = req.userRole || req.user?.role || 'admin';

    const project = await ProjectOS.create({
      ...body,
      projectTemplateId,
      templateVersion: template.version,
      templateSnapshot: templateSnap,
      category: template.category,
      subcategory: template.subcategory || body.subcategory,
      executionType: template.executionType,
      architectureVersion: 'PROJECT_OS',
      createdBy: actorId,
      createdByRole: actorRole,
      lastActivityAt: new Date()
    });

    // Auto-generate milestones from template if linked
    if (template.milestoneTemplateId) {
      const milestoneTemplate = await MilestoneTemplate.findById(template.milestoneTemplateId).lean();
      if (milestoneTemplate?.milestones?.length > 0) {
        const milestones = milestoneTemplate.milestones.map(m => ({
          project: project._id,
          title: m.title,
          description: m.description,
          order: m.order,
          slaDays: m.slaDays,
          requiresApproval: m.requiresApproval,
          requiresInvoice: m.requiresInvoice,
          invoicePercentage: m.invoicePercentage,
          color: m.color,
          status: 'NOT_STARTED'
        }));
        await ProjectMilestone.insertMany(milestones);

        // Update stats
        project.currentStage = milestoneTemplate.milestones[0]?.title;
        await project.save();
      }
    }

    await logActivity({
      project: project._id,
      eventType: 'PROJECT_CREATED',
      description: `Project "${project.title}" created using template "${template.name}"`,
      actor: { id: actorId, role: actorRole, name: req.user?.name || 'System' }
    });

    res.status(201).json({ success: true, message: 'Project created successfully', data: project });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── PATCH update project ─────────────────────────────────────────────────────
exports.updateProject = async (req, res) => {
  try {
    const project = await ProjectOS.findById(req.params.id);
    if (!project || project.isDeleted) return res.status(404).json({ success: false, message: 'Project not found' });

    // Protect immutable fields
    const { architectureVersion, projectCode, projectTemplateId, templateVersion, templateSnapshot, createdBy, ...updates } = req.body;

    Object.assign(project, updates);
    project.lastActivityAt = new Date();
    await project.save();

    res.json({ success: true, message: 'Project updated', data: project });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── POST transition project status ──────────────────────────────────────────
exports.transitionStatus = async (req, res) => {
  try {
    const actor = {
      id: req.user?._id || req.user?.id,
      role: req.userRole || req.user?.role,
      name: req.user?.name
    };
    const project = await transitionProject(req.params.id, req.body.toStatus, actor, { reason: req.body.reason });
    res.json({ success: true, message: `Project transitioned to ${req.body.toStatus}`, data: project });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── GET dashboard (full config + metrics) ────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const project = await ProjectOS.findById(req.params.id)
      .select('title projectCode category executionType status progress health slaStatus stats currentStage contractValue billingModel startDate expectedEndDate vendorName clientName templateSnapshot projectTemplateId templateVersion')
      .lean();

    if (!project || project.isDeleted) return res.status(404).json({ success: false, message: 'Project not found' });

    // Use snapshot if available, fallback to live template
    let templateConfig = project.templateSnapshot;
    if (!templateConfig) {
      templateConfig = await ProjectTemplate.findById(project.projectTemplateId)
        .select('modules widgets name executionType')
        .lean();
    }

    // Get enabled modules for sidebar
    const modules = (templateConfig?.modules || [])
      .filter(m => m.enabled)
      .sort((a, b) => a.order - b.order);

    // Resolve all widget metrics in parallel
    const widgets = templateConfig?.widgets || [];
    const metrics = await resolveAllMetrics(widgets, req.params.id);

    // Recent activity (last 10 events)
    const recentActivity = await ProjectActivity.find({ project: req.params.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('eventType description actorName actorRole createdAt')
      .lean();

    // Current milestones
    const milestones = await ProjectMilestone.find({ project: req.params.id, isDeleted: false })
      .sort({ order: 1 })
      .select('title order status plannedDate actualDate completionPercentage requiresApproval approvalStatus color')
      .lean();

    res.json({
      success: true,
      data: {
        project,
        modules,
        widgets: widgets.map(w => ({ ...w, resolvedMetric: metrics[w.metricKey] || null })),
        milestones,
        recentActivity
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET modules config (sidebar) ────────────────────────────────────────────
exports.getModules = async (req, res) => {
  try {
    const project = await ProjectOS.findById(req.params.id, 'templateSnapshot projectTemplateId').lean();
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    let modules = project.templateSnapshot?.modules;
    if (!modules) {
      const tmpl = await ProjectTemplate.findById(project.projectTemplateId, 'modules').lean();
      modules = tmpl?.modules || [];
    }

    const enabled = modules.filter(m => m.enabled).sort((a, b) => a.order - b.order);
    res.json({ success: true, data: enabled });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET metrics only (for widget refresh) ────────────────────────────────────
exports.getMetrics = async (req, res) => {
  try {
    const { keys } = req.query; // comma-separated metric keys
    const { APPROVED_METRIC_KEYS } = require('../../engines/metricResolver');

    const requestedKeys = keys ? keys.split(',') : APPROVED_METRIC_KEYS;
    const invalidKeys = requestedKeys.filter(k => !APPROVED_METRIC_KEYS.includes(k));
    if (invalidKeys.length > 0) {
      return res.status(400).json({ success: false, message: `Unknown metric keys: ${invalidKeys.join(', ')}` });
    }

    const widgets = requestedKeys.map(k => ({ metricKey: k }));
    const metrics = await resolveAllMetrics(widgets, req.params.id);
    res.json({ success: true, data: metrics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE project (soft) ────────────────────────────────────────────────────
exports.deleteProject = async (req, res) => {
  try {
    const project = await ProjectOS.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    if (['IN_PROGRESS', 'APPROVED', 'PLANNING'].includes(project.status)) {
      return res.status(400).json({ success: false, message: 'Cannot delete an active project. Cancel it first.' });
    }
    project.isDeleted = true;
    await project.save();
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
