const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { isAdmin, isAdminOrVendor } = require('../middleware/roleMiddleware');
const {
  canViewProject, canManageProject, canSubmitTask,
  canApproveTask, canViewFinance, canViewSite
} = require('../engines/projectGuards');
const multer = require('multer');

// ── Upload middleware (memory for Excel import) ────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Controllers ───────────────────────────────────────────────────────────────
const templateCtrl = require('../controllers/projectOS/projectTemplate.controller');
const projectCtrl = require('../controllers/projectOS/project.controller');
const siteCtrl = require('../controllers/projectOS/projectSite.controller');
const taskCtrl = require('../controllers/projectOS/projectTask.controller');

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE MANAGEMENT (Admin Only)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/registries', authenticate, templateCtrl.getRegistries);
router.get('/templates', authenticate, templateCtrl.listTemplates);
router.get('/templates/:id', authenticate, templateCtrl.getTemplate);

// Admin-only mutations
router.post('/admin/templates', authenticate, isAdmin, templateCtrl.createTemplate);
router.patch('/admin/templates/:id', authenticate, isAdmin, templateCtrl.updateTemplate);
router.post('/admin/templates/:id/validate', authenticate, isAdmin, templateCtrl.validateTemplate);
router.post('/admin/templates/:id/publish', authenticate, isAdmin, templateCtrl.publishTemplate);
router.post('/admin/templates/:id/clone', authenticate, isAdmin, templateCtrl.cloneTemplate);
router.post('/admin/templates/:id/deprecate', authenticate, isAdmin, templateCtrl.deprecateTemplate);

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/projects', authenticate, projectCtrl.listProjects);
router.post('/projects', authenticate, isAdminOrVendor, projectCtrl.createProject);

router.get('/projects/:id', authenticate, canViewProject, projectCtrl.getProject);
router.patch('/projects/:id', authenticate, canManageProject, projectCtrl.updateProject);
router.delete('/projects/:id', authenticate, isAdmin, projectCtrl.deleteProject);
router.post('/projects/:id/transition', authenticate, canManageProject, projectCtrl.transitionStatus);

// Dashboard & Config
router.get('/projects/:id/dashboard', authenticate, canViewProject, projectCtrl.getDashboard);
router.get('/projects/:id/modules', authenticate, canViewProject, projectCtrl.getModules);
router.get('/projects/:id/metrics', authenticate, canViewProject, projectCtrl.getMetrics);

// ═══════════════════════════════════════════════════════════════════════════════
// SITES
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/projects/:id/sites', authenticate, canViewProject, siteCtrl.listSites);
router.post('/projects/:id/sites', authenticate, canManageProject, siteCtrl.createSite);
router.get('/projects/:id/sites/import-template', authenticate, canManageProject, siteCtrl.getImportTemplate);
router.post('/projects/:id/sites/import', authenticate, canManageProject, upload.single('file'), siteCtrl.bulkImportSites);

router.get('/sites/:siteId', authenticate, canViewSite, siteCtrl.getSite);
router.patch('/sites/:siteId', authenticate, siteCtrl.updateSite);

// ═══════════════════════════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/projects/:id/tasks', authenticate, canViewProject, taskCtrl.listTasks);
router.post('/projects/:id/tasks', authenticate, canManageProject, taskCtrl.createTask);

router.get('/tasks/:taskId', authenticate, taskCtrl.getTask);
router.patch('/tasks/:taskId', authenticate, taskCtrl.updateTask);
router.post('/tasks/:taskId/assign', authenticate, canManageProject, taskCtrl.assignTask);
router.post('/tasks/:taskId/transition', authenticate, canSubmitTask, taskCtrl.transitionTask);
router.post('/tasks/:taskId/forms/:formId/submit', authenticate, taskCtrl.submitForm);

