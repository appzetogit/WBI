const mongoose = require('mongoose');

const vendorWorkforceCertificationSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorWorkforceEngineer', default: null },
  engineerName: { type: String, default: '' },
  employeeId: { type: String, default: '' },
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['license', 'training', 'government_id', 'technical', 'safety', 'other'],
    default: 'technical'
  },
  serviceCategoryCode: { type: String, default: '', index: true },
  issuingAuthority: { type: String, default: '' },
  certificateNumber: { type: String, default: '' },
  issueDate: Date,
  expiryDate: Date,
  mandatory: { type: Boolean, default: false },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'expired', 'rejected', 'renewal_due'],
    default: 'pending',
    index: true
  },
  documentUrl: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorWorkforceCertificationSchema.index({ vendorId: 1, verificationStatus: 1 });
vendorWorkforceCertificationSchema.index({ vendorId: 1, expiryDate: 1 });

module.exports = mongoose.model('VendorWorkforceCertification', vendorWorkforceCertificationSchema);
