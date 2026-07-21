const mongoose = require('mongoose');

const docTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    label: { type: String, required: true },
    required: { type: Boolean, default: false },
    verificationMode: {
      type: String,
      enum: ['api', 'upload_only', 'manual', 'ocr'],
      default: 'upload_only'
    },
    expiryTracked: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 }
  },
  { _id: false }
);

const serviceCatalogItemSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true },
    categoryCode: { type: String, trim: true, uppercase: true, default: null },
    serviceTypes: [{ type: String }],
    requiredDocumentKeys: [{ type: String }],
    requiredCertificationKeys: [{ type: String }],
    requiredSkills: [{ type: String }],
    defaultSlaTemplateKey: { type: String, default: null },
    isActive: { type: Boolean, default: true }
  },
  { _id: false }
);

const slaTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    firstResponseMinutes: { type: Number, default: 60 },
    arrivalMinutes: { type: Number, default: 240 },
    resolutionMinutes: { type: Number, default: 1440 },
    penaltyRules: { type: mongoose.Schema.Types.Mixed, default: {} },
    escalationMatrix: { type: mongoose.Schema.Types.Mixed, default: {} },
    fieldRules: {
      otpRequired: { type: Boolean, default: true },
      geoFencingRequired: { type: Boolean, default: false },
      beforePhotoRequired: { type: Boolean, default: true },
      afterPhotoRequired: { type: Boolean, default: true },
      customerSignatureRequired: { type: Boolean, default: false },
      videoProofRequired: { type: Boolean, default: false }
    }
  },
  { _id: false }
);

const projectTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    milestoneStructure: [{ title: String, paymentPercent: Number, proofRequired: Boolean }],
    siteChecklist: [{ item: String, required: Boolean }],
    bulkUploadColumns: [{ key: String, label: String, required: Boolean }]
  },
  { _id: false }
);

const approvalTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    levels: [{
      role: { type: String, enum: ['creator', 'manager', 'finance', 'procurement', 'compliance', 'operations', 'final_approver'] },
      label: String,
      required: { type: Boolean, default: true }
    }],
    rules: {
      amountThresholds: [{ maxAmount: Number, requiredLevels: [String] }],
      serviceKeys: [{ serviceKey: String, requiredLevels: [String] }],
      regionKeys: [{ region: String, requiredLevels: [String] }],
      emergencyOverride: { type: Boolean, default: false }
    }
  },
  { _id: false }
);

const b2bOnboardingConfigSchema = new mongoose.Schema(
  {
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    documentTemplates: [docTemplateSchema],
    serviceCatalog: [serviceCatalogItemSchema],
    slaTemplates: [slaTemplateSchema],
    projectTemplates: [projectTemplateSchema],
    approvalTemplates: [approvalTemplateSchema],
    paymentRules: {
      defaultPaymentTermsDays: { type: Number, default: 30 },
      defaultAdvancePercent: { type: Number, default: 0 },
      escrowRequiredDefault: { type: Boolean, default: true },
      poMandatoryDefault: { type: Boolean, default: true },
      retentionPercent: { type: Number, default: 0 }
    },
    activationRules: {
      requireGstVerified: { type: Boolean, default: true },
      requirePanVerified: { type: Boolean, default: true },
      requireBankVerified: { type: Boolean, default: true },
      requireDocumentsApproved: { type: Boolean, default: true },
      requireSlaSigned: { type: Boolean, default: true },
      requireFinanceApproved: { type: Boolean, default: true },
      requireComplianceApproved: { type: Boolean, default: true },
      requireOperationsApproved: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('B2BOnboardingConfig', b2bOnboardingConfigSchema);
