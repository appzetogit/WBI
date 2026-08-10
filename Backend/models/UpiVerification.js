const mongoose = require('mongoose');

/**
 * Audit + profile for UPI VPA verify and Mobile→UPI lookups.
 */
const upiVerificationSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ['vpa', 'mobile_upi'],
      required: true,
      index: true
    },
    vpa: { type: String, lowercase: true, trim: true, default: null, index: true },
    mobile: { type: String, trim: true, default: null, index: true },
    accountHolderName: { type: String, default: null },
    mobileLinkedName: { type: String, default: null },
    entityType: {
      type: String,
      enum: ['user', 'vendor', 'b2b', 'engineer', 'worker', 'platform', 'unbound'],
      default: 'unbound',
      index: true
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    verificationStatus: {
      type: String,
      enum: [
        'pending',
        'verifying',
        'verified',
        'failed',
        'not_found',
        'admin_approved',
        'admin_rejected'
      ],
      default: 'pending',
      index: true
    },
    profile: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
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
        transactionId: { type: String, default: null },
        requestId: { type: String, default: null },
        latencyMs: { type: Number, default: null }
      }
    ]
  },
  { timestamps: true }
);

upiVerificationSchema.index({ entityType: 1, entityId: 1, kind: 1 });
upiVerificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('UpiVerification', upiVerificationSchema);
