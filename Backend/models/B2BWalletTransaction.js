const mongoose = require('mongoose');

/**
 * Append-only wallet ledger. One row per balance change, written in the same
 * transaction as the balance update by services/b2bWalletLedger.service.js.
 * `ledgerType` is canonical; `type` stays for existing readers.
 */
const LEDGER_TYPES = [
  'TOP_UP',
  'JOB_RESERVATION',
  'JOB_CHARGE',
  'REFUND',
  'ADJUSTMENT',
  'RELEASE',
  'PAYOUT',
  'REVERSAL'
];

const b2bWalletTransactionSchema = new mongoose.Schema({
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BCompany', 
    required: true 
  },
  walletId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BWallet' 
  },
  transactionId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  razorpayOrderId: { 
    type: String 
  },
  razorpayPaymentId: { 
    type: String 
  },
  razorpaySignature: { 
    type: String 
  },
  /** Canonical ledger type; `type` below is the legacy mirror. */
  ledgerType: {
    type: String,
    enum: LEDGER_TYPES,
    index: true
  },
  type: { 
    type: String, 
    enum: [
      'topup',
      'job_deduction',
      'refund',
      'adjustment',
      'failed',
      'escrow_hold',
      'escrow_release',
      'escrow_refund',
      'payout',
      'reversal'
    ], 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  gstAmount: { 
    type: Number, 
    default: 0 
  },
  platformFee: { 
    type: Number, 
    default: 0 
  },
  totalAmount: { 
    type: Number, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'success', 'failed', 'refunded', 'reversed'], 
    default: 'pending' 
  },
  /** REAL money or a simulated payment — DEMO rows are never settled as real. */
  paymentMode: {
    type: String,
    enum: ['REAL', 'DEMO'],
    default: 'REAL',
    index: true
  },
  /** Payment outcome as reported by the gateway / simulator. */
  paymentStatus: {
    type: String,
    enum: ['INITIATED', 'SUCCESS', 'FAILED', 'SIMULATED_SUCCESS', 'REFUNDED'],
    default: null
  },
  /** Signed effect on each bucket, and the balances after this row was applied. */
  availableDelta: { type: Number, default: 0 },
  reservedDelta: { type: Number, default: 0 },
  balanceAfter: {
    available: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  /** Monotonic per-wallet sequence, assigned when the row is written. */
  sequence: { type: Number, default: 0 },
  /** Replay guard: a retried call with the same key must not double-post. */
  idempotencyKey: { type: String, default: null },
  /** Reservation this row belongs to (hold → charge / release). */
  reservationId: { type: String, default: null, index: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BJob', default: null, index: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BBatch', default: null, index: true },
  reversalOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BWalletTransaction',
    default: null
  },
  performedBy: {
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    role: { type: String, default: null },
    name: { type: String, default: '' }
  },
  paymentMethod: { 
    type: String 
  },
  remark: { 
    type: String 
  },
  relatedJobIds: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BJob' 
  }],
  deductionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeductionLedger',
    default: null
  },
  invoiceId: { 
    type: String 
  },
  date: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true 
});


b2bWalletTransactionSchema.index({ companyId: 1, date: 1 });
// Ledger reads sort by createdAt, not date.
b2bWalletTransactionSchema.index({ companyId: 1, createdAt: -1 });
b2bWalletTransactionSchema.index({ razorpayOrderId: 1 });
b2bWalletTransactionSchema.index({ companyId: 1, ledgerType: 1, createdAt: -1 });
b2bWalletTransactionSchema.index({ companyId: 1, sequence: -1 });
b2bWalletTransactionSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

const model = mongoose.model('B2BWalletTransaction', b2bWalletTransactionSchema);
model.LEDGER_TYPES = LEDGER_TYPES;

module.exports = model;
