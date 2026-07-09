const mongoose = require('mongoose');

const deviceHistorySchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  siteId: {
    type: String,
    trim: true,
    default: null
  },
  jobHistory: [{
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'B2BJob'
    },
    date: {
      type: Date,
      default: Date.now
    },
    issueReported: String,
    partsReplaced: String,
    engineerName: String,
    engineerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Engineer'
    }
  }]
}, { timestamps: true });

module.exports = mongoose.model('DeviceHistory', deviceHistorySchema);
