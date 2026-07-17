const mongoose = require('mongoose');

const vendorWorkforceLeaveSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorWorkforceEngineer', default: null },
  engineerName: { type: String, default: '' },
  employeeId: { type: String, default: '' },
  leaveType: {
    type: String,
    enum: ['casual', 'sick', 'emergency', 'paid', 'unpaid', 'holiday'],
    default: 'casual',
    index: true
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  days: { type: Number, default: 1 },
  reason: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'manager_approved', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true
  },
  approvedBy: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorWorkforceLeaveSchema.index({ vendorId: 1, status: 1, startDate: -1 });

module.exports = mongoose.model('VendorWorkforceLeave', vendorWorkforceLeaveSchema);
