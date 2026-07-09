const mongoose = require('mongoose');

const deductionLedgerSchema = new mongoose.Schema({
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
    default: null
  },
  amount: {
    type: Number,
    required: true
  },
  reasonCode: {
    type: String,
    required: true
  },
  remarks: {
    type: String,
    default: ''
  },
  deductedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('DeductionLedger', deductionLedgerSchema);
