const mongoose = require('mongoose');

const b2bVerificationLogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BCompany', index: true },
    onboardingId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BEnterpriseOnboarding', index: true },
    verificationType: {
      type: String,
      enum: ['gst', 'pan', 'cin', 'bank', 'ifsc', 'mobile_otp', 'email_otp'],
      required: true,
      index: true
    },
    status: { type: String, enum: ['initiated', 'success', 'failed'], required: true },
    provider: { type: String, default: 'cgpe' },
    requestMasked: { type: mongoose.Schema.Types.Mixed, default: {} },
    responseMasked: { type: mongoose.Schema.Types.Mixed, default: {} },
    transactionId: { type: String, default: null },
    errorMessage: { type: String, default: null },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorType: { type: String, enum: ['b2b', 'admin', 'system'], default: 'system' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('B2BVerificationLog', b2bVerificationLogSchema);
