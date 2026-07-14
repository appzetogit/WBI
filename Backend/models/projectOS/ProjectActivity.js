const mongoose = require('mongoose');

// Full list of approved notification/audit events
const ACTIVITY_EVENTS = [
  // Project lifecycle
  'PROJECT_CREATED', 'PROJECT_APPROVED', 'PROJECT_STATUS_CHANGED',
  'PROJECT_STAGE_CHANGED', 'PROJECT_COMPLETED', 'PROJECT_CANCELLED',
  // Site lifecycle
  'SITE_CREATED', 'SITE_ASSIGNED', 'SITE_STATUS_CHANGED', 'SITE_COMPLETED',
  'SITE_BULK_IMPORTED',
  // Task lifecycle
  'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_ACCEPTED', 'TASK_STARTED',
  'TASK_BLOCKED', 'TASK_SUBMITTED', 'TASK_APPROVED', 'TASK_REJECTED',
  'TASK_REWORK_REQUESTED', 'TASK_COMPLETED', 'TASK_CANCELLED',
  // Engineer movement
  'ENGINEER_ARRIVED', 'ENGINEER_LOCATION_UPDATED',
  // Form
  'FORM_SUBMITTED', 'FORM_APPROVED', 'FORM_REJECTED',
  // Milestone
  'MILESTONE_STARTED', 'MILESTONE_COMPLETED', 'MILESTONE_BLOCKED',
  'MILESTONE_APPROVED', 'MILESTONE_INVOICE_TRIGGERED',
  // Issue
  'ISSUE_RAISED', 'ISSUE_ASSIGNED', 'ISSUE_RESOLVED', 'ISSUE_ESCALATED',
  'ISSUE_CLOSED',
  // Finance
  'INVOICE_CREATED', 'INVOICE_SENT', 'INVOICE_APPROVED', 'PAYMENT_RECEIVED',
  'VENDOR_WALLET_CREDITED',
  // Document
  'DOCUMENT_UPLOADED', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED',
  // Approval
  'APPROVAL_PENDING', 'APPROVAL_GRANTED', 'APPROVAL_REJECTED',
  // SLA
  'SLA_WARNING', 'SLA_BREACHED', 'SLA_ESCALATED',
  // Template
  'TEMPLATE_PUBLISHED', 'TEMPLATE_DEPRECATED'
];

const projectActivitySchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectOS', required: true, index: true },
  site: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectSite' },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTask' },
  milestone: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectMilestone' },
  issue: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectIssue' },

  eventType: { type: String, enum: ACTIVITY_EVENTS, required: true, index: true },
  description: { type: String, required: true }, // human-readable

  // Actor
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  actorRole: { type: String, required: true },
  actorName: String,

  // Optional structured metadata
  metadata: { type: mongoose.Schema.Types.Mixed },

  // For audit immutability — activities should not be deleted
  createdAt: { type: Date, default: Date.now, immutable: true }
}, { timestamps: false });

projectActivitySchema.index({ project: 1, createdAt: -1 });
projectActivitySchema.index({ task: 1, createdAt: -1 });

module.exports = mongoose.model('ProjectActivity', projectActivitySchema);
