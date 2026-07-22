const mongoose = require('mongoose');

const rejectionHistorySchema = new mongoose.Schema(
  {
    reason: { type: String, required: true },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    rejectedAt: { type: Date, default: Date.now },
    action: { type: String, enum: ['reject', 'reupload_request'], default: 'reject' }
  },
  { _id: false }
);

const verificationDocumentSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    ownerType: {
      type: String,
      enum: ['worker', 'engineer'],
      required: true
    },
    documentType: {
      type: String,
      required: true,
      index: true
    },
    // front | back | single — allows Aadhaar front/back without changing CGPE documentType keys
    side: {
      type: String,
      enum: ['front', 'back', 'single'],
      default: 'single'
    },
    fileUrl: {
      type: String,
      required: true
    },
    thumbnailUrl: {
      type: String,
      default: ''
    },
    fileKey: {
      type: String,
      required: true
    },
    documentNumberMasked: {
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
    version: {
      type: Number,
      default: 1
    },
    status: {
      type: String,
      enum: ['pending', 'uploaded', 'under_review', 'verified', 'rejected', 'expired'],
      default: 'uploaded'
    },
    cgpeRequestId: {
      type: String
    },
    cgpeResponse: {
      type: mongoose.Schema.Types.Mixed
    },
    matchScore: {
      type: Number
    },
    rejectionReason: {
      type: String
    },
    remarks: {
      type: String,
      default: ''
    },
    rejectionHistory: {
      type: [rejectionHistorySchema],
      default: []
    },
    expiryDate: {
      type: Date,
      default: null
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    verifiedAt: {
      type: Date
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    }
  },
  {
    timestamps: true
  }
);

// One file per owner + type + side (front/back/single)
verificationDocumentSchema.index({ ownerId: 1, documentType: 1, side: 1 }, { unique: true });
verificationDocumentSchema.index({ ownerId: 1, status: 1 });

module.exports = mongoose.model('VerificationDocument', verificationDocumentSchema);
