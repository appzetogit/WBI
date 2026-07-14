const mongoose = require('mongoose');

const projectSiteSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectOS', required: true, index: true },

  // Site identification
  siteCode: { type: String, index: true }, // auto-generated
  externalSiteCode: String, // client's own site ID
  name: { type: String, required: true },
  description: String,

  // Hierarchy
  hierarchy: {
    region: String,
    state: { type: String, index: true },
    city: { type: String, index: true },
    district: String,
    pincode: String
  },

  // Address
  address: {
    line1: String,
    line2: String,
    landmark: String
  },

  // GPS
  gps: {
    lat: { type: Number },
    lng: { type: Number }
  },

  // Contact
  siteContact: {
    name: String,
    phone: String,
    email: String,
    designation: String
  },

  // Schedule
  schedule: {
    plannedStart: Date,
    plannedEnd: Date,
    actualStart: Date,
    actualEnd: Date
  },

  // Assignment
  assignedTeam: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Engineer' }],
  siteManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer' },

  // Status lifecycle
  status: {
    type: String,
    enum: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  progress: { type: Number, default: 0, min: 0, max: 100 },

  // Material tracking
  material: {
    requested: { type: Boolean, default: false },
    requestedAt: Date,
    approved: { type: Boolean, default: false },
    issued: { type: Boolean, default: false },
    issuedAt: Date,
    received: { type: Boolean, default: false },
    receivedAt: Date
  },

  // Summary counters (updated via background job)
  taskSummary: {
    total: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    overdue: { type: Number, default: 0 },
    blocked: { type: Number, default: 0 }
  },

  // Evidence & approval
  evidenceStatus: { type: String, enum: ['NOT_STARTED', 'PARTIAL', 'COMPLETE'], default: 'NOT_STARTED' },
  approvalStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId },
  approvedAt: Date,
  rejectionReason: String,

  // SLA tracking
  slaStatus: { type: String, enum: ['ON_TRACK', 'AT_RISK', 'BREACHED'], default: 'ON_TRACK' },
  slaDeadline: Date,

  // Issues
  issueCount: { type: Number, default: 0 },
  openIssueCount: { type: Number, default: 0 },

  // Photos
  sitePhotos: [{ url: String, uploadedBy: mongoose.Schema.Types.ObjectId, uploadedAt: Date }],

  // Notes
  notes: String,
  isDeleted: { type: Boolean, default: false }

}, { timestamps: true });

// ─── Indexes ──────────────────────────────────────────────────────────────────
projectSiteSchema.index({ project: 1, status: 1 });
projectSiteSchema.index({ project: 1, 'hierarchy.state': 1, 'hierarchy.city': 1 });
projectSiteSchema.index({ project: 1, assignedTeam: 1 });

// ─── Auto-generate site code ──────────────────────────────────────────────────
projectSiteSchema.pre('validate', async function (next) {
  if (!this.siteCode) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const cityPrefix = (this.hierarchy?.city || 'GEN').substring(0, 3).toUpperCase();
    this.siteCode = `SITE-${cityPrefix}-${random}`;
  }
  next();
});

module.exports = mongoose.model('ProjectSite', projectSiteSchema);
