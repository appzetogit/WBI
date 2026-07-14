const mongoose = require('mongoose');

const vendorDocumentSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true // Legacy field or descriptive name
  },
  documentType: {
    type: String, // e.g., 'PAN', 'AADHAAR', 'GST', 'PF', 'ESI'
  },
  documentNumber: {
    type: String
  },
  documentUrl: {
    type: String,
    required: true
  },
  expiryDate: {
    type: Date
  },
  fileSize: {
    type: Number, // In bytes
    default: 0
  },
  status: {
    type: String,
    enum: ['Verified', 'Pending', 'Rejected', 'PENDING', 'VERIFIED', 'REJECTED'],
    default: 'PENDING'
  },
  type: {
    type: String,
    enum: ['Vault', 'Certificate', 'Onboarding'],
    default: 'Vault'
  },
  rejectionReason: {
    type: String
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// vendorDocumentSchema.index({ vendorId: 1, documentType: 1 }, { unique: true }); // Prevent duplicates for onboarding type, but may break existing if documentType is null. Best to skip unique constraint for now and handle in logic.

module.exports = mongoose.model('VendorDocument', vendorDocumentSchema);
