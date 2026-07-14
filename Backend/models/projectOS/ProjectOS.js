const mongoose = require('mongoose');

// ─── Stats sub-schema (denormalized for fast dashboard queries) ───────────────
const projectStatsSchema = new mongoose.Schema({
  siteCount: { type: Number, default: 0 },
  completedSites: { type: Number, default: 0 },
  inProgressSites: { type: Number, default: 0 },
  pendingSites: { type: Number, default: 0 },
  totalTasks: { type: Number, default: 0 },
  openTasks: { type: Number, default: 0 },
  overdueTasks: { type: Number, default: 0 },
  openIssues: { type: Number, default: 0 },
  pendingApprovals: { type: Number, default: 0 },
  engineersActive: { type: Number, default: 0 },
  contractValue: { type: Number, default: 0 },
  invoicedAmount: { type: Number, default: 0 },
  receivedAmount: { type: Number, default: 0 },
  outstandingAmount: { type: Number, default: 0 },
  slaCompliancePercent: { type: Number, default: 100 },
  lastUpdated: { type: Date, default: Date.now }
}, { _id: false });

// ─── Main ProjectOS Schema ────────────────────────────────────────────────────
const projectOSSchema = new mongoose.Schema({

  // Architecture version flag — separates from legacy Project model
  architectureVersion: { type: String, default: 'PROJECT_OS', immutable: true },

  // Auto-generated project code
  projectCode: { type: String, unique: true, index: true },

  // Client
  clientType: { type: String, enum: ['B2B', 'USER', 'VENDOR_DIRECT'], required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, refPath: 'clientRef' },
  clientRef: { type: String, enum: ['B2BUser', 'User', 'Vendor'] },
  clientName: String, // denormalized for display
  clientPhone: String,

  // Vendor (prime contractor)
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
  vendorName: String, // denormalized

  // Template — snapshot frozen at project creation
  projectTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTemplate', required: true },
  templateVersion: { type: Number, required: true },
  templateSnapshot: { type: mongoose.Schema.Types.Mixed }, // Full JSON of template at creation

  // Category (stored directly for fast querying, not joined)
  category: { type: String, required: true, index: true }, // e.g. 'SOLAR', 'CCTV', 'DIGITAL'
  subcategory: String,
  executionType: { type: String, required: true },

  // Project details
  title: { type: String, required: true },
  scope: String,
  internalNotes: String,

  // Finance
  contractValue: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  billingModel: {
    type: String,
    enum: ['ADVANCE', 'MILESTONE', 'PER_SITE', 'MONTHLY', 'RESOURCE_BASED', 'PERCENTAGE_BASED', 'FINAL_COMPLETION'],
    default: 'MILESTONE'
  },

  // Dates
  startDate: Date,
  expectedEndDate: Date,
  actualEndDate: Date,

  // Status & Health
  status: {
    type: String,
    enum: ['DRAFT', 'PROPOSED', 'APPROVED', 'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'AT_RISK', 'COMPLETED', 'CANCELLED', 'CLOSED'],
    default: 'DRAFT',
    index: true
  },
  currentStage: String, // e.g. current milestone name
  progress: { type: Number, default: 0, min: 0, max: 100 },
  health: { type: String, enum: ['GREEN', 'AMBER', 'RED'], default: 'GREEN' },
  slaStatus: { type: String, enum: ['ON_TRACK', 'AT_RISK', 'BREACHED'], default: 'ON_TRACK' },

  // Team
  projectManagerId: { type: mongoose.Schema.Types.ObjectId },
  projectManagerRole: { type: String, enum: ['Vendor', 'Admin', 'B2BUser'] },

  // Denormalized stats for fast dashboard rendering
  stats: { type: projectStatsSchema, default: () => ({}) },

  // Status history for audit trail
  statusHistory: [{
    status: String,
    changedBy: { type: mongoose.Schema.Types.ObjectId },
    changedByRole: String,
    reason: String,
    changedAt: { type: Date, default: Date.now }
  }],

  // Metadata
  tags: [String],
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdByRole: { type: String, required: true },
  lastActivityAt: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false, index: true }

}, { timestamps: true });

// ─── Indexes ──────────────────────────────────────────────────────────────────
projectOSSchema.index({ vendorId: 1, status: 1 });
projectOSSchema.index({ clientId: 1, clientType: 1 });
projectOSSchema.index({ category: 1, status: 1 });
projectOSSchema.index({ projectTemplateId: 1 });
projectOSSchema.index({ createdAt: -1 });

// ─── Auto-generate project code ───────────────────────────────────────────────
projectOSSchema.pre('validate', async function (next) {
  if (!this.projectCode) {
    const year = new Date().getFullYear();
    const random = Math.floor(100000 + Math.random() * 900000);
    const categoryPrefix = (this.category || 'GEN').substring(0, 3).toUpperCase();
    this.projectCode = `WBI-${categoryPrefix}-${year}-${random}`;
  }
  next();
});

module.exports = mongoose.model('ProjectOS', projectOSSchema);
