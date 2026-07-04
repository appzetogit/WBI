const mongoose = require('mongoose');

const engineerRegistrationDraftSchema = new mongoose.Schema({
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
  vendorCode: {
    type: String,
    default: ''
  },
  fullName: {
    type: String,
    trim: true,
    required: true
  },
  mobile: {
    type: String,
    trim: true,
    required: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  services: [{
    type: String
  }],
  subServices: [{
    type: mongoose.Schema.Types.Mixed
  }],
  tools: [{
    type: String
  }],
  bikeDetails: {
    hasBike: { type: Boolean, default: false },
    vehicleNumber: { type: String, default: '' },
    drivingLicenseUrl: { type: String, default: null },
    rcUrl: { type: String, default: null }
  },
  tshirtSize: {
    type: String,
    default: ''
  },
  selfieUrl: {
    type: String,
    default: null
  },
  introVideoUrl: {
    type: String,
    default: null
  },
  joiningFeeStatus: {
    type: String,
    enum: ['pending', 'paid', 'skipped', 'failed'],
    default: 'pending'
  },
  joiningFeeAmount: {
    type: Number,
    default: 0
  },
  joiningFeeDiscount: {
    type: Number,
    default: 0
  },
  joiningFeeFinalAmount: {
    type: Number,
    default: 0
  },
  couponCode: {
    type: String,
    default: ''
  },
  razorpayOrderId: {
    type: String,
    default: ''
  },
  razorpayPaymentId: {
    type: String,
    default: ''
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('EngineerRegistrationDraft', engineerRegistrationDraftSchema);
