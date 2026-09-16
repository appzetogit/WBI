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
  assignmentType: {
    type: String,
    enum: ['freelancer', 'vendor_engineer'],
    default: 'freelancer'
  },
  assignedVendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },
  assignedVendorName: {
    type: String,
    default: null
  },
  /**
   * Vendors currently holding this job as a pending request in their
   * Requests inbox — set when the matching engine finds a vendor with a
   * skilled engineer nearby, before any vendor has accepted. A vendor is
   * removed from this list once it accepts (assignedVendorId is then set)
   * or explicitly rejects.
   */
  notifiedVendors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  }],
  vendorRejections: [{
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    reason: { type: String, default: '' },
    rejectedAt: { type: Date, default: Date.now }
  }],
  status: {
    type: String, 
    enum: [
      'pending',
      'pending_wallet',
      'searching_engineer',
      'assigned',
      'accepted',
      'travelling',
      'arrived',
      'in_progress',
      'completion_submitted',
      'admin_review',
      'on_hold',
      'completed',
      'cancelled',
      'rejected',
      'escalated',
      'failed',
      'closed',
      'revision_required'
    ], 
    default: 'pending' 
  },
  trackingStatus: {
    type: String,
    enum: [
      'assigned',
      'accepted',
      'en_route',
      'reached_location',
      'work_started',
      'completion_submitted',
      'admin_review',
      'completed',
      'cancelled',
      'failed',
      'rejected',
      'revision_required'
    ],
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
  acceptedAt: {
    type: Date,
    default: null
  },
  travelStartedAt: {
    type: Date,
    default: null
  },
  arrivedAt: {
    type: Date,
    default: null
  },
  startedAt: {
    type: Date,
    default: null
  },
  completionSubmittedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  },
  rejectionRemarks: {
    type: String,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer',
    default: null
  },
  travelStartLocation: {
    lat: Number,
    lng: Number
  },
  arrivalLocation: {
    lat: Number,
    lng: Number
  },
  startLocation: {
    lat: Number,
    lng: Number
  },
  completionLocation: {
    lat: Number,
    lng: Number
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
  startOtpAttempts: {
    type: Number,
    default: 0
  },
  startOtpLastAttemptAt: {
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
  workNotes: {
    type: String,
    default: ''
  },
  partsReplaced: {
    type: String,
    default: ''
  },
  checklist: [{
    itemId: String,
    label: String,
    checked: { type: Boolean, default: false },
    checkedAt: Date
  }],
  customerSignature: {
    type: String,
    default: null
  },
  customerSignoffMethod: {
    type: String,
    enum: ['signature', 'otp', 'verbal', 'none'],
    default: 'none'
  },
  customerUnavailableAt: {
    type: Date,
    default: null
  },
  customerUnavailableRemarks: {
    type: String,
    default: null
  },
  customerUnavailablePhotos: [{
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
  /**
   * Where the job currently sits in the allocation funnel. `status` alone cannot
   * express this: a job waiting on the vendor marketplace and a freshly uploaded
   * job are both `pending`, which left companies staring at a silent queue.
   */
  allocationStage: {
    type: String,
    enum: [
      'not_started',
      'engineer_waves',
      'vendor_marketplace',
      'freelancer_pool',
      'admin_escalation',
      'allocated'
    ],
    default: 'not_started'
  },
  allocationReason: {
    type: String,
    default: null
  },
  allocationUpdatedAt: {
    type: Date,
    default: null
  },
  /** Number of times matching was manually retried (company/admin). */
  rematchCount: {
    type: Number,
    default: 0
  },
  lastRematchAt: {
    type: Date,
    default: null
  },
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
    enum: [
      'unpaid',
      'deducted', // legacy: treated as escrow_locked
      'pending_deduction',
      'adjusted',
      'escrow_locked',
      'released',
      'refunded'
    ],
    default: 'unpaid'
  },
  /** Engineer / vendor payout after escrow release */
  payoutStatus: {
    type: String,
    enum: ['none', 'pending_review', 'held', 'approved', 'released', 'refunded', 'disputed'],
    default: 'none'
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
// Company-scoped time-window analytics (heatmap, SLA, repeat calls).
b2bJobSchema.index({ companyId: 1, createdAt: -1 });
b2bJobSchema.index({ assignedTo: 1, preferredDate: 1 });
b2bJobSchema.index({ assignedTo: 1, status: 1 });

b2bJobSchema.index({ 'coordinates.coordinates': '2d' }); // 2d index for standard coordinates querying if 2dsphere is too strict
b2bJobSchema.index({ status: 1 });
b2bJobSchema.index({ companyId: 1, allocationStage: 1 });
b2bJobSchema.index({ status: 1, allocationStage: 1, allocationUpdatedAt: -1 });
b2bJobSchema.index({ phone: 1 });
b2bJobSchema.index({ address: 1 });

module.exports = mongoose.model('B2BJob', b2bJobSchema);
