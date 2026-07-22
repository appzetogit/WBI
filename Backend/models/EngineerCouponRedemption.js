const mongoose = require('mongoose');

const engineerCouponRedemptionSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'EngineerCoupon', required: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true, index: true },
    mobile: { type: String, trim: true, index: true },
    email: { type: String, trim: true },
    engineerType: { type: String, enum: ['freelancer', 'vendor_engineer', 'any'], default: 'freelancer' },
    registrationType: { type: String, default: 'engineer_joining_fee', index: true },
    engineerDraftId: { type: mongoose.Schema.Types.ObjectId, ref: 'EngineerRegistrationDraft', index: true },
    engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer' },
    originalAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 },
    razorpayOrderId: { type: String, index: true, sparse: true },
    razorpayPaymentId: { type: String, index: true, sparse: true },
    status: {
      type: String,
      enum: ['reserved', 'applied', 'failed', 'reversed'],
      default: 'applied',
      index: true
    },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  { timestamps: true }
);

engineerCouponRedemptionSchema.index({ couponId: 1, mobile: 1, status: 1 });
engineerCouponRedemptionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EngineerCouponRedemption', engineerCouponRedemptionSchema);
