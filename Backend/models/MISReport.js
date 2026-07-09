const mongoose = require('mongoose');

const misReportSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: true,
    index: true
  },
  reportType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'custom'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['generating', 'completed', 'failed'],
    default: 'generating'
  },
  downloadUrl: {
    type: String,
    default: null
  },
  generatedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('MISReport', misReportSchema);
