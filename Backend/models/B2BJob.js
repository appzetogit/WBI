const mongoose = require('mongoose');

const b2bJobSchema = new mongoose.Schema({
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BCompany', 
    required: true 
  },
  batchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BBatch',
    default: null,
    index: true
  },
  jobId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  pincode: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  coordinates: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  service: { 
    type: String, 
    required: true 
  },
  subService: { 
    type: String, 
    default: '' 
  },
  priority: { 
    type: String, 
    enum: ['Low', 'Medium', 'High'], 
    default: 'Medium' 
  },
  preferredDate: {
    type: Date,
    required: true
  },
  preferredTime: {
    type: String,
    default: 'Anytime'
  },
  assignedTo: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer',
    default: null 
  },
  assignedToName: {
    type: String,
    default: null
  },
  status: { 
    type: String, 
    enum: ['pending', 'pending_wallet', 'searching_engineer', 'assigned', 'in_progress', 'completed', 'cancelled', 'failed'], 
    default: 'pending' 
  },
  trackingStatus: {
    type: String,
    enum: ['assigned', 'accepted', 'en_route', 'reached_location', 'work_started', 'completed', 'cancelled', 'failed'],
    default: 'assigned'
  },
  eta: {
    type: Number, // Estimated Time of Arrival in minutes
    default: null
  },
  assignedAt: {
    type: Date,
    default: null
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  charge: { 
    type: Number, 
    default: 0 
  },
  slaTarget: {
    type: Number, // SLA target in hours
    default: 24
  },
  deviceId: {
    type: String,
    default: null,
    trim: true
  },
  siteId: {
    type: String,
    default: null,
    trim: true
  },
  startOtp: {
    type: String,
    default: null
  },
  startOtpSentAt: {
    type: Date,
    default: null
  },
  startOtpVerifiedAt: {
    type: Date,
    default: null
  },
  endOtp: {
    type: String,
    default: null
  },
  beforePhotos: [{
    type: String
  }],
  afterPhotos: [{
    type: String
  }],
  // Progressive matching wave state (km radii: 5→10→20→50→100)
  currentWave: {
    type: Number,
    default: 0
  },
  waveStartedAt: {
    type: Date,
    default: null
  },
  notifiedEngineers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer'
  }],
  quoteApprovalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuoteApproval',
    default: null
  },
  incompleteReason: {
    type: String,
    default: null
  },
  incompleteRemarks: {
    type: String,
    default: null
  },
  // Spare Parts / closed-incomplete: block reopen; client must create a fresh job
  requiresNewJob: {
    type: Boolean,
    default: false
  },
  reopenBlocked: {
    type: Boolean,
    default: false
  },
  quoteAdjustmentAmount: {
    type: Number,
    default: 0
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'deducted', 'pending_deduction', 'adjusted'],
    default: 'unpaid'
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BInvoice',
    default: null,
    index: true
  },
  date: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true 
});


b2bJobSchema.index({ companyId: 1, date: 1 });
b2bJobSchema.index({ assignedTo: 1, preferredDate: 1 });
b2bJobSchema.index({ assignedTo: 1, status: 1 });

b2bJobSchema.index({ 'coordinates.coordinates': '2d' }); // 2d index for standard coordinates querying if 2dsphere is too strict
b2bJobSchema.index({ status: 1 });
b2bJobSchema.index({ phone: 1 });
b2bJobSchema.index({ address: 1 });

module.exports = mongoose.model('B2BJob', b2bJobSchema);
