const mongoose = require('mongoose');

const timelineEventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    event: { type: String, required: true },
    actorType: { type: String, enum: ['system', 'b2b', 'admin'], default: 'system' },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

const verificationFlagSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'verifying', 'verified', 'failed', 'manual_review', 'rejected'],
      default: 'pending'
    },
    verifiedAt: { type: Date, default: null },
    provider: { type: String, default: null },
    transactionId: { type: String, default: null },
    maskedValue: { type: String, default: null },
    raw: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { _id: false }
);

const b2bEnterpriseOnboardingSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'B2BCompany',
      default: null
    },
    draftToken: { type: String, sparse: true, unique: true, index: true },
    currentStep: { type: Number, default: 1, min: 1, max: 16 },
    lifecycleStatus: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'document_review',
        'finance_review',
        'compliance_review',
        'operations_review',
        'hold',
        'active',
        'rejected'
      ],
      default: 'draft',
      index: true
    },
    companyInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
    addresses: { type: mongoose.Schema.Types.Mixed, default: {} },
    primaryContact: { type: mongoose.Schema.Types.Mixed, default: {} },
    financeContact: { type: mongoose.Schema.Types.Mixed, default: {} },
    banking: { type: mongoose.Schema.Types.Mixed, default: {} },
    creditProfile: { type: mongoose.Schema.Types.Mixed, default: {} },
    serviceRequirements: { type: mongoose.Schema.Types.Mixed, default: { selectedServices: [] } },
    operationalCoverage: { type: mongoose.Schema.Types.Mixed, default: {} },
    slaConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
    approvalHierarchy: { type: mongoose.Schema.Types.Mixed, default: {} },
    bulkProjectSettings: { type: mongoose.Schema.Types.Mixed, default: {} },
    escrowPaymentRules: { type: mongoose.Schema.Types.Mixed, default: {} },
    compliance: { type: mongoose.Schema.Types.Mixed, default: {} },
    kycFlags: {
      gst: { type: verificationFlagSchema, default: () => ({}) },
      pan: { type: verificationFlagSchema, default: () => ({}) },
      cin: { type: verificationFlagSchema, default: () => ({}) },
      bank: { type: verificationFlagSchema, default: () => ({}) },
      company: { type: verificationFlagSchema, default: () => ({}) },
      contactMobile: { type: verificationFlagSchema, default: () => ({}) },
      contactEmail: { type: verificationFlagSchema, default: () => ({}) },
      agreementSigned: { type: verificationFlagSchema, default: () => ({}) },
      financeApproved: { type: verificationFlagSchema, default: () => ({}) },
      complianceApproved: { type: verificationFlagSchema, default: () => ({}) },
      operationsApproved: { type: verificationFlagSchema, default: () => ({}) },
      adminApproved: { type: verificationFlagSchema, default: () => ({}) }
    },
    requiredDocumentKeys: [{ type: String }],
    documentStatusSummary: {
      total: { type: Number, default: 0 },
      uploaded: { type: Number, default: 0 },
      verified: { type: Number, default: 0 },
      missing: { type: Number, default: 0 },
      expired: { type: Number, default: 0 }
    },
    scores: {
      kyc: { type: Number, default: 0 },
      risk: { type: Number, default: 0 },
      credit: { type: Number, default: 0 }
    },
    review: {
      financeNote: { type: String, default: null },
      complianceNote: { type: String, default: null },
      operationsNote: { type: String, default: null },
      rejectionReason: { type: String, default: null },
      holdReason: { type: String, default: null }
    },
    timeline: [timelineEventSchema],
    submittedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

b2bEnterpriseOnboardingSchema.index({ lifecycleStatus: 1, updatedAt: -1 });
b2bEnterpriseOnboardingSchema.index({ companyId: 1 }, { unique: true, partialFilterExpression: { companyId: { $type: 'objectId' }, deletedAt: null } });

module.exports = mongoose.model('B2BEnterpriseOnboarding', b2bEnterpriseOnboardingSchema);
