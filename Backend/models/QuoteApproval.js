const mongoose = require('mongoose');

const quoteApprovalSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: true,
    index: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BJob',
    required: true,
    index: true
  },
  engineerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer',
    required: true
  },
  originalAmount: {
    type: Number,
    required: true
  },
  proposedAmount: {
    type: Number,
    required: true
  },
  reasonForChange: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  clientRemarks: {
    type: String,
    default: ''
  },
  decidedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('QuoteApproval', quoteApprovalSchema);
