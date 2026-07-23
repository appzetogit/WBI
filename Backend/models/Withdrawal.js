const mongoose = require('mongoose');

const timelineEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    message: { type: String, default: '' },
    actorType: { type: String, enum: ['vendor', 'admin', 'system', 'gateway'], default: 'system' },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const withdrawalSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker' },
    engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer', index: true },

    source: {
      type: String,
      enum: ['finance_wallet', 'legacy_earnings', 'engineer', 'worker'],
      default: 'finance_wallet',
      index: true
    },
    method: {
      type: String,
      enum: ['bank', 'upi'],
      default: 'bank'
    },
    settlementSchedule: {
      type: String,
      enum: ['Instant', 'T+1', 'T+2', 'Weekly'],
      default: 'T+1'
    },

    amount: {
      type: Number,
      required: true,
      min: [1, 'Withdrawal amount must be at least 1']
    },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: [
        'draft',
        'otp_pending',
        'pending',
        'approved',
        'processing',
        'awaiting_manual_transfer',
        'paid',
        'failed',
        'rejected',
        'cancelled'
      ],
      default: 'pending',
      index: true
    },

    requestDate: { type: Date, default: Date.now },
    processedDate: Date,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paidAt: Date,
    failedAt: Date,
    cancelledAt: Date,

    transactionReference: String, // UTR / bank reference
    gatewayPayoutId: { type: String, default: '', index: true },
    gatewayProvider: { type: String, default: '' },
    gatewayStatus: { type: String, default: '' },
    gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: null },

    adminNotes: String,
    rejectionReason: String,
    failureReason: String,

    bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorBank', default: null },
    bankDetails: {
      accountNumber: String,
      accountNumberMasked: String,
      ifscCode: String,
      accountHolderName: String,
      bankName: String,
      upiId: String
    },

    financeTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorFinanceTransaction' },
    idempotencyKey: { type: String, unique: true, sparse: true, index: true },

    // Fee breakdown (computed at request, finalized at payout)
    tdsRate: { type: Number, default: 0 },
    tdsAmount: { type: Number, default: 0 },
    platformFeeRate: { type: Number, default: 0 },
    platformFeeAmount: { type: Number, default: 0 },
    gstOnFee: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },

    otpVerifiedAt: Date,
    riskFlags: [{ type: String }],
    approvalMode: { type: String, enum: ['auto', 'manual'], default: 'manual' },
    retryCount: { type: Number, default: 0 },
    timeline: { type: [timelineEventSchema], default: [] },

    receiptUrl: { type: String, default: '' }
  },
  { timestamps: true }
);

withdrawalSchema.methods.pushEvent = function pushEvent(status, message, actor = {}) {
  this.timeline = this.timeline || [];
  this.timeline.push({
    status,
    message,
    actorType: actor.actorType || 'system',
    actorId: actor.actorId || null,
    meta: actor.meta || {},
    at: new Date()
  });
};

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
