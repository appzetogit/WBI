const mongoose = require('mongoose');

const ISSUE_TYPES = [
  'SITE_UNAVAILABLE', 'CUSTOMER_UNAVAILABLE', 'MATERIAL_MISSING',
  'TECHNICAL_FAILURE', 'ACCESS_DENIED', 'ENGINEER_NO_SHOW', 'DAMAGE',
  'SAFETY_INCIDENT', 'SCOPE_CHANGE', 'APPROVAL_DELAY', 'OTHER'
];

const projectIssueSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectOS', required: true, index: true },
  site: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectSite' },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTask' },
  milestone: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectMilestone' },

  issueCode: { type: String, unique: true },
  issueType: { type: String, enum: ISSUE_TYPES, required: true },
  title: { type: String, required: true },
  description: String,

  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM', index: true },
  status: {
    type: String,
    enum: ['RAISED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'],
    default: 'RAISED',
    index: true
  },

  raisedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  raisedByRole: String,
  raisedAt: { type: Date, default: Date.now },

  assignedTo: { type: mongoose.Schema.Types.ObjectId },
  assignedToRole: String,
  assignedAt: Date,

  evidence: [{ url: String, publicId: String, uploadedAt: Date }],
  comments: [{
    text: String,
    by: { type: mongoose.Schema.Types.ObjectId },
    byRole: String,
    byName: String,
    at: { type: Date, default: Date.now }
  }],

  // SLA tracking
  slaDeadline: Date,
  slaStatus: { type: String, enum: ['ON_TRACK', 'AT_RISK', 'BREACHED'], default: 'ON_TRACK' },
  escalationLevel: { type: Number, default: 0 },

  // Resolution
  resolvedBy: { type: mongoose.Schema.Types.ObjectId },
  resolvedAt: Date,
  resolutionDetails: String,

  verifiedBy: { type: mongoose.Schema.Types.ObjectId },
  verifiedAt: Date,

  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

projectIssueSchema.index({ project: 1, status: 1 });
projectIssueSchema.index({ project: 1, priority: 1 });
projectIssueSchema.index({ slaDeadline: 1, slaStatus: 1 });

// Auto-generate issue code
projectIssueSchema.pre('validate', function (next) {
  if (!this.issueCode) {
    const random = Math.floor(10000 + Math.random() * 90000);
    this.issueCode = `ISS-${random}`;
  }
  next();
});

module.exports = mongoose.model('ProjectIssue', projectIssueSchema);
