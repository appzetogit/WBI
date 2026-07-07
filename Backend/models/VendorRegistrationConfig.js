const mongoose = require('mongoose');

const vendorRegistrationConfigSchema = new mongoose.Schema({
  joiningFeeEnabled: {
    type: Boolean,
    default: true
  },
  joiningFeeAmount: {
    type: Number,
    default: 999
  },
  pennyDropEnabled: {
    type: Boolean,
    default: true
  },
  kycRequired: {
    type: Boolean,
    default: true
  },
  gstRequiredForProjectPartner: {
    type: Boolean,
    default: true
  },
  selfieRequired: {
    type: Boolean,
    default: true
  },
  trainingRequired: {
    type: Boolean,
    default: false
  },
  defaultCommissionPercent: {
    type: Number,
    default: 10
  },
  payoutCycle: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'weekly'
  }
}, { timestamps: true });

module.exports = mongoose.model('VendorRegistrationConfig', vendorRegistrationConfigSchema);
