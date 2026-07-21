const mongoose = require('mongoose');

const b2bDocumentSchema = new mongoose.Schema({
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BCompany', 
    required: true 
  },
  documentType: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  documentLabel: { type: String, default: null },
  fileUrl: { type: String, required: true },
  fileKey: { type: String, default: null }, // e.g., Cloudinary public ID
  status: { 
    type: String, 
    enum: ['uploaded', 'verified', 'rejected'], 
    default: 'uploaded' 
  },
  rejectionReason: { type: String, default: null },
  uploadedAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  ocrStatus: { type: String, enum: ['none', 'pending', 'completed', 'failed'], default: 'none' },
  ocrPayload: { type: mongoose.Schema.Types.Mixed, default: null }
}, {
  timestamps: true
});

// Indexes for query speed

b2bDocumentSchema.index({ companyId: 1, documentType: 1 });

module.exports = mongoose.model('B2BDocument', b2bDocumentSchema);
