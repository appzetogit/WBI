const mongoose = require('mongoose');

const registrationDraftSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      enum: ['vendor', 'engineer', 'worker', 'b2b'],
      index: true
    },
    draftKey: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    phone: {
      type: String,
      default: null,
      trim: true,
      index: true
    },
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true
    },
    currentStep: {
      type: mongoose.Schema.Types.Mixed,
      default: 1
    },
    completedSteps: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    /** Wizard form JSON — URLs only, no File blobs / OTP secrets */
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    /** ObjectId string used as KYC entityId during draft registration */
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'expired'],
      default: 'draft',
      index: true
    }
  },
  { timestamps: true }
);

registrationDraftSchema.index({ role: 1, draftKey: 1 }, { unique: true });
registrationDraftSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30 days TTL

module.exports = mongoose.model('RegistrationDraft', registrationDraftSchema);
