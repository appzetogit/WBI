const mongoose = require('mongoose');

const b2bBatchSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: true,
    index: true
  },
  batchId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['draft', 'validating', 'validated', 'processing', 'completed', 'failed', 'cancelled', 'paused'],
    default: 'draft',
    index: true
  },
  totalRows: {
    type: Number,
    default: 0
  },
  processedRows: {
    type: Number,
    default: 0
  },
  validRows: {
    type: Number,
    default: 0
  },
  invalidRows: {
    type: Number,
    default: 0
  },
  duplicates: {
    type: Number,
    default: 0
  },
  /** Rows whose job creation failed after payment was reserved. */
  failedJobs: {
    type: Number,
    default: 0
  },
  /** Columns in the uploaded file that the template does not define. */
  unknownColumns: {
    type: [String],
    default: []
  },
  /** Priced total for the valid rows — what must be reserved before dispatch. */
  totalCost: {
    type: Number,
    default: 0
  },
  /** Money state of the upload; jobs are created only once this is RESERVED. */
  paymentStatus: {
    type: String,
    enum: ['NOT_REQUIRED', 'PENDING', 'INSUFFICIENT', 'RESERVED', 'CHARGED', 'REFUNDED', 'FAILED'],
    default: 'PENDING',
    index: true
  },
  /** Where the upload sits in the pipeline (parse → … → routing). */
  processingStatus: {
    type: String,
    enum: [
      'UPLOADED',
      'PARSING',
      'VALIDATING',
      'VALIDATED',
      'PRICED',
      'AWAITING_PAYMENT',
      'CREATING_JOBS',
      'ROUTING',
      'COMPLETED',
      'FAILED',
      'CANCELLED'
    ],
    default: 'UPLOADED',
    index: true
  },
  /** Wallet reservation covering this upload. */
  reservationId: {
    type: String,
    default: null,
    index: true
  },
  paymentMode: {
    type: String,
    enum: ['REAL', 'DEMO'],
    default: 'REAL'
  },
  /** B2B user who uploaded the file (createdBy holds the company). */
  uploadedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    role: { type: String, default: null },
    name: { type: String, default: '' }
  },
  estimatedCost: {
    type: Number,
    default: 0
  },
  perJobCharge: {
    type: Number,
    default: 0
  },
  /**
   * Transparent cost preview produced by b2bPricingEngine at validation time.
   * `lines` groups billable rows by their pricing dimensions (service, tier,
   * geography) so a mixed-service batch shows a real itemised breakdown rather
   * than one blended rate. Null when the legacy flat-rate fallback was used.
   */
  pricingBreakdown: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  walletBalanceAtUpload: {
    type: Number,
    default: 0
  },
  pausedAt: {
    type: Date,
    default: null
  },
  resumedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  failedAt: {
    type: Date,
    default: null
  },
  failureReason: {
    type: String,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany'
  },
  serviceSummary: {
    type: [String],
    default: []
  },
  createdJobsCount: {
    type: Number,
    default: 0
  },
  /**
   * Validation-time routing preview: how many valid rows have at least one
   * vendor whose coverage includes them. Uncovered rows are still created
   * (freelancers may take them) but are likely to land in the unassigned queue.
   */
  routingPreview: {
    coveredRows: { type: Number, default: 0 },
    uncoveredRows: { type: Number, default: 0 },
    uncoveredSamples: { type: [String], default: [] }
  }
}, {
  timestamps: true
});

b2bBatchSchema.index({ createdAt: -1 });
// Batch history is always listed per company, newest first.
b2bBatchSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model('B2BBatch', b2bBatchSchema);
