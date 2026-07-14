const mongoose = require('mongoose');

const vendorTeamMappingSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  engineerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer',
    required: true,
    index: true
  },
  employmentType: {
    type: String,
    enum: ['FULL_TIME', 'CONTRACT', 'FREELANCE'],
    default: 'FULL_TIME'
  },
  assignedModels: [{
    type: String,
    enum: ['ONE_TIME', 'PROJECT']
  }],
  assignedServices: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubService'
  }],
  assignedCities: [{
    type: String
  }],
  projectRole: {
    type: String,
    enum: ['PROJECT_MANAGER', 'SUPERVISOR', 'QA_ENGINEER', 'SAFETY_OFFICER', 'TECHNICIAN', 'FIELD_ENGINEER', 'SENIOR_ENGINEER']
  },
  invitationStatus: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
    default: 'PENDING'
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
    default: 'INACTIVE'
  }
}, {
  timestamps: true
});

vendorTeamMappingSchema.index({ vendorId: 1, engineerId: 1 }, { unique: true });

module.exports = mongoose.model('VendorTeamMapping', vendorTeamMappingSchema);
