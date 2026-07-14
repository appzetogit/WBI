const mongoose = require('mongoose');

const vendorCertificationSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTeamMember', required: true, index: true },

  type: {
    type: String,
    enum: [
      'Certification', 'Training', 'License', 'Insurance',
      'Medical Fitness', 'Background Verification', 'Police Verification',
      'NDA', 'SLA Agreement', 'Other'
    ],
    default: 'Certification'
  },
  name: { type: String, required: true, trim: true }, // e.g. "AWS Certified Developer"
  issuedBy: { type: String, default: '' },
  issuedDate: { type: Date, default: null },
  expiryDate: { type: Date, default: null },
  documentUrl: { type: String, default: null },

  status: {
    type: String,
    enum: ['Valid', 'Expiring Soon', 'Expired', 'Pending'],
    default: 'Valid'
  },
  reminderSentAt: { type: Date, default: null },
  notes: { type: String, default: '' }

}, { timestamps: true });

module.exports = mongoose.model('VendorCertification', vendorCertificationSchema);
