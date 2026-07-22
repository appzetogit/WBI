const mongoose = require('mongoose');

const kycVerificationSchema = new mongoose.Schema({
  role: { 
    type: String, 
    required: true,
    enum: ['worker', 'engineer', 'vendor', 'b2b']
  },
  entityId: { 
    type: mongoose.Schema.Types.ObjectId,
    required: true
  }, // The ID of the user/entity, can be draftId if not registered
  draftId: { 
    type: String 
  }, // For registrations in progress
  documentType: { 
    type: String, 
    required: true 
  }, // 'aadhaar', 'pan', 'dl', 'bank', etc.
  documentNumberMasked: { 
    type: String 
  }, // e.g., XXXX-XXXX-1234
  documentHash: { 
    type: String 
  }, // To prevent duplicate checks (hash of PAN number or file hash)
  fileUrl: { 
    type: String 
  }, // Front / single side upload
  fileKey: { 
    type: String 
  },
  backFileUrl: {
    type: String
  },
  backFileKey: {
    type: String
  },
  mimeType: {
    type: String,
    default: ''
  },
  fileSize: {
    type: Number,
    default: 0
  },
  physicalUploadStatus: {
    type: String,
    enum: ['not_required', 'pending', 'uploaded', 'rejected'],
    default: 'not_required'
  },
  provider: { 
    type: String, 
    enum: ['cgpe', 'manual', 'digilocker', 'razorpayx'], 
    default: 'manual' 
  },
  providerTransactionId: { 
    type: String 
  },
  verificationMode: { 
    type: String, 
    required: true,
    enum: ['digilocker', 'api', 'ocr', 'manual', 'upload_only']
  },
  status: { 
    type: String, 
    enum: ['pending', 'verifying', 'verified', 'failed', 'manual_review', 'rejected'], 
    default: 'pending' 
  },
  extractedName: { 
    type: String 
  },
  verifiedName: { 
    type: String 
  },
  nameMatchScore: { 
    type: Number 
  },
  failureReason: { 
    type: String 
  },
  rawResponseEncrypted: { 
    type: mongoose.Schema.Types.Mixed 
  }, // Response data
  verifiedAt: { 
    type: Date 
  },
  reviewedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Admin' 
  },
  reviewedAt: { 
    type: Date 
  }
}, { 
  timestamps: true 
});

kycVerificationSchema.index({ role: 1, entityId: 1, documentType: 1 }, { unique: true });

module.exports = mongoose.model('KYCVerification', kycVerificationSchema);
