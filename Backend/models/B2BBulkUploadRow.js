const mongoose = require('mongoose');

/**
 * B2BBulkUploadRow — one row of an uploaded file, kept for its whole life.
 *
 * Every row of a bulk upload is persisted as it was read, with its validation
 * result, its resolved service/location/skill, its price and the job it became
 * (if any). The error report, the preview counts and "why was this row not
 * dispatched" are all answered from these rows rather than recomputed.
 */

const rowErrorSchema = new mongoose.Schema({
  field: { type: String, default: '' },
  value: { type: String, default: '' },
  error: { type: String, default: '' },
  /** What the uploader should put there instead. */
  suggestedFix: { type: String, default: '' }
}, { _id: false });

const b2bBulkUploadRowSchema = new mongoose.Schema({
  batchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BBatch',
    required: true,
    index: true
  },
  /** Human-facing batch code, so rows can be looked up without a join. */
  uploadId: { type: String, required: true, index: true },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: true,
    index: true
  },
  /** 1-based row number as the uploader sees it in the spreadsheet. */
  rowNumber: { type: Number, required: true },

  /** The row exactly as parsed, before any normalisation. */
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },

  status: {
    type: String,
    enum: ['VALID', 'INVALID', 'DUPLICATE', 'PRICED', 'CREATED', 'FAILED', 'SKIPPED'],
    default: 'VALID',
    index: true
  },
  /** Named validationErrors: `errors` is a reserved Mongoose document path. */
  validationErrors: { type: [rowErrorSchema], default: [] },
  /** Row number (in this file) or job code this row duplicates. */
  duplicateOf: { type: String, default: null },

  /** Values resolved during validation — what the job is created from. */
  normalized: {
    customerName: { type: String, default: '' },
    contactNumber: { type: String, default: '' },
    serviceAddress: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    serviceType: { type: String, default: '' },
    serviceKey: { type: String, default: '', uppercase: true },
    subServiceKey: { type: String, default: '', uppercase: true },
    requiredSkill: { type: String, default: '' },
    customerRef: { type: String, default: '' },
    assetId: { type: String, default: '' },
    assetModel: { type: String, default: '' },
    serialNumber: { type: String, default: '' },
    priority: { type: String, default: 'Medium' },
    preferredDate: { type: Date, default: null },
    preferredTime: { type: String, default: 'Anytime' },
    description: { type: String, default: '' },
    specialInstructions: { type: String, default: '' },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    }
  },

  /** Price resolved for this row, mirrored onto the job it creates. */
  pricing: {
    baseAmount: { type: Number, default: 0 },
    geographicSurcharge: { type: Number, default: 0 },
    priorityCharge: { type: Number, default: 0 },
    slaCharge: { type: Number, default: 0 },
    emergencyCharge: { type: Number, default: 0 },
    afterHoursCharge: { type: Number, default: 0 },
    additionalCharges: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    source: {
      type: String,
      enum: ['CONTRACT', 'COMPANY', 'DEFAULT', 'LEGACY', 'MANUAL'],
      default: null
    },
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BPricingRule', default: null }
  },

  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BJob', default: null, index: true },
  jobCode: { type: String, default: null },
  /** Why job creation failed after the row had been validated and paid for. */
  failureReason: { type: String, default: null },
  createdAtJob: { type: Date, default: null }
}, { timestamps: true });

b2bBulkUploadRowSchema.index({ batchId: 1, rowNumber: 1 }, { unique: true });
b2bBulkUploadRowSchema.index({ batchId: 1, status: 1 });
b2bBulkUploadRowSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model('B2BBulkUploadRow', b2bBulkUploadRowSchema);
