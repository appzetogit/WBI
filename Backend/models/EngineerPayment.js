const mongoose = require('mongoose');

const engineerPaymentSchema = new mongoose.Schema({
  engineerDraftId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EngineerRegistrationDraft',
    required: true
  },
  engineerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer',
    default: null
  },
  engineerType: {
    type: String,
    enum: ['freelancer', 'vendor_engineer'],
    default: 'freelancer'
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },
  type: {
    type: String,
    default: 'joining_fee'
  },
  baseAmount: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  finalAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  couponCode: {
    type: String,
    default: null
  },
  razorpayOrderId: {
    type: String,
    required: true
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  razorpaySignature: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['created', 'paid', 'failed', 'skipped'],
    default: 'created'
  },
  paidAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

engineerPaymentSchema.index({ razorpayOrderId: 1 });
engineerPaymentSchema.index({ engineerDraftId: 1, status: 1 });
// Unique when present — blocks duplicate joining-fee capture for same Razorpay payment id
engineerPaymentSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } }
);

module.exports = mongoose.model('EngineerPayment', engineerPaymentSchema);
