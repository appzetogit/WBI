const mongoose = require('mongoose');

/**
 * Reverse-geocode / location detector audit + snapshot.
 */
const locationVerificationSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: [
        'user',
        'vendor',
        'b2b',
        'engineer',
        'worker',
        'project_site',
        'branch',
        'checkin',
        'platform',
        'unbound'
      ],
      default: 'unbound',
      index: true
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    purpose: {
      type: String,
      enum: [
        'office',
        'coverage',
        'branch',
        'project_site',
        'checkin',
        'checkout',
        'attendance',
        'registration',
        'other'
      ],
      default: 'other',
      index: true
    },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    detailed: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verifying', 'verified', 'failed'],
      default: 'pending',
      index: true
    },
    profile: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    displayName: { type: String, default: null },
    city: { type: String, default: null, index: true },
    state: { type: String, default: null, index: true },
    district: { type: String, default: null },
    pincode: { type: String, default: null, index: true },
    country: { type: String, default: null },
    provider: { type: String, default: 'cgpe' },
    transactionId: { type: String, default: null, index: true },
    requestId: { type: String, default: null, index: true },
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    errorCode: { type: String, default: null },
    errorMessage: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    lastVerificationAt: { type: Date, default: null },
    attemptCount: { type: Number, default: 0 },
    actorType: {
      type: String,
      enum: ['user', 'vendor', 'b2b', 'engineer', 'worker', 'admin', 'system', 'anonymous'],
      default: 'anonymous'
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    attempts: [
      {
        at: { type: Date, default: Date.now },
        status: { type: String },
        errorCode: { type: String, default: null },
        errorMessage: { type: String, default: null },
        latencyMs: { type: Number, default: null }
      }
    ]
  },
  { timestamps: true }
);

locationVerificationSchema.index({ createdAt: -1 });
locationVerificationSchema.index({ entityType: 1, entityId: 1, purpose: 1 });
locationVerificationSchema.index({ latitude: 1, longitude: 1 });

module.exports = mongoose.model('LocationVerification', locationVerificationSchema);
