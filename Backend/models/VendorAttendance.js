const mongoose = require('mongoose');

const vendorAttendanceSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTeamMember', required: true, index: true },

  date: { type: Date, required: true }, // Date only (normalize to midnight)

  checkInTime: { type: Date, default: null },
  checkOutTime: { type: Date, default: null },

  checkInLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    address: { type: String, default: '' }
  },
  checkOutLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    address: { type: String, default: '' }
  },

  method: {
    type: String,
    enum: ['GPS', 'Geofencing', 'QR', 'Face', 'Manual'],
    default: 'Manual'
  },

  status: {
    type: String,
    enum: ['Present', 'Absent', 'Half Day', 'On Leave', 'Holiday', 'Weekend'],
    default: 'Present'
  },

  workingHours: { type: Number, default: 0 }, // In hours
  overtimeHours: { type: Number, default: 0 },
  breakMinutes: { type: Number, default: 0 },
  isLateArrival: { type: Boolean, default: false },
  lateByMinutes: { type: Number, default: 0 },

  remarks: { type: String, default: '' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTeamMember', default: null }

}, { timestamps: true });

vendorAttendanceSchema.index({ memberId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('VendorAttendance', vendorAttendanceSchema);
