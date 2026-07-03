const mongoose = require('mongoose');

const b2bUserActivityLogSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: [true, 'Company reference is required'],
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BUser',
    required: [true, 'User reference is required'],
    index: true
  },
  action: {
    type: String,
    required: [true, 'Action description is required']
  },
  module: {
    type: String,
    required: [true, 'Module name is required']
  },
  ipAddress: {
    type: String,
    default: null
  },
  deviceInfo: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('B2BUserActivityLog', b2bUserActivityLogSchema);
