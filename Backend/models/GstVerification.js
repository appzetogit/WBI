const mongoose = require('mongoose');

/**
 * Enterprise GST verification record + audit trail (vendor, B2B, platform).
 */
const gstProfileSchema = new mongoose.Schema(
  {
    gstin: { type: String, uppercase: true, trim: true },
    legalName: { type: String, default: null },
    tradeName: { type: String, default: null },
    pan: { type: String, uppercase: true, default: null },
    constitutionOfBusiness: { type: String, default: null },
    taxpayerType: { type: String, default: null },
    registrationStatus: {
      type: String,
      enum: ['ACTIVE', 'CANCELLED', 'SUSPENDED', 'UNKNOWN', null],
      default: null
    },
    registrationStatusRaw: { type: String, default: null },
    registrationDate: { type: String, default: null },
    businessAddress: { type: String, default: null },
    state: { type: String, default: null },
    stateCode: { type: String, default: null },
    pincode: { type: String, default: null },
    natureOfBusiness: { type: String, default: null },
    lastUpdated: { type: String, default: null }
  },
  { _id: false }
);

const gstVerificationSchema = new mongoose.Schema(
  {
    gstin: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },
    entityType: {
      type: String,
      enum: ['vendor', 'b2b', 'platform', 'unbound'],
      default: 'unbound',
      index: true
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true
    },
    verificationStatus: {
      type: String,
      enum: [
        'pending',
        'verifying',
        'verified',
        'failed',
        'cancelled_gst',
        'suspended_gst',
        'admin_approved',
        'admin_rejected'
      ],
      default: 'pending',
      index: true
    },
    profile: { type: gstProfileSchema, default: () => ({}) },
    provider: { type: String, default: 'cgpe' },
    apiReferenceId: { type: String, default: null, index: true },
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    errorCode: { type: String, default: null },
    errorMessage: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    lastVerificationAt: { type: Date, default: null },
    attemptCount: { type: Number, default: 0 },
    lockedFields: { type: Boolean, default: true },
    adminOverride: {
      overridden: { type: Boolean, default: false },
      by: { type: mongoose.Schema.Types.ObjectId, default: null },
      at: { type: Date, default: null },
      reason: { type: String, default: null },
      action: { type: String, enum: ['approve', 'reject', null], default: null }
    },
    actorType: {
      type: String,
      enum: ['vendor', 'b2b', 'admin', 'system', 'anonymous'],
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
        apiReferenceId: { type: String, default: null },
        latencyMs: { type: Number, default: null }
      }
    ]
  },
  { timestamps: true }
);

gstVerificationSchema.index({ entityType: 1, entityId: 1, gstin: 1 });
gstVerificationSchema.index({ createdAt: -1 });
gstVerificationSchema.index({ verificationStatus: 1, createdAt: -1 });

module.exports = mongoose.model('GstVerification', gstVerificationSchema);
module.exports.gstProfileSchema = gstProfileSchema;
