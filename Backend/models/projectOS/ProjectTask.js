const mongoose = require('mongoose');

const TASK_STATUSES = [
  'UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'TRAVELLING', 'ARRIVED',
  'IN_PROGRESS', 'BLOCKED', 'SUBMITTED', 'QA_REVIEW', 'REWORK_REQUIRED',
  'APPROVED', 'COMPLETED', 'CANCELLED'
];

const checklistItemSchema = new mongoose.Schema({
  item: { type: String, required: true },
  done: { type: Boolean, default: false },
  doneBy: { type: mongoose.Schema.Types.ObjectId },
  doneAt: Date
}, { _id: false });

const evidenceSchema = new mongoose.Schema({
  type: { type: String, enum: ['BEFORE', 'AFTER', 'PROGRESS', 'ISSUE'] },
  url: String,
  publicId: String,
  fileType: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId },
  uploadedAt: { type: Date, default: Date.now },
  caption: String
}, { _id: true });

const statusHistorySchema = new mongoose.Schema({
  status: String,
  changedBy: { type: mongoose.Schema.Types.ObjectId },
  changedByRole: String,
  reason: String,
  changedAt: { type: Date, default: Date.now }
}, { _id: false });

const projectTaskSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectOS', required: true, index: true },
  milestone: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectMilestone' }, // optional
  site: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectSite' }, // optional

  // Task details
  title: { type: String, required: true },
  description: String,
  taskCode: { type: String, unique: true },

  // Form & checklist
  formTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'FormTemplate' },
  checklist: [checklistItemSchema],

  // Assignment
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer', index: true },
  assignedTeam: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Engineer' }],
  assignedBy: { type: mongoose.Schema.Types.ObjectId },
  assignedAt: Date,

  // Priority & Status
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM', index: true },
  status: { type: String, enum: TASK_STATUSES, default: 'UNASSIGNED', index: true },
  statusHistory: [statusHistorySchema],

  // Schedule
  plannedStart: Date,
  plannedEnd: Date,
  actualStart: Date,
  actualEnd: Date,
  estimatedHours: Number,
  actualHours: Number,

  // Dependencies (task must not start until these are COMPLETED)
  dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTask' }],

  // Required tools/equipment
  requiredTools: [String],

  // Evidence requirements
  evidenceRequired: { type: Boolean, default: false },
  evidenceBefore: { type: Boolean, default: false },
  evidenceAfter: { type: Boolean, default: true },
  evidence: [evidenceSchema],

  // Compliance
  otpRequired: { type: Boolean, default: false },
  otpVerified: { type: Boolean, default: false },
  customerSignatureRequired: { type: Boolean, default: false },
  customerSignatureUrl: String,

  // SLA
  slaDeadline: Date,
  slaBreached: { type: Boolean, default: false },
  slaStatus: { type: String, enum: ['ON_TRACK', 'AT_RISK', 'BREACHED'], default: 'ON_TRACK' },

  // Approval
  approvalStatus: { type: String, enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'REWORK'], default: 'NOT_REQUIRED' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId },
  approvedAt: Date,
  rejectionReason: String,

  // Completion
  completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
  completionNote: String,
  submittedAt: Date,
  completedAt: Date,

  // Engineer location on arrival (for audit)
  arrivalGps: { lat: Number, lng: Number },
  arrivalTime: Date,

  // Internal flags
  isDeleted: { type: Boolean, default: false },
  tags: [String]

}, { timestamps: true });

// ─── Indexes ──────────────────────────────────────────────────────────────────
projectTaskSchema.index({ project: 1, status: 1 });
projectTaskSchema.index({ project: 1, site: 1 });
projectTaskSchema.index({ assignedTo: 1, status: 1 });
projectTaskSchema.index({ slaDeadline: 1, slaBreached: 1 });

// ─── Auto-generate task code ──────────────────────────────────────────────────
projectTaskSchema.pre('validate', function (next) {
  if (!this.taskCode) {
    const random = Math.floor(10000 + Math.random() * 90000);
    this.taskCode = `TSK-${random}`;
  }
  next();
});

projectTaskSchema.statics.TASK_STATUSES = TASK_STATUSES;

module.exports = mongoose.model('ProjectTask', projectTaskSchema);
