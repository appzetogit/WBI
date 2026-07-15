const mongoose = require('mongoose');

const proofSubmissionSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorProject',
    required: true
  },
  siteId: {
    type: String,
    required: true
  },
  engineerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorEngineer',
    required: true
  },
  type: {
    type: String,
    enum: ['before', 'after', 'milestone', 'damage'],
    required: true
  },
  photos: [{
    type: String // Cloudinary URLs
  }],
  videos: [{
    type: String // Cloudinary URLs
  }],
  remarks: String,
  geoLocation: {
    lat: Number,
    lng: Number
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  review: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'rework'],
      default: 'pending'
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    reviewedAt: Date,
    rejectionReason: String
  }
}, { timestamps: true });

module.exports = mongoose.model('ProofSubmission', proofSubmissionSchema);
