const mongoose = require('mongoose');

const opportunitySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['user_request', 'b2b', 'bulk', 'rfq', 'direct_invitation'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  requiredCategory: {
    type: String, // e.g. "C01"
    required: true
  },
  requiredSubServices: [{
    type: String
  }],
  clientInfo: {
    clientType: {
      type: String,
      enum: ['b2c', 'b2b'],
      default: 'b2c'
    },
    name: String,
    company: String,
    city: String,
    state: String,
    totalSites: { type: Number, default: 1 }
  },
  budget: {
    min: Number,
    max: Number,
    currency: { type: String, default: 'INR' }
  },
  deadline: {
    type: Date
  },
  eligibleVendors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  }],
  bids: [{
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    quotedAmount: Number,
    proposalText: String,
    submittedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    }
  }],
  status: {
    type: String,
    enum: ['open', 'bidding', 'awarded', 'closed'],
    default: 'open'
  },
  expiresAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Opportunity', opportunitySchema);
