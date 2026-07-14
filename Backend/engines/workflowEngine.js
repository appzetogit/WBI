/**
 * WBI Project OS — Workflow Engine
 * 
 * Enforces state machine transitions for Project, Task, Site, and Issue entities.
 * The backend is the sole authority for state transitions — frontend is never trusted.
 * 
 * Usage:
 *   const { transitionTask } = require('./workflowEngine');
 *   await transitionTask(taskId, 'SUBMITTED', actor);
 */

const ProjectTask = require('../models/projectOS/ProjectTask');
const ProjectOS = require('../models/projectOS/ProjectOS');
const ProjectSite = require('../models/projectOS/ProjectSite');
const ProjectIssue = require('../models/projectOS/ProjectIssue');
const WorkflowTemplate = require('../models/projectOS/WorkflowTemplate');
const ProjectActivity = require('../models/projectOS/ProjectActivity');

// ─── Default hardcoded fallbacks (used if no WorkflowTemplate is configured) ──

const DEFAULT_TASK_TRANSITIONS = {
  'UNASSIGNED':          ['ASSIGNED', 'CANCELLED'],
  'ASSIGNED':            ['ACCEPTED', 'UNASSIGNED', 'CANCELLED'],
  'ACCEPTED':            ['TRAVELLING', 'BLOCKED', 'CANCELLED'],
  'TRAVELLING':          ['ARRIVED', 'BLOCKED'],
  'ARRIVED':             ['IN_PROGRESS', 'BLOCKED'],
  'IN_PROGRESS':         ['SUBMITTED', 'BLOCKED'],
  'BLOCKED':             ['IN_PROGRESS', 'CANCELLED'],
  'SUBMITTED':           ['QA_REVIEW', 'REWORK_REQUIRED'],
  'QA_REVIEW':           ['APPROVED', 'REWORK_REQUIRED'],
  'REWORK_REQUIRED':     ['IN_PROGRESS'],
  'APPROVED':            ['COMPLETED'],
  'COMPLETED':           [],
  'CANCELLED':           []
};

const DEFAULT_TASK_ROLE_RESTRICTIONS = {
  'ASSIGNED':        ['admin', 'vendor'],
  'ACCEPTED':        ['engineer'],
  'TRAVELLING':      ['engineer'],
  'ARRIVED':         ['engineer'],
  'IN_PROGRESS':     ['engineer'],
  'BLOCKED':         ['engineer', 'vendor', 'admin'],
  'SUBMITTED':       ['engineer'],
  'QA_REVIEW':       ['vendor', 'admin'],
  'APPROVED':        ['vendor', 'admin'],
  'REWORK_REQUIRED': ['vendor', 'admin'],
  'COMPLETED':       ['vendor', 'admin'],
  'CANCELLED':       ['vendor', 'admin']
};

// ─── Core Transition Function: Task ──────────────────────────────────────────

/**
 * Transition a ProjectTask to a new status
 * @param {string} taskId
 * @param {string} toStatus
 * @param {{ id: string, role: string, name: string }} actor
 * @param {{ reason?: string, arrivalGps?: object }} options
 */
