const mongoose = require('mongoose');

const jobStatusTimelineSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BJob',
    required: true,
    index: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: true,
    index: true
  },
  engineerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer',
    default: null
  },
  status: {
    type: String,
    required: true
  },
  remarks: {
    type: String,
    default: ''
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    }
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

jobStatusTimelineSchema.index({ jobId: 1, timestamp: -1 });

module.exports = mongoose.model('JobStatusTimeline', jobStatusTimelineSchema);
