const mongoose = require('mongoose');

const vendorDepartmentSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  color: { type: String, default: '#10B981' },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTeamMember', default: null },
  capacity: { type: Number, default: 0 }, // Max headcount
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('VendorDepartment', vendorDepartmentSchema);
