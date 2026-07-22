const mongoose = require('mongoose');

const engineerOfferBannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true, default: '' },
    imageUrl: { type: String, default: '' },
    backgroundColor: { type: String, default: '#4F46E5' },
    textColor: { type: String, default: '#FFFFFF' },
    ctaText: { type: String, default: '' },
    linkedCouponCode: { type: String, uppercase: true, trim: true, default: '' },
    placement: {
      type: String,
      enum: ['engineer_registration_payment'],
      default: 'engineer_registration_payment',
      index: true
    },
    validFrom: { type: Date, default: Date.now },
    validTill: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    priority: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('EngineerOfferBanner', engineerOfferBannerSchema);
