/**
 * WBI Project OS — Project RBAC Guards
 * 
 * Resource-level authorization middleware.
 * Prevents IDOR: even if you know the projectId, you can't access it without permission.
 * 
 * Usage in routes:
 *   router.get('/:id/dashboard', authenticate, canViewProject, getDashboard);
 */

const ProjectOS = require('../models/projectOS/ProjectOS');
const ProjectTask = require('../models/projectOS/ProjectTask');
const ProjectSite = require('../models/projectOS/ProjectSite');

// ─── Helper: extract actor from req ──────────────────────────────────────────
const getActor = (req) => ({
  id: req.user?.id || req.user?._id,
  role: (req.userRole || req.user?.role || '').toLowerCase()
});

// ─── Guard: Can view this project ────────────────────────────────────────────
const canViewProject = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    const { id: actorId, role } = getActor(req);

    if (role === 'admin') return next(); // admins see all

    const project = await ProjectOS.findById(projectId, 'vendorId clientId clientType').lean();
    if (!project || project.isDeleted) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const authorized =
      (role === 'vendor' && project.vendorId?.toString() === actorId) ||
      (role === 'b2b' && project.clientType === 'B2B' && project.clientId?.toString() === actorId) ||
      (role === 'user' && project.clientType === 'USER' && project.clientId?.toString() === actorId);

    // Engineers can view if they have an assigned task in this project
    if (role === 'engineer' && !authorized) {
      const hasTask = await ProjectTask.exists({ project: projectId, assignedTo: actorId, isDeleted: false });
      if (hasTask) return next();
    }

    if (!authorized) {
      return res.status(403).json({ success: false, message: 'Access denied to this project' });
    }
    next();
  } catch (err) {
    console.error('[canViewProject]', err.message);
    res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

// ─── Guard: Can manage this project (create tasks, update project, etc.) ──────
const canManageProject = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    const { id: actorId, role } = getActor(req);

    if (role === 'admin') return next();

    const project = await ProjectOS.findById(projectId, 'vendorId projectManagerId').lean();
    if (!project || project.isDeleted) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isVendorOwner = role === 'vendor' && project.vendorId?.toString() === actorId;
    const isProjectManager = project.projectManagerId?.toString() === actorId;

    if (!isVendorOwner && !isProjectManager) {
      return res.status(403).json({ success: false, message: 'Project management access denied' });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

// ─── Guard: Can submit task (only assigned engineer) ─────────────────────────
const canSubmitTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { id: actorId, role } = getActor(req);

    if (role === 'admin' || role === 'vendor') return next();

    const task = await ProjectTask.findById(taskId, 'assignedTo').lean();
    if (!task || task.isDeleted) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (task.assignedTo?.toString() !== actorId) {
      return res.status(403).json({ success: false, message: 'Only the assigned engineer can submit this task' });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

// ─── Guard: Can approve task ──────────────────────────────────────────────────
const canApproveTask = async (req, res, next) => {
  try {
    const { id: actorId, role } = getActor(req);
    if (['admin', 'vendor'].includes(role)) return next();
    return res.status(403).json({ success: false, message: 'Approval requires Vendor or Admin role' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

// ─── Guard: Can view finance ──────────────────────────────────────────────────
const canViewFinance = async (req, res, next) => {
  try {
    const { role } = getActor(req);
    if (['admin', 'vendor', 'b2b'].includes(role)) return next();
    return res.status(403).json({ success: false, message: 'Finance access denied' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

// ─── Guard: Can view site (engineer must be assigned to the site) ─────────────
const canViewSite = async (req, res, next) => {
  try {
    const { siteId } = req.params;
    const { id: actorId, role } = getActor(req);

    if (['admin', 'vendor', 'b2b'].includes(role)) return next();

    const site = await ProjectSite.findById(siteId, 'assignedTeam siteManagerId').lean();
    if (!site) return res.status(404).json({ success: false, message: 'Site not found' });

    const hasAccess =
      site.siteManagerId?.toString() === actorId ||
      site.assignedTeam?.some(id => id?.toString() === actorId);

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Site access denied' });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

module.exports = {
  canViewProject,
  canManageProject,
  canSubmitTask,
  canApproveTask,
  canViewFinance,
  canViewSite
};
