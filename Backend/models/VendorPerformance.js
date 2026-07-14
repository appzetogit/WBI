const mongoose = require('mongoose');

const vendorPerformanceSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTeamMember', required: true, index: true },

  period: { type: String, required: true }, // e.g. "2026-07" (YYYY-MM)
  periodType: { type: String, enum: ['Monthly', 'Quarterly', 'Yearly'], default: 'Monthly' },

  // Job Metrics
  jobsAssigned: { type: Number, default: 0 },
  jobsCompleted: { type: Number, default: 0 },
  jobsCancelled: { type: Number, default: 0 },
  firstTimeFixRate: { type: Number, default: 0 }, // %
  repeatVisits: { type: Number, default: 0 },
  avgCompletionTimeHours: { type: Number, default: 0 },

  // Quality
  slaPercent: { type: Number, default: 0 }, // % tasks done on time
  qualityScore: { type: Number, default: 0 }, // 0-100
  escalations: { type: Number, default: 0 },
  complaints: { type: Number, default: 0 },

  // Attendance
  attendancePercent: { type: Number, default: 0 }, // Present days / Working days
  lateArrivals: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },

  // Financial
  revenueGenerated: { type: Number, default: 0 },

  // Rating
  customerRating: { type: Number, min: 0, max: 5, default: 0 },
  managerRating: { type: Number, min: 0, max: 5, default: 0 },

  // Auto-computed score (weighted formula)
  autoScore: { type: Number, min: 0, max: 100, default: 0 },

  // Peer feedback
  managerFeedback: { type: String, default: '' },
  peerFeedback: { type: String, default: '' }

}, { timestamps: true });

vendorPerformanceSchema.index({ memberId: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('VendorPerformance', vendorPerformanceSchema);
