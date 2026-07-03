const mongoose = require('mongoose');

const engineerAssignmentSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BJob',
    required: true
  },
  engineerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'en_route', 'reached_location', 'work_started', 'completed', 'cancelled', 'failed'],
    default: 'pending'
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  enRouteAt: {
    type: Date,
    default: null
  },
  reachedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

engineerAssignmentSchema.index({ companyId: 1 });
engineerAssignmentSchema.index({ engineerId: 1 });
engineerAssignmentSchema.index({ jobId: 1 });

module.exports = mongoose.model('EngineerAssignment', engineerAssignmentSchema);
