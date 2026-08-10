const mongoose = require('mongoose');

const directorSchema = new mongoose.Schema(
  {
    name: { type: String, default: null },
    dinPan: { type: String, default: null },
    dateOfAppointment: { type: String, default: null },
    nationality: { type: String, default: null },
    gender: { type: String, default: null },
    designation: { type: String, default: null },
    isPresent: { type: Boolean, default: true }
  },
  { _id: false }
);

const chargeSchema = new mongoose.Schema(
  {
    chargeId: { type: String, default: null },
    amount: { type: String, default: null },
    date: { type: String, default: null },
    status: { type: String, default: null },
    holder: { type: String, default: null },
    raw: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { _id: false }
);

const cinProfileSchema = new mongoose.Schema(
  {
    cin: { type: String, uppercase: true, trim: true },
    companyName: { type: String, default: null },
    companyType: { type: String, default: null },
    companyCategory: { type: String, default: null },
    companyClass: { type: String, default: null },
    rocCode: { type: String, default: null },
    registrationNumber: { type: String, default: null },
    dateOfIncorporation: { type: String, default: null },
    companyStatus: {
      type: String,
      enum: [
        'ACTIVE',
        'INACTIVE',
        'STRUCK_OFF',
        'UNDER_LIQUIDATION',
        'DISSOLVED',
        'DORMANT',
        'UNKNOWN',
        null
      ],
      default: null
    },
    companyStatusRaw: { type: String, default: null },
    listedStatus: { type: String, default: null },
    registeredAddress: { type: String, default: null },
    state: { type: String, default: null },
    pincode: { type: String, default: null },
    authorisedCapital: { type: String, default: null },
    paidUpCapital: { type: String, default: null },
    presentDirectors: [directorSchema],
    pastDirectors: [directorSchema],
    directors: [directorSchema],
    relatedParties: { type: [mongoose.Schema.Types.Mixed], default: [] },
    charges: [chargeSchema],
    allDirectorships: { type: [mongoose.Schema.Types.Mixed], default: [] },
    transactionId: { type: String, default: null },
    requestId: { type: String, default: null },
    providerTimestamp: { type: String, default: null }
  },
  { _id: false }
);

const cinVerificationSchema = new mongoose.Schema(
  {
    cin: {
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
        'inactive_company',
        'admin_approved',
        'admin_rejected'
      ],
      default: 'pending',
      index: true
    },
    profile: { type: cinProfileSchema, default: () => ({}) },
    provider: { type: String, default: 'cgpe' },
    transactionId: { type: String, default: null, index: true },
    requestId: { type: String, default: null, index: true },
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
        transactionId: { type: String, default: null },
        requestId: { type: String, default: null },
        latencyMs: { type: Number, default: null }
      }
    ]
  },
  { timestamps: true }
);

cinVerificationSchema.index({ entityType: 1, entityId: 1, cin: 1 });
cinVerificationSchema.index({ createdAt: -1 });
cinVerificationSchema.index({ verificationStatus: 1, createdAt: -1 });
cinVerificationSchema.index({ 'profile.companyName': 'text', cin: 'text' });

module.exports = mongoose.model('CinVerification', cinVerificationSchema);
module.exports.cinProfileSchema = cinProfileSchema;
