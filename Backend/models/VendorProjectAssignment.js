const mongoose = require('mongoose');

const vendorProjectAssignmentSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTeamMember', required: true, index: true },

  // Project linkage
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectOS', required: true },
  projectName: { type: String, trim: true }, // Denormalized
  projectTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTemplate' },
  projectTemplateVersion: { type: Number },
  
  // Scope of assignment
  assignmentScope: {
    type: String,
    enum: ['PROJECT', 'MILESTONE', 'SITE', 'TASK'],
    default: 'PROJECT'
  },
  milestoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectMilestone', default: null },
  siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectSite', default: null },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTask', default: null },

  // Roles & Skills
  assignedRole: { type: String, trim: true, default: '' },
  requiredSkills: [{ type: String }],
  skillMatchPercentage: { type: Number, default: 0 },

  // Timeline & Workload
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  allocationPercent: { type: Number, min: 1, max: 100, default: 100 },
  plannedHoursPerDay: { type: Number, default: 8 },
  budget: { type: Number, default: 0 }, // optional for vendor-level internal tracking
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
  progress: { type: Number, min: 0, max: 100, default: 0 },

  // Status
  status: {
    type: String,
    enum: ['PENDING_ACCEPTANCE', 'ACCEPTED', 'DECLINED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'],
    default: 'ACTIVE'
  },

  notes: { type: String, default: '' },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },

  // Tracking
  assignedBy: { type: mongoose.Schema.Types.ObjectId },
  acceptedAt: { type: Date },
  completedAt: { type: Date }

}, { timestamps: true });

// Compound indexes for fast availability & validation checks
vendorProjectAssignmentSchema.index({ memberId: 1, startDate: 1, endDate: 1, status: 1 });
vendorProjectAssignmentSchema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('VendorProjectAssignment', vendorProjectAssignmentSchema);
