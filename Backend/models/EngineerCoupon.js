const mongoose = require('mongoose');

const engineerCouponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
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
    default: 0 // 0 means no limit for percentage, or irrelevant for flat
  },
  minAmount: {
    type: Number,
    default: 0
  },
  usageLimit: {
    type: Number,
    default: 0 // 0 means unlimited
  },
  usedCount: {
    type: Number,
    default: 0
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validTill: {
    type: Date,
    default: null // null means no expiration
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('EngineerCoupon', engineerCouponSchema);
