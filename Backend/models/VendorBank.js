const mongoose = require('mongoose');

const vendorBankSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  accountHolderName: {
    type: String,
    required: true,
    trim: true
  },
  accountNumberEncrypted: {
    type: String,
    required: true
  },
  accountNumberMasked: {
    type: String,
    required: true
  },
  ifsc: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  upiId: {
    type: String,
    trim: true
  },
  verifiedAccountName: {
    type: String,
    default: null
  },
  pennyDropStatus: {
    type: String,
    enum: ['pending', 'success', 'failed', 'not_required'],
    default: 'pending'
  },
  fuzzyMatchScore: {
    type: Number,
    default: null
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  bankName: {
    type: String,
    default: ''
  },
  isPrimary: {
    type: Boolean,
    default: false
  },
  method: {
    type: String,
    enum: ['bank', 'upi'],
    default: 'bank'
  },
  providerRef: {
    type: String,
    default: ''
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  }
}, { timestamps: true });

vendorBankSchema.index({ vendorId: 1, isPrimary: -1 });
vendorBankSchema.index({ vendorId: 1, verificationStatus: 1 });

module.exports = mongoose.model('VendorBank', vendorBankSchema);
