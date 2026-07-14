const mongoose = require('mongoose');

const vendorCapabilitySchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
    unique: true
  },
  // One-Time Capability Details
  oneTime: {
    serviceCoverage: {
      cities: [String],
      pincodes: [String],
      serviceRadiusKm: { type: Number, default: 10 },
      workingDays: [String],
      workingHours: {
        start: String,
        end: String
      },
      shifts: [String],
      weekendAvailability: { type: Boolean, default: false },
      nightAvailability: { type: Boolean, default: false }
    },
    dailyCapacity: {
      maxJobsPerDay: { type: Number, default: 0 },
      maxSimultaneousJobs: { type: Number, default: 0 },
      avgResponseTimeMins: { type: Number, default: 60 }
    },
    compliance: {
      kycCompleted: { type: Boolean, default: false },
      policeVerificationCompleted: { type: Boolean, default: false },
      safetyTrainingCompleted: { type: Boolean, default: false }
    },
    serviceConfigurations: [{
      subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubService' },
      experienceYears: Number,
      engineerCount: Number,
      dailyJobCapacity: Number,
      emergencySupport: Boolean,
      sameDaySupport: Boolean,
      availableTools: [String],
      supportedCustomerTypes: [{ type: String, enum: ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL'] }]
    }]
  },
  // Project Capability Details
  project: {
    projectCoverage: {
      states: [String],
      cities: [String],
      panIndiaCapability: { type: Boolean, default: false },
      regionalOffices: [String]
    },
    capacity: {
      maxProjectValueHandled: Number,
      maxSimultaneousProjects: Number,
      maxSimultaneousSites: Number,
      procurementCapacity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'ENTERPRISE'] }
    },
    experience: {
      industryExperience: [String],
      governmentExperience: { type: Boolean, default: false },
      enterpriseExperience: { type: Boolean, default: false }
    },
    workingModel: {
      types: [{ type: String, enum: ['SINGLE_SITE', 'MULTI_SITE', 'CITY_ROLLOUT', 'STATE_ROLLOUT', 'PAN_INDIA'] }],
      billingPreferences: [{ type: String, enum: ['MILESTONE', 'SITE_BASED', 'MONTHLY', 'RESOURCE'] }]
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('VendorCapability', vendorCapabilitySchema);
