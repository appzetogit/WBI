const mongoose = require('mongoose');

/**
 * Admin-configurable assignment rules per service category (or global default).
 */
const projectAssignmentConfigSchema = new mongoose.Schema(
  {
    categoryCode: { type: String, uppercase: true, default: 'DEFAULT', index: true },
    label: { type: String, default: 'Default assignment rules' },
    isActive: { type: Boolean, default: true },
    vendorResponseTimeoutMinutes: { type: Number, default: 120, min: 5 },
    maxVendorsToNotify: { type: Number, default: 10, min: 1 },
    vendorRetryCount: { type: Number, default: 3, min: 0 },
    /**
     * How many vendors from the ranked queue are notified simultaneously per round
     * (broadcast within the current score band), instead of one at a time.
     */
    vendorBatchSize: { type: Number, default: 3, min: 1 },
    priorityMode: {
      type: String,
      enum: ['vendor_first', 'freelancer_only', 'vendor_then_freelancer'],
      default: 'vendor_then_freelancer'
    },
    releaseToFreelancerOnVendorExhausted: { type: Boolean, default: true },
    /**
     * How long an unclaimed project may sit in the freelancer pool before it is
     * escalated to admin. Without this the pool is a dead end and the job stays
     * "pending" forever.
     */
    freelancerPoolTimeoutMinutes: { type: Number, default: 120, min: 5 },
    /** Platform vendor used when a freelancer (no vendorId) wins the project */
    freelancerPoolVendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    scoringWeights: {
      location: { type: Number, default: 30 },
      service: { type: Number, default: 25 },
      capacity: { type: Number, default: 20 },
      rating: { type: Number, default: 15 },
      responseScore: { type: Number, default: 10 }
    }
  },
  { timestamps: true }
);

projectAssignmentConfigSchema.index({ categoryCode: 1, isActive: 1 });

module.exports = mongoose.model('ProjectAssignmentConfig', projectAssignmentConfigSchema);
