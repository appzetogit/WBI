const mongoose = require('mongoose');

// Master skill catalog for vendor
const vendorTeamSkillSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, default: 'Technical' }, // Technical, Soft Skill, Domain
  description: { type: String, default: '' },
  color: { type: String, default: '#3B82F6' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('VendorTeamSkill', vendorTeamSkillSchema);
