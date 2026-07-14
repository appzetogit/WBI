const mongoose = require('mongoose');

const projectMilestoneSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectOS', required: true, index: true },
  title: { type: String, required: true },
  description: String,
  order: { type: Number, required: true },

  // Dates
  plannedDate: Date,
  actualDate: Date,

  // Status
  status: {
    type: String,
    enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
    default: 'NOT_STARTED',
    index: true
  },
  completionPercentage: { type: Number, default: 0, min: 0, max: 100 },

  // Task summary
  taskSummary: {
    total: { type: Number, default: 0 },
    completed: { type: Number, default: 0 }
  },

  // SLA
  slaDays: Number,
  slaStatus: { type: String, enum: ['ON_TRACK', 'AT_RISK', 'BREACHED'], default: 'ON_TRACK' },

  // Approval
  requiresApproval: { type: Boolean, default: false },
  approvalStatus: { type: String, enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'], default: 'NOT_REQUIRED' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId },
  approvedAt: Date,

  // Finance trigger
  requiresInvoice: { type: Boolean, default: false },
  invoicePercentage: { type: Number, default: 0 },
  invoiceTriggered: { type: Boolean, default: false },
  invoiceTriggeredAt: Date,

  color: { type: String, default: '#10B981' }, // for Gantt/timeline display
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

projectMilestoneSchema.index({ project: 1, order: 1 });

module.exports = mongoose.model('ProjectMilestone', projectMilestoneSchema);
