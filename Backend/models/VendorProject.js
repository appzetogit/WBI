const mongoose = require('mongoose');

const vendorProjectSchema = new mongoose.Schema({
  projectCode: {
    type: String,
    required: true,
    unique: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  clientType: {
    type: String,
    enum: ['b2c', 'b2b'],
    default: 'b2c'
  },
  serviceCategory: {
    type: String, // e.g. "C01"
    required: true
  },
  subServices: [{
    type: String
  }],
  projectTemplate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceCategory' // Or specific template Id
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  totalSites: {
    type: Number,
    default: 1
  },
  sites: [{
    siteId: String,
    siteName: String,
    address: String,
    city: String,
    state: String,
    pincode: String,
    coordinates: {
      lat: Number,
      lng: Number
    },
    contactPerson: String,
    contactPhone: String,
    status: {
      type: String,
      enum: ['pending', 'assigned', 'in_progress', 'quality_check', 'completed', 'rework'],
      default: 'pending'
    },
    assignedEngineerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorEngineer'
    },
    scheduledDate: Date,
    completedDate: Date,
    photos: {
      before: [String],
      after: [String]
    },
    clientSignoff: { type: Boolean, default: false },
    remarks: String
  }],
  milestones: [{
    milestoneId: String,
    title: String,
    description: String,
    order: Number,
    targetDate: Date,
    completedDate: Date,
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'delayed'],
      default: 'pending'
    },
    paymentLinked: { type: Boolean, default: false },
    paymentPercent: Number,
    proofRequired: { type: Boolean, default: false },
    proofUploaded: [String],
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    approvedAt: Date
  }],
  timeline: {
    startDate: Date,
    expectedEndDate: Date,
    actualEndDate: Date,
    totalDays: Number
  },
  finance: {
    quotedAmount: { type: Number, default: 0 },
    approvedAmount: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalPayable: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
    milestonePayments: [{
      milestoneId: String,
      amount: Number,
      status: String,
      paidAt: Date
    }]
  },
  sla: {
    agreedDays: Number,
    currentDay: { type: Number, default: 0 },
    breached: { type: Boolean, default: false },
    breachReason: String
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'in_progress', 'quality_check', 'completed', 'cancelled', 'disputed'],
    default: 'draft'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  }
}, { timestamps: true });

module.exports = mongoose.model('VendorProject', vendorProjectSchema);
