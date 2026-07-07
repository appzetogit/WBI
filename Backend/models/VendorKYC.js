const mongoose = require('mongoose');

const vendorKycSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  aadhaarUrl: {
    type: String, // Cloudinary URL
    default: null
  },
  panUrl: {
    type: String, // Cloudinary URL
    default: null
  },
  gstCertificateUrl: {
    type: String, // Cloudinary URL
    default: null
  },
  ownerSelfieUrl: {
    type: String, // Cloudinary URL
    default: null
  },
  companyPhotoUrl: {
    type: String, // Cloudinary URL
    default: null
  },
  aadhaarStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  panStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  gstStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  selfieStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  rejectionReason: {
    type: String,
    default: null
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  // Placeholders for future DigiLocker / API Setu integration
  digilockerReferenceId: {
    type: String,
    default: null
  },
  isDigilockerVerified: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('VendorKYC', vendorKycSchema);
