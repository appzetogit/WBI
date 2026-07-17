const mongoose = require('mongoose');

const vendorWorkforceAttendanceSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorWorkforceEngineer', default: null },
  engineerName: { type: String, default: '' },
  employeeId: { type: String, default: '' },
  date: { type: Date, required: true, index: true },
  checkIn: Date,
  checkOut: Date,
  checkInGps: { lat: Number, lng: Number, address: String },
  checkOutGps: { lat: Number, lng: Number, address: String },
  faceVerified: { type: Boolean, default: false },
  otpVerified: { type: Boolean, default: false },
  workingHours: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },
  breakMinutes: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['present', 'late', 'half_day', 'absent', 'on_leave', 'early_exit'],
    default: 'present',
    index: true
  },
  remarks: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorWorkforceAttendanceSchema.index({ vendorId: 1, date: -1 });
vendorWorkforceAttendanceSchema.index({ vendorId: 1, engineerId: 1, date: -1 });

module.exports = mongoose.model('VendorWorkforceAttendance', vendorWorkforceAttendanceSchema);
