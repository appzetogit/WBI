const mongoose = require('mongoose');

// Per-member skill entry (Skill Matrix)
const vendorSkillMatrixSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTeamMember', required: true, index: true },
  skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTeamSkill', required: true },

  level: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
    default: 'Beginner'
  },
  yearsExperience: { type: Number, default: 0 },
  lastAssessedAt: { type: Date, default: null },
  expiryDate: { type: Date, default: null },
  certificationUrl: { type: String, default: null },
  trainingRequired: { type: Boolean, default: false },
  notes: { type: String, default: '' }
}, { timestamps: true });

vendorSkillMatrixSchema.index({ memberId: 1, skillId: 1 }, { unique: true });

module.exports = mongoose.model('VendorSkillMatrix', vendorSkillMatrixSchema);
