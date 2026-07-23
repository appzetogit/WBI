const mongoose = require('mongoose');

const userPaymentMethodSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['upi', 'card', 'netbanking', 'wallet', 'cod_preference'],
      required: true
    },
    razorpayCustomerId: { type: String, default: null, index: true },
    /** Encrypted at rest when PAYMENT_TOKEN_ENCRYPTION_KEY is set */
    razorpayTokenId: { type: String, default: null, select: false },
    vpaHash: { type: String, default: null, index: true },
    maskedDisplay: { type: String, required: true },
    network: { type: String, default: null },
    bank: { type: String, default: null },
    walletProvider: { type: String, default: null },
    last4: { type: String, default: null },
    expiryMonth: { type: String, default: null },
    expiryYear: { type: String, default: null },
    isDefault: { type: Boolean, default: false, index: true },
    isVerified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['pending_verification', 'active', 'failed', 'disabled'],
      default: 'pending_verification',
      index: true
    },
    verificationPaymentId: { type: String, default: null },
    verificationRefundId: { type: String, default: null },
    verificationOrderId: { type: String, default: null },
    lastUsedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

userPaymentMethodSchema.index(
  { userId: 1, razorpayTokenId: 1 },
  { unique: true, partialFilterExpression: { razorpayTokenId: { $type: 'string' }, deletedAt: null } }
);
userPaymentMethodSchema.index(
  { userId: 1, vpaHash: 1 },
  { unique: true, partialFilterExpression: { vpaHash: { $type: 'string' }, deletedAt: null } }
);
userPaymentMethodSchema.index({ verificationPaymentId: 1 }, { sparse: true });

module.exports = mongoose.model('UserPaymentMethod', userPaymentMethodSchema);
