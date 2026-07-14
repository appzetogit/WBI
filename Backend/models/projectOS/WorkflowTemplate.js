const mongoose = require('mongoose');

const ENTITY_TYPES = ['PROJECT', 'TASK', 'MILESTONE', 'APPROVAL', 'ISSUE', 'SITE'];

// Task status enum (full lifecycle)
const TASK_STATUSES = [
  'UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'TRAVELLING', 'ARRIVED',
  'IN_PROGRESS', 'BLOCKED', 'SUBMITTED', 'QA_REVIEW', 'REWORK_REQUIRED',
  'APPROVED', 'COMPLETED', 'CANCELLED'
];

const PROJECT_STATUSES = [
  'DRAFT', 'PROPOSED', 'APPROVED', 'PLANNING', 'IN_PROGRESS',
  'ON_HOLD', 'AT_RISK', 'COMPLETED', 'CANCELLED', 'CLOSED'
];

const transitionSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  allowedRoles: [String], // e.g. ['engineer', 'vendor', 'admin']
  requiredConditions: [String], // e.g. ['HAS_EVIDENCE', 'FORM_SUBMITTED']
  requiresFormSubmission: { type: Boolean, default: false },
  formTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'FormTemplate' },
  requiresOTP: { type: Boolean, default: false },
  requiresCustomerSignature: { type: Boolean, default: false },
  notificationEvent: String, // e.g. 'TASK_SUBMITTED'
  auditAction: String, // e.g. 'task.submitted'
  canRollback: { type: Boolean, default: false } // can this transition be reversed?
}, { _id: false });

const workflowTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  entityType: { type: String, enum: ENTITY_TYPES, required: true },
  projectTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTemplate', index: true },

  states: {
    type: [String],
    required: true,
    validate: {
      validator: (arr) => arr.length >= 2,
      message: 'Workflow must define at least 2 states'
    }
  },
  initialState: { type: String, required: true },
  terminalStates: [String], // e.g. ['COMPLETED', 'CANCELLED']

  transitions: [transitionSchema],

  version: { type: Number, default: 1 },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'DEPRECATED'], default: 'DRAFT' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

workflowTemplateSchema.statics.TASK_STATUSES = TASK_STATUSES;
workflowTemplateSchema.statics.PROJECT_STATUSES = PROJECT_STATUSES;

module.exports = mongoose.model('WorkflowTemplate', workflowTemplateSchema);
