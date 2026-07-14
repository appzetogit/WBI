/**
 * WBI Project OS — Metric Resolver Engine
 * 
 * All dashboard KPI widgets reference a metricKey from this approved registry.
 * Admin CANNOT define raw DB queries. Only registered metric keys are valid.
 * 
 * Each resolver receives (projectId, options) and returns a scalar or object.
 */

const ProjectOS = require('../models/projectOS/ProjectOS');
const ProjectSite = require('../models/projectOS/ProjectSite');
const ProjectTask = require('../models/projectOS/ProjectTask');
const ProjectMilestone = require('../models/projectOS/ProjectMilestone');
const ProjectIssue = require('../models/projectOS/ProjectIssue');

// ─── Registry ─────────────────────────────────────────────────────────────────

const METRIC_RESOLVERS = {

  PROJECT_PROGRESS: async (projectId) => {
    const p = await ProjectOS.findById(projectId, 'progress stats').lean();
    return { value: p?.progress || 0, unit: '%' };
  },

  TOTAL_SITES: async (projectId) => {
    const count = await ProjectSite.countDocuments({ project: projectId, isDeleted: false });
    return { value: count };
  },

  COMPLETED_SITES: async (projectId) => {
    const count = await ProjectSite.countDocuments({ project: projectId, status: 'COMPLETED', isDeleted: false });
    return { value: count };
  },

  PENDING_SITES: async (projectId) => {
    const count = await ProjectSite.countDocuments({
      project: projectId,
      status: { $in: ['PENDING', 'ASSIGNED'] },
      isDeleted: false
    });
    return { value: count };
  },

  IN_PROGRESS_SITES: async (projectId) => {
    const count = await ProjectSite.countDocuments({ project: projectId, status: 'IN_PROGRESS', isDeleted: false });
    return { value: count };
  },

  OVERDUE_TASKS: async (projectId) => {
    const count = await ProjectTask.countDocuments({
      project: projectId,
      slaDeadline: { $lt: new Date() },
      status: { $nin: ['COMPLETED', 'CANCELLED', 'APPROVED'] },
      isDeleted: false
    });
    return { value: count };
  },

  OPEN_TASKS: async (projectId) => {
    const count = await ProjectTask.countDocuments({
      project: projectId,
      status: { $nin: ['COMPLETED', 'CANCELLED', 'APPROVED'] },
      isDeleted: false
    });
    return { value: count };
  },

  OPEN_ISSUES: async (projectId) => {
    const count = await ProjectIssue.countDocuments({
      project: projectId,
      status: { $nin: ['RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'] },
      isDeleted: false
    });
    return { value: count };
  },

  ENGINEERS_ACTIVE: async (projectId) => {
    const result = await ProjectTask.distinct('assignedTo', {
      project: projectId,
      status: { $in: ['TRAVELLING', 'ARRIVED', 'IN_PROGRESS'] }
    });
    return { value: result.length };
  },

  MILESTONES_DUE: async (projectId) => {
    const count = await ProjectMilestone.countDocuments({
      project: projectId,
      plannedDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // within 7 days
      status: { $nin: ['COMPLETED', 'CANCELLED'] },
      isDeleted: false
    });
    return { value: count };
  },

  PENDING_APPROVALS: async (projectId) => {
    const taskApprovals = await ProjectTask.countDocuments({
      project: projectId,
      approvalStatus: 'PENDING',
      isDeleted: false
    });
    return { value: taskApprovals };
  },

  PROJECT_VALUE: async (projectId) => {
    const p = await ProjectOS.findById(projectId, 'contractValue currency').lean();
    return { value: p?.contractValue || 0, currency: p?.currency || 'INR' };
  },

  INVOICED_AMOUNT: async (projectId) => {
    const p = await ProjectOS.findById(projectId, 'stats').lean();
    return { value: p?.stats?.invoicedAmount || 0, currency: 'INR' };
  },

  RECEIVED_AMOUNT: async (projectId) => {
    const p = await ProjectOS.findById(projectId, 'stats').lean();
    return { value: p?.stats?.receivedAmount || 0, currency: 'INR' };
  },

  OUTSTANDING_AMOUNT: async (projectId) => {
    const p = await ProjectOS.findById(projectId, 'stats').lean();
    return {
      value: (p?.stats?.invoicedAmount || 0) - (p?.stats?.receivedAmount || 0),
      currency: 'INR'
    };
  },

  SLA_COMPLIANCE: async (projectId) => {
    const [total, breached] = await Promise.all([
      ProjectTask.countDocuments({ project: projectId, isDeleted: false }),
      ProjectTask.countDocuments({ project: projectId, slaBreached: true, isDeleted: false })
    ]);
    const compliance = total > 0 ? Math.round(((total - breached) / total) * 100) : 100;
    return { value: compliance, unit: '%' };
  }
};

// ─── Resolver Function ────────────────────────────────────────────────────────

/**
 * Resolve a single metric for a project
 * @param {string} metricKey - must be a key in METRIC_RESOLVERS
 * @param {string} projectId
 * @returns {Promise<{ value: any, unit?: string, currency?: string }>}
 */
async function resolveMetric(metricKey, projectId) {
  const resolver = METRIC_RESOLVERS[metricKey];
  if (!resolver) {
    throw new Error(`Unknown metric key: "${metricKey}". Use only approved metric keys.`);
  }
  return resolver(projectId);
}

/**
 * Resolve all metrics for a widget list
 * @param {Array<{ metricKey: string }>} widgets
 * @param {string} projectId
 * @returns {Promise<Object>} map of metricKey -> resolved value
 */
async function resolveAllMetrics(widgets, projectId) {
  const uniqueKeys = [...new Set(widgets.filter(w => w.metricKey).map(w => w.metricKey))];
  const results = await Promise.allSettled(uniqueKeys.map(key => resolveMetric(key, projectId)));

  const resolved = {};
  uniqueKeys.forEach((key, i) => {
    if (results[i].status === 'fulfilled') {
      resolved[key] = results[i].value;
    } else {
      resolved[key] = { value: null, error: results[i].reason?.message };
    }
  });
  return resolved;
}

module.exports = {
  resolveMetric,
  resolveAllMetrics,
  APPROVED_METRIC_KEYS: Object.keys(METRIC_RESOLVERS)
};
