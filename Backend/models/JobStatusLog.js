const mongoose = require('mongoose');

const jobStatusLogSchema = new mongoose.Schema({
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
    required: true
  },
  message: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

jobStatusLogSchema.index({ jobId: 1 });
jobStatusLogSchema.index({ engineerId: 1 });

module.exports = mongoose.model('JobStatusLog', jobStatusLogSchema);
