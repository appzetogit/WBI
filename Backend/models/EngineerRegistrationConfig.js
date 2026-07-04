const mongoose = require('mongoose');

const engineerRegistrationConfigSchema = new mongoose.Schema({
  joiningFeeEnabled: {
    type: Boolean,
    default: true
  },
  joiningFeeAmount: {
    type: Number,
    default: 249
  },
  freelancerJoiningFeeRequired: {
    type: Boolean,
    default: true
  },
  vendorEngineerJoiningFeeRequired: {
    type: String,
    enum: ['required', 'skipped'],
    default: 'skipped'
  },
  selfieRequired: {
    type: Boolean,
    default: true
  },
  videoRequired: {
    type: Boolean,
    default: false
  },
  bikeRequired: {
    type: Boolean,
    default: false
  },
  toolsRequired: {
    type: Boolean,
    default: false
  },
  toolsList: [{
    type: String
  }],
  tshirtSizeRequired: {
    type: Boolean,
    default: true
  },
  tshirtSizes: [{
    type: String
  }],
  verificationRequirement: {
    type: String,
    enum: ['auto', 'manual'],
    default: 'manual'
  }
}, { timestamps: true });

module.exports = mongoose.model('EngineerRegistrationConfig', engineerRegistrationConfigSchema);