async function transitionTask(taskId, toStatus, actor, options = {}) {
  const task = await ProjectTask.findById(taskId);
  if (!task || task.isDeleted) throw new Error('Task not found');

  const fromStatus = task.status;

  // ── 1. Check allowed transitions ──────────────────────────────────────────
  const allowed = DEFAULT_TASK_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new Error(`Transition "${fromStatus}" → "${toStatus}" is not permitted.`);
  }

  // ── 2. Check role authorization ────────────────────────────────────────────
  const allowedRoles = DEFAULT_TASK_ROLE_RESTRICTIONS[toStatus] || [];
  const actorRole = actor.role?.toLowerCase();
  if (allowedRoles.length > 0 && !allowedRoles.includes(actorRole)) {
    throw new Error(`Role "${actor.role}" is not authorized to perform this transition.`);
  }

  // ── 3. Check assignment guard: engineer must be assigned ──────────────────
  const engineerTransitions = ['ACCEPTED', 'TRAVELLING', 'ARRIVED', 'IN_PROGRESS', 'SUBMITTED'];
  if (engineerTransitions.includes(toStatus)) {
    if (task.assignedTo?.toString() !== actor.id?.toString()) {
      throw new Error('Only the assigned engineer can perform this action.');
    }
  }

  // ── 4. Apply status and side effects ──────────────────────────────────────
  task.status = toStatus;

  if (toStatus === 'IN_PROGRESS' && !task.actualStart) {
    task.actualStart = new Date();
  }
  if (toStatus === 'ARRIVED') {
    task.arrivalTime = new Date();
    if (options.arrivalGps) task.arrivalGps = options.arrivalGps;
  }
  if (toStatus === 'SUBMITTED') {
    task.submittedAt = new Date();
    task.approvalStatus = 'PENDING';
  }
  if (toStatus === 'COMPLETED') {
    task.completedAt = new Date();
    task.actualEnd = new Date();
    task.completionPercentage = 100;
  }
  if (toStatus === 'CANCELLED') {
    task.completedAt = new Date();
  }

  // ── 5. Append to status history ───────────────────────────────────────────
  task.statusHistory.push({
    status: toStatus,
    changedBy: actor.id,
    changedByRole: actor.role,
    reason: options.reason
  });

  await task.save();

  // ── 6. Log activity ───────────────────────────────────────────────────────
  await logActivity({
    project: task.project,
    task: task._id,
    site: task.site,
    eventType: `TASK_${toStatus.replace('_REQUIRED', '_REQUESTED')}`,
    description: `Task "${task.title}" transitioned from ${fromStatus} to ${toStatus}`,
    actor
  });

  return task;
}

// ─── Core Transition Function: Project ───────────────────────────────────────

const DEFAULT_PROJECT_TRANSITIONS = {
  'DRAFT':       ['PROPOSED', 'CANCELLED'],
  'PROPOSED':    ['APPROVED', 'CANCELLED'],
  'APPROVED':    ['PLANNING', 'CANCELLED'],
  'PLANNING':    ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  'IN_PROGRESS': ['ON_HOLD', 'AT_RISK', 'COMPLETED', 'CANCELLED'],
  'ON_HOLD':     ['IN_PROGRESS', 'CANCELLED'],
  'AT_RISK':     ['IN_PROGRESS', 'CANCELLED'],
  'COMPLETED':   ['CLOSED'],
  'CANCELLED':   [],
  'CLOSED':      []
};

async function transitionProject(projectId, toStatus, actor, options = {}) {
  const project = await ProjectOS.findById(projectId);
  if (!project || project.isDeleted) throw new Error('Project not found');

  const fromStatus = project.status;
  const allowed = DEFAULT_PROJECT_TRANSITIONS[fromStatus] || [];

  if (!allowed.includes(toStatus)) {
    throw new Error(`Project transition "${fromStatus}" → "${toStatus}" is not permitted.`);
  }

  // Only admin or vendor can change project status
  if (!['admin', 'vendor', 'b2b'].includes(actor.role?.toLowerCase())) {
    throw new Error('Unauthorized to change project status.');
  }

  project.status = toStatus;
  if (toStatus === 'IN_PROGRESS' && !project.actualStartDate) {
    project.startDate = project.startDate || new Date();
  }
  if (['COMPLETED', 'CLOSED', 'CANCELLED'].includes(toStatus)) {
    project.actualEndDate = new Date();
  }

  project.statusHistory = project.statusHistory || [];
  project.statusHistory.push({
    status: toStatus,
    changedBy: actor.id,
    changedByRole: actor.role,
    reason: options.reason,
    changedAt: new Date()
  });

  project.lastActivityAt = new Date();
  await project.save();

  await logActivity({
    project: project._id,
    eventType: 'PROJECT_STATUS_CHANGED',
    description: `Project status changed from ${fromStatus} to ${toStatus}`,
    actor,
    metadata: { fromStatus, toStatus, reason: options.reason }
  });

  return project;
}

// ─── Shared Activity Logger ───────────────────────────────────────────────────

async function logActivity({ project, task, site, milestone, issue, eventType, description, actor, metadata }) {
  try {
    await ProjectActivity.create({
      project,
      task,
      site,
      milestone,
      issue,
      eventType,
      description,
      actorId: actor.id,
      actorRole: actor.role,
      actorName: actor.name,
      metadata
    });
  } catch (err) {
    // Activity logging must never fail silently but must not break the main operation
    console.error('[WorkflowEngine] Activity log failed:', err.message);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  transitionTask,
  transitionProject,
  logActivity,
  DEFAULT_TASK_TRANSITIONS,
  DEFAULT_PROJECT_TRANSITIONS
};
