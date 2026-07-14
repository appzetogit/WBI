const mongoose = require('mongoose');

const vendorTeamMemberSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },

  // Identity
  employeeId: { type: String, trim: true, default: null }, // e.g. EMP-001
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: null },
  phone: { type: String, trim: true },
  profileImage: { type: String, default: null },
  gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
  dateOfBirth: { type: Date, default: null },

  // Role & Department
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorRole', default: null },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorDepartment', default: null },
  designation: { type: String, trim: true, default: '' }, // e.g. Senior Engineer
  reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTeamMember', default: null },

  // Employment Details
  employmentType: { type: String, enum: ['Full-Time', 'Part-Time', 'Contract', 'Intern', 'Freelancer'], default: 'Full-Time' },
  shift: { type: String, enum: ['Morning', 'Evening', 'Night', 'Flexible'], default: 'Morning' },
  joiningDate: { type: Date, default: Date.now },
  experience: { type: String, default: '0 Years' }, // e.g. "3.5 Years"
  education: { type: String, default: '' },
  languages: [{ type: String }], // e.g. ["Hindi", "English"]

  // Location Assignment
  region: { type: String, default: '' },
  city: { type: String, default: '' },
  branch: { type: String, default: '' },

  // Identity Documents
  aadhaarNumber: { type: String, default: null },
  panNumber: { type: String, default: null },
  drivingLicense: { type: String, default: null },

  // Address
  address: {
    line1: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' }
  },

  // Emergency Contact
  emergencyContact: {
    name: { type: String, default: '' },
    relation: { type: String, default: '' },
    phone: { type: String, default: '' }
  },

  // Bank Details
  bankDetails: {
    accountNumber: { type: String, default: null },
    ifsc: { type: String, default: null },
    bankName: { type: String, default: '' },
    accountHolderName: { type: String, default: '' }
  },
  upiId: { type: String, default: null },

  // Availability
  availabilityStatus: {
    type: String,
    enum: ['Available', 'Busy', 'On Job', 'Travelling', 'Offline', 'On Leave', 'Training', 'Holiday'],
    default: 'Available'
  },
  currentProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProjectAssignment', default: null },
  lastSeenAt: { type: Date, default: null },
  currentLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    updatedAt: { type: Date, default: null }
  },

  // Performance Summary (cached for fast dashboard)
  performanceSummary: {
    avgRating: { type: Number, default: 0 },
    jobsCompleted: { type: Number, default: 0 },
    slaPercent: { type: Number, default: 0 },
    attendancePercent: { type: Number, default: 0 },
    autoScore: { type: Number, default: 0 } // 0-100
  },

  // Status
  isActive: { type: Boolean, default: true },
  notes: { type: String, default: '' }

}, { timestamps: true });

vendorTeamMemberSchema.index({ vendorId: 1, employeeId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('VendorTeamMember', vendorTeamMemberSchema);
