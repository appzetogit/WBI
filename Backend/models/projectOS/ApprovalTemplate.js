const mongoose = require('mongoose');

const APPROVER_TYPES = [
  'ENGINEER', 'SUPERVISOR', 'VENDOR_QA', 'CLIENT_SITE_MANAGER',
  'B2B_PROJECT_MANAGER', 'WBI_ADMIN'
];

const approvalLevelSchema = new mongoose.Schema({
  order: { type: Number, required: true },
  label: { type: String, required: true }, // e.g. "Vendor QA Sign-off"
  approverType: { type: String, enum: APPROVER_TYPES, required: true },
  mode: { type: String, enum: ['SEQUENTIAL', 'PARALLEL'], default: 'SEQUENTIAL' },
  onRejection: { type: String, enum: ['REWORK', 'CANCEL', 'ESCALATE'], default: 'REWORK' },
  onRework: { type: String, enum: ['RESTART_LEVEL', 'RESTART_ALL'], default: 'RESTART_LEVEL' },
  timeoutHours: { type: Number, default: 48 },
  escalateToType: { type: String, enum: APPROVER_TYPES },
  requiresEvidence: { type: Boolean, default: false },
  requiresComment: { type: Boolean, default: false }
}, { _id: false });

const approvalTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  projectTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTemplate', index: true },

  appliesTo: {
    type: String,
    enum: ['TASK', 'MILESTONE', 'SITE', 'INVOICE', 'DOCUMENT', 'ISSUE'],
    required: true
  },

  levels: {
    type: [approvalLevelSchema],
    validate: {
      validator: (arr) => arr.length > 0,
      message: 'At least one approval level must be defined'
    }
  },

  version: { type: Number, default: 1 },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'DEPRECATED'], default: 'DRAFT' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('ApprovalTemplate', approvalTemplateSchema);
