const mongoose = require('mongoose');

const engineerCouponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    title: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    discountType: {
      type: String,
      enum: ['flat', 'percentage'],
      required: true
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0
    },
    maxDiscount: {
      type: Number,
      default: 0
    },
    minAmount: {
      type: Number,
      default: 0
    },
    usageLimit: {
      type: Number,
      default: 0
    },
    usedCount: {
      type: Number,
      default: 0
    },
    perUserLimit: {
      type: Number,
      default: 1
    },
    validFrom: {
      type: Date,
      default: Date.now
    },
    validTill: {
      type: Date,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    autoApply: {
      type: Boolean,
      default: false
    },
    isPublic: {
      type: Boolean,
      default: true
    },
    applicableUserTypes: {
      type: [String],
      enum: ['freelancer', 'vendor_engineer', 'any'],
      default: ['freelancer', 'vendor_engineer']
    },
    applicableRegistrationTypes: {
      type: [String],
      default: ['engineer_joining_fee']
    },
    applicableServices: {
      type: [String],
      default: []
    },
    applicableLocations: {
      type: [String],
      default: []
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    }
  },
  { timestamps: true }
);

engineerCouponSchema.index({ isActive: 1, validFrom: 1, validTill: 1 });
engineerCouponSchema.index({ autoApply: 1, isActive: 1 });

module.exports = mongoose.model('EngineerCoupon', engineerCouponSchema);
