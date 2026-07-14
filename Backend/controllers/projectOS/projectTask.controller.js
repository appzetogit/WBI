/**
 * WBI Project OS — Task Controller
 * Full task lifecycle: create, assign, transition, form submit, evidence upload.
 */

const ProjectTask = require('../../models/projectOS/ProjectTask');
const ProjectOS = require('../../models/projectOS/ProjectOS');
const ProjectSite = require('../../models/projectOS/ProjectSite');
const ProjectFormSubmission = require('../../models/projectOS/ProjectFormSubmission');
const FormTemplate = require('../../models/projectOS/FormTemplate');
const { transitionTask, logActivity } = require('../../engines/workflowEngine');
const { validateFormSubmission } = require('../../engines/formValidator');

// ─── GET all tasks for a project ─────────────────────────────────────────────
exports.listTasks = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { status, priority, siteId, milestoneId, assignedTo, page = 1, limit = 50 } = req.query;

    const query = { project: projectId, isDeleted: false };
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (siteId) query.site = siteId;
    if (milestoneId) query.milestone = milestoneId;
    if (assignedTo) query.assignedTo = assignedTo;

    // Engineers only see their own tasks
    const role = (req.userRole || '').toLowerCase();
    const actorId = req.user?._id || req.user?.id;
    if (role === 'engineer') query.assignedTo = actorId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [tasks, total] = await Promise.all([
      ProjectTask.find(query)
        .populate('assignedTo', 'name phone profilePhoto')
        .populate('site', 'name siteCode hierarchy.state hierarchy.city')
        .populate('milestone', 'title order')
        .select('-statusHistory -evidence -checklist') // exclude heavy fields from list
        .sort({ priority: -1, plannedStart: 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ProjectTask.countDocuments(query)
    ]);

    res.json({ success: true, data: tasks, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET single task (full detail) ───────────────────────────────────────────
exports.getTask = async (req, res) => {
  try {
    const task = await ProjectTask.findById(req.params.taskId)
      .populate('assignedTo', 'name phone email profilePhoto')
      .populate('site', 'name siteCode address gps hierarchy')
      .populate('milestone', 'title order')
      .populate('formTemplateId')
      .lean();

    if (!task || task.isDeleted) return res.status(404).json({ success: false, message: 'Task not found' });

    // Get previous form submissions for this task
    const formSubmissions = await ProjectFormSubmission.find({ task: task._id })
      .sort({ submittedAt: -1 })
      .select('submissionVersion submittedBy submitterName submittedAt validationStatus approvalStatus')
      .lean();

    res.json({ success: true, data: { ...task, formSubmissions } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST create task ─────────────────────────────────────────────────────────
exports.createTask = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const task = await ProjectTask.create({ ...req.body, project: projectId, status: 'UNASSIGNED' });

    await ProjectOS.findByIdAndUpdate(projectId, {
      $inc: { 'stats.openTasks': 1, 'stats.totalTasks': 1 },
      lastActivityAt: new Date()
    });

    const actor = { id: req.user?._id, role: req.userRole, name: req.user?.name };
    await logActivity({ project: projectId, task: task._id, eventType: 'TASK_CREATED', description: `Task "${task.title}" created`, actor });

    res.status(201).json({ success: true, message: 'Task created', data: task });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── PATCH update task ────────────────────────────────────────────────────────
exports.updateTask = async (req, res) => {
  try {
    const task = await ProjectTask.findById(req.params.taskId);
    if (!task || task.isDeleted) return res.status(404).json({ success: false, message: 'Task not found' });

    // Protect status — use transition endpoint instead
    const { status, statusHistory, ...updates } = req.body;
    Object.assign(task, updates);
    await task.save();

    res.json({ success: true, message: 'Task updated', data: task });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── POST assign task to engineer ─────────────────────────────────────────────
exports.assignTask = async (req, res) => {
  try {
    const task = await ProjectTask.findById(req.params.taskId);
    if (!task || task.isDeleted) return res.status(404).json({ success: false, message: 'Task not found' });

    const { engineerId, plannedStart, plannedEnd } = req.body;
    if (!engineerId) return res.status(400).json({ success: false, message: 'engineerId is required' });

    task.assignedTo = engineerId;
    task.assignedBy = req.user?._id;
    task.assignedAt = new Date();
    if (plannedStart) task.plannedStart = plannedStart;
    if (plannedEnd) task.plannedEnd = plannedEnd;

    const actor = { id: req.user?._id, role: req.userRole, name: req.user?.name };
    // Use workflow engine to properly transition to ASSIGNED
    await transitionTask(task._id.toString(), 'ASSIGNED', actor);

    res.json({ success: true, message: 'Task assigned', data: task });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── POST transition task status ──────────────────────────────────────────────
exports.transitionTask = async (req, res) => {
  try {
    const actor = {
      id: req.user?._id?.toString() || req.user?.id,
      role: req.userRole || req.user?.role,
      name: req.user?.name
    };
    const task = await transitionTask(req.params.taskId, req.body.toStatus, actor, {
      reason: req.body.reason,
      arrivalGps: req.body.arrivalGps
    });

    // Update project open task stats
    if (['COMPLETED', 'CANCELLED', 'APPROVED'].includes(req.body.toStatus)) {
      await ProjectOS.findByIdAndUpdate(task.project, {
        $inc: { 'stats.openTasks': -1 },
        lastActivityAt: new Date()
      });
      // Update site task summary
      if (task.site) {
        await _recalcSiteTaskSummary(task.site);
      }
    }

    res.json({ success: true, message: `Task transitioned to ${req.body.toStatus}`, data: task });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── POST submit form for a task ──────────────────────────────────────────────
exports.submitForm = async (req, res) => {
  try {
    const { taskId, formId: formTemplateId } = req.params;

    const task = await ProjectTask.findById(taskId);
    if (!task || task.isDeleted) return res.status(404).json({ success: false, message: 'Task not found' });

    const formTemplate = await FormTemplate.findById(formTemplateId).lean();
    if (!formTemplate || formTemplate.status !== 'PUBLISHED') {
      return res.status(404).json({ success: false, message: 'Form template not found or not published' });
    }

    const actorRole = (req.userRole || req.user?.role || '').toLowerCase();
    const { values = {}, attachmentFieldIds = [] } = req.body;

    // ── Server-side form validation ───────────────────────────────────────────
    const validation = await validateFormSubmission(formTemplateId, values, attachmentFieldIds, actorRole);

    // Get existing submissions count for versioning
    const existingCount = await ProjectFormSubmission.countDocuments({ task: taskId, formTemplateId });

    const submission = await ProjectFormSubmission.create({
      project: task.project,
      site: task.site,
      task: taskId,
      milestone: task.milestone,
      formTemplateId,
      formVersion: formTemplate.version,
      submissionVersion: existingCount + 1,
      submittedBy: req.user?._id,
      submitterRole: actorRole,
      submitterName: req.user?.name,
      values,
      attachments: req.uploadedFiles || [], // from uploadMiddleware
      validationStatus: validation.valid ? 'VALID' : 'INVALID',
      validationErrors: validation.errors,
      approvalStatus: formTemplate.requiresApproval ? 'PENDING' : 'NOT_REQUIRED',
      submittedAt: new Date()
    });

    if (!validation.valid) {
      return res.status(422).json({ success: false, message: 'Form validation failed', errors: validation.errors, submissionId: submission._id });
    }

    const actor = { id: req.user?._id, role: actorRole, name: req.user?.name };
    await logActivity({ project: task.project, task: taskId, eventType: 'FORM_SUBMITTED', description: `Form "${formTemplate.name}" submitted`, actor });

    res.status(201).json({ success: true, message: 'Form submitted successfully', data: submission });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Internal helpers ─────────────────────────────────────────────────────────
async function _recalcSiteTaskSummary(siteId) {
  const [total, completed, overdue, blocked] = await Promise.all([
    ProjectTask.countDocuments({ site: siteId, isDeleted: false }),
    ProjectTask.countDocuments({ site: siteId, status: 'COMPLETED', isDeleted: false }),
    ProjectTask.countDocuments({ site: siteId, slaBreached: true, status: { $nin: ['COMPLETED', 'CANCELLED'] }, isDeleted: false }),
    ProjectTask.countDocuments({ site: siteId, status: 'BLOCKED', isDeleted: false })
  ]);
  await ProjectSite.findByIdAndUpdate(siteId, { taskSummary: { total, completed, overdue, blocked } });
}
