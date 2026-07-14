const mongoose = require('mongoose');

const vendorRoleSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  title: { type: String, required: true, trim: true }, // e.g. Senior Engineer
  level: { type: Number, default: 1 }, // Hierarchy level (1=Owner, 10=Intern)
  permissions: [{ type: String }], // e.g. ['view_bookings', 'manage_team']
  approvalRights: [{ type: String }], // e.g. ['leave_approval', 'quote_approval']
  salaryGrade: { type: String, default: '' }, // e.g. 'L3'
  reportingTo: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorRole', default: null },
  escalationLevel: { type: Number, default: 1 },
  color: { type: String, default: '#6366F1' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('VendorRole', vendorRoleSchema);
