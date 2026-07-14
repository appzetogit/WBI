const mongoose = require('mongoose');

const vendorLeaveSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTeamMember', required: true, index: true },

  leaveType: {
    type: String,
    enum: ['Casual', 'Sick', 'Earned', 'Maternity', 'Paternity', 'Emergency', 'Comp Off', 'Unpaid'],
    default: 'Casual'
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  days: { type: Number, required: true },
  reason: { type: String, default: '' },

  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
    default: 'Pending'
  },

  // Approval chain
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTeamMember', default: null },
  approvedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },

  // For half-day leave
  isHalfDay: { type: Boolean, default: false },
  halfDaySession: { type: String, enum: ['Morning', 'Afternoon', ''], default: '' }

}, { timestamps: true });

module.exports = mongoose.model('VendorLeave', vendorLeaveSchema);
