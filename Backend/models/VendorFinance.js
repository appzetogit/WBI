const mongoose = require('mongoose');

const vendorFinanceSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
    unique: true
  },
  // We don't store raw bank account details here if they are already securely stored in VendorBank or Vendor model.
  // But we store Project-specific financial capacity.
  annualTurnover: {
    type: Number
  },
  turnoverRange: {
    type: String,
    enum: ['0-10L', '10L-50L', '50L-1Cr', '1Cr-5Cr', '5Cr+']
  },
  financialYear: {
    type: String
  },
  workingCapitalCapacity: {
    type: Number
  },
  documents: {
    itrUrl: String,
    balanceSheetUrl: String,
    bankStatementUrl: String,
    gstCertificateUrl: String
  },
  verificationStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'REJECTED'],
    default: 'PENDING'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('VendorFinance', vendorFinanceSchema);