// ═══════════════════════════════════════════════════════════════════════════════
// MILESTONES
// ═══════════════════════════════════════════════════════════════════════════════
const milestoneCtrl = {
  list: async (req, res) => {
    try {
      const ProjectMilestone = require('../models/projectOS/ProjectMilestone');
      const data = await ProjectMilestone.find({ project: req.params.id, isDeleted: false }).sort({ order: 1 }).lean();
      res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  },
  create: async (req, res) => {
    try {
      const ProjectMilestone = require('../models/projectOS/ProjectMilestone');
      const m = await ProjectMilestone.create({ ...req.body, project: req.params.id });
      res.status(201).json({ success: true, data: m });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
  },
  update: async (req, res) => {
    try {
      const ProjectMilestone = require('../models/projectOS/ProjectMilestone');
      const m = await ProjectMilestone.findByIdAndUpdate(req.params.milestoneId, req.body, { new: true });
      res.json({ success: true, data: m });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
  }
};
router.get('/projects/:id/milestones', authenticate, canViewProject, milestoneCtrl.list);
router.post('/projects/:id/milestones', authenticate, canManageProject, milestoneCtrl.create);
router.patch('/milestones/:milestoneId', authenticate, milestoneCtrl.update);

// ═══════════════════════════════════════════════════════════════════════════════
// ISSUES
// ═══════════════════════════════════════════════════════════════════════════════
const issueCtrl = {
  list: async (req, res) => {
    try {
      const ProjectIssue = require('../models/projectOS/ProjectIssue');
      const { status, priority, page = 1, limit = 20 } = req.query;
      const query = { project: req.params.id, isDeleted: false };
      if (status) query.status = status;
      if (priority) query.priority = priority;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const [data, total] = await Promise.all([
        ProjectIssue.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        ProjectIssue.countDocuments(query)
      ]);
      res.json({ success: true, data, total });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  },
  create: async (req, res) => {
    try {
      const ProjectIssue = require('../models/projectOS/ProjectIssue');
      const { logActivity } = require('../engines/workflowEngine');
      const issue = await ProjectIssue.create({ ...req.body, project: req.params.id, raisedBy: req.user?._id, raisedByRole: req.userRole });
      const actor = { id: req.user?._id, role: req.userRole, name: req.user?.name };
      await logActivity({ project: req.params.id, issue: issue._id, eventType: 'ISSUE_RAISED', description: `Issue raised: "${issue.title}"`, actor });
      res.status(201).json({ success: true, data: issue });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
  },
  update: async (req, res) => {
    try {
      const ProjectIssue = require('../models/projectOS/ProjectIssue');
      const issue = await ProjectIssue.findByIdAndUpdate(req.params.issueId, req.body, { new: true });
      res.json({ success: true, data: issue });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
  }
};
router.get('/projects/:id/issues', authenticate, canViewProject, issueCtrl.list);
router.post('/projects/:id/issues', authenticate, issueCtrl.create);
router.patch('/issues/:issueId', authenticate, issueCtrl.update);

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY FEED
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/projects/:id/activity', authenticate, canViewProject, async (req, res) => {
  try {
    const ProjectActivity = require('../models/projectOS/ProjectActivity');
    const { page = 1, limit = 30, eventType } = req.query;
    const query = { project: req.params.id };
    if (eventType) query.eventType = eventType;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      ProjectActivity.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      ProjectActivity.countDocuments(query)
    ]);
    res.json({ success: true, data, total });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCE (basic — expandable)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/projects/:id/finance', authenticate, canViewProject, canViewFinance, async (req, res) => {
  try {
    const project = await require('../models/projectOS/ProjectOS').findById(req.params.id, 'contractValue billingModel stats currency').lean();
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    const ProjectMilestone = require('../models/projectOS/ProjectMilestone');
    const milestones = await ProjectMilestone.find({ project: req.params.id, requiresInvoice: true }).select('title invoicePercentage invoiceTriggered invoiceTriggeredAt status').lean();
    res.json({
      success: true,
      data: {
        contractValue: project.contractValue,
        currency: project.currency,
        billingModel: project.billingModel,
        invoicedAmount: project.stats?.invoicedAmount || 0,
        receivedAmount: project.stats?.receivedAmount || 0,
        outstandingAmount: (project.stats?.invoicedAmount || 0) - (project.stats?.receivedAmount || 0),
        milestonePayments: milestones
      }
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
