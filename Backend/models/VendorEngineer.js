const mongoose = require('mongoose');

const vendorEngineerSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String
  },
  photo: {
    type: String
  },
  skills: [{
    categoryCode: String,
    subCatCodes: [String],
    experienceYears: Number,
    certifications: [String]
  }],
  operationalCities: [{
    type: String
  }],
  currentLocation: {
    lat: Number,
    lng: Number
  },
  availability: {
    status: {
      type: String,
      enum: ['available', 'on_job', 'leave', 'offline'],
      default: 'available'
    },
    workingDays: {
      type: [String],
      default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    },
    workingHours: {
      start: { type: String, default: '09:00' },
      end: { type: String, default: '18:00' }
    }
  },
  currentAssignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorProject',
    default: null
  },
  kyc: {
    aadhaarVerified: { type: Boolean, default: false },
    panVerified: { type: Boolean, default: false },
    dlNumber: String,
    dlVerified: { type: Boolean, default: false }
  },
  performance: {
    totalJobs: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0 },
    slaBreaches: { type: Number, default: 0 },
    damageIncidents: { type: Number, default: 0 }
  },
  attendance: [{
    date: Date,
    checkIn: Date,
    checkOut: Date,
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProject' },
    hoursWorked: Number
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  }
}, { timestamps: true });

module.exports = mongoose.model('VendorEngineer', vendorEngineerSchema);
