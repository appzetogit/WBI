const mongoose = require('mongoose');

const vendorGlobalComplianceSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  requirementCode: { type: String, required: true, index: true },
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['kyc', 'tax', 'legal', 'insurance', 'license', 'certification', 'verification', 'bank'],
    default: 'legal',
    index: true
  },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  status: {
    type: String,
    enum: ['verified', 'pending', 'expired', 'rejected', 'renewal_required'],
    default: 'pending',
    index: true
  },
  documentNumber: { type: String, default: '' },
  issuedBy: { type: String, default: '' },
  issuedAt: Date,
  expiresAt: Date,
  reminderDays: { type: Number, default: 30 },
  mandatory: { type: Boolean, default: true },
  lastReminderAt: Date,
  notes: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorGlobalComplianceSchema.index({ vendorId: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model('VendorGlobalCompliance', vendorGlobalComplianceSchema);
