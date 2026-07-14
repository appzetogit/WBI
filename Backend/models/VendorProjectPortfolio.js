const mongoose = require('mongoose');

const vendorProjectPortfolioSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  projectName: {
    type: String,
    required: true
  },
  clientName: {
    type: String,
    required: true
  },
  industry: {
    type: String
  },
  projectValue: {
    type: Number
  },
  numberOfSites: {
    type: Number,
    default: 1
  },
  startDate: {
    type: Date
  },
  completionDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['COMPLETED', 'ONGOING', 'ON_HOLD'],
    default: 'COMPLETED'
  },
  documents: {
    workOrderUrl: String,
    completionCertificateUrl: String,
    clientReferenceContact: String,
    projectImages: [String]
  },
  adminVerificationStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'REJECTED'],
    default: 'PENDING'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('VendorProjectPortfolio', vendorProjectPortfolioSchema);
