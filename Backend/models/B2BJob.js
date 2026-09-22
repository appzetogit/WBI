const mongoose = require('mongoose');
const {
  LIFECYCLE,
  JobTransitionError,
  assertTransition,
  deriveLifecycleFromLegacy
} = require('../services/jobStateMachine');

/** Where a job originated. Persisted at creation, never inferred from UI. */
const JOB_SOURCES = ['USER_APP', 'B2B', 'ADMIN', 'VENDOR', 'SYSTEM'];

const b2bJobSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: true
  },
  source: {
    type: String,
    enum: JOB_SOURCES,
    // New jobs must declare their origin explicitly; legacy rows are
    // backfilled by scripts/migrations/backfillJobLifecycle.js.
    required: function () { return this.isNew; },
    index: true
  },
  createdBy: {
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    role: { type: String, default: null }
  },
  /** ServiceConfig.categoryCode resolved from `service` at creation. */
  serviceKey: {
    type: String,
    uppercase: true,
    trim: true,
    default: null,
    index: true
  },
  subServiceKey: {
    type: String,
    uppercase: true,
    trim: true,
    default: null
  },
  serviceConfigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceConfig',
    default: null
  },
  /**
   * Canonical lifecycle state (services/jobStateMachine.js). Only
   * services/jobLifecycle.service.js writes it; the legacy `status` below is
   * kept in sync for existing clients.
   */
  lifecycleStatus: {
    type: String,
    enum: Object.values(LIFECYCLE),
    index: true
  },
  lifecycleUpdatedAt: {
    type: Date,
    default: null
  },
  routingMode: {
    type: String,
    enum: ['auto', 'manual', 'hybrid'],
    default: 'auto'
  },
  /** Admin "expand search" override for the widest matching wave, in km. */
  routingMaxRadiusKm: {
    type: Number,
    default: null
  },
  slaDueAt: {
    type: Date,
    default: null,
    index: true
  },
  /** Open JobAssignment row, if an engineer currently holds the job. */
  currentAssignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobAssignment',
    default: null
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
    enum: ['freelancer', 'vendor', 'vendor_engineer', 'worker', 'unassigned'],
    default: 'unassigned'
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
    rejectedAt: { type: Date, default: Date.now },
    // offer_declined: turned the offer down · released: accepted, then handed it back
    kind: { type: String, enum: ['offer_declined', 'released'], default: 'offer_declined' }
  }],
  // Deadline for the open vendor offers; a stale offer timer is ignored.
  vendorOfferExpiresAt: { type: Date, default: null },
  // State the job was in when it was put ON_HOLD (drives Resume).
  onHoldFrom: { type: String, default: null },
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
  /** Engineers who turned down this job's offer or assignment — never re-offered. */
  declinedEngineers: [{
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
  },

  // ── B2B intake details (bulk upload / single job) ────────────────────────
  /** Company's own reference for the end customer, carried from the upload. */
  customerRef: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true },
  specialInstructions: { type: String, default: '', trim: true },
  /** Skill the engineer must hold; resolved from the service when not given. */
  requiredSkill: { type: String, default: '', trim: true },
  asset: {
    assetId: { type: String, default: '', trim: true },
    model: { type: String, default: '', trim: true },
    serialNumber: { type: String, default: '', trim: true }
  },

  // ── Payment & wallet ─────────────────────────────────────────────────────
  /** REAL money or a clearly flagged simulated payment; never settled as real. */
  paymentMode: { type: String, enum: ['REAL', 'DEMO'], default: 'REAL', index: true },
  /** Wallet transaction that paid for (reserved) this job. */
  paymentReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BWalletTransaction',
    default: null,
    index: true
  },
  /** Reservation (escrow hold) covering this job until it is charged or released. */
  walletReservationId: { type: String, default: null, index: true },
  /** Where the money for this job currently sits. */
  walletStatus: {
    type: String,
    enum: ['none', 'reserved', 'charged', 'released', 'refunded'],
    default: 'none'
  },

  // ── Pricing snapshot (what the company was quoted, resolved server-side) ──
  pricing: {
    baseAmount: { type: Number, default: 0 },
    geographicSurcharge: { type: Number, default: 0 },
    priorityCharge: { type: Number, default: 0 },
    slaCharge: { type: Number, default: 0 },
    emergencyCharge: { type: Number, default: 0 },
    afterHoursCharge: { type: Number, default: 0 },
    additionalCharges: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    /** Which level of the priority chain produced this price. */
    source: {
      type: String,
      enum: ['CONTRACT', 'COMPANY', 'DEFAULT', 'LEGACY', 'MANUAL'],
      default: null
    },
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BPricingRule', default: null },
    contractId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BContract', default: null },
    pricedAt: { type: Date, default: null }
  },

  // ── SLA targets & breaches ───────────────────────────────────────────────
  sla: {
    profile: { type: String, default: '' },
    /** Minutes from job creation / assignment, per the company's SLA profile. */
    assignmentMinutes: { type: Number, default: null },
    acceptanceMinutes: { type: Number, default: null },
    arrivalMinutes: { type: Number, default: null },
    responseMinutes: { type: Number, default: null },
    resolutionMinutes: { type: Number, default: null },
    assignmentDueAt: { type: Date, default: null },
    acceptanceDueAt: { type: Date, default: null },
    arrivalDueAt: { type: Date, default: null },
    responseDueAt: { type: Date, default: null },
    resolutionDueAt: { type: Date, default: null },
    breaches: [{
      metric: {
        type: String,
        enum: ['assignment', 'acceptance', 'arrival', 'response', 'resolution']
      },
      dueAt: { type: Date },
      breachedAt: { type: Date, default: Date.now },
      delayMinutes: { type: Number, default: 0 }
    }]
  },

  // ── Routing outcome ──────────────────────────────────────────────────────
  /** Deadline for the assigned engineer to accept; past it the job EXPIRES. */
  assignmentExpiresAt: { type: Date, default: null },
  /** Why routing could not place the job (lifecycleStatus UNASSIGNED). */
  unassignedReason: { type: String, default: null },
  unassignedAt: { type: Date, default: null }
}, { 
  timestamps: true 
});


b2bJobSchema.virtual('b2bCompanyId')
  .get(function () { return this.companyId; })
  .set(function (v) { this.companyId = v; });

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
b2bJobSchema.index({ assignedVendorId: 1, lifecycleStatus: 1, updatedAt: -1 });
b2bJobSchema.index({ notifiedVendors: 1, lifecycleStatus: 1 });
b2bJobSchema.index({ lifecycleStatus: 1, allocationUpdatedAt: -1 });
b2bJobSchema.index({ lifecycleStatus: 1, assignmentExpiresAt: 1 });
b2bJobSchema.index({ companyId: 1, paymentMode: 1, createdAt: -1 });

// ── State machine enforcement ───────────────────────────────────────────────
// Status may only change through services/jobLifecycle.service.js. Writers
// that still assign `status` on a document are checked against the transition
// table here, so an illegal transition fails loudly instead of persisting.

b2bJobSchema.post('init', function () {
  this.$locals.persistedLifecycle = this.lifecycleStatus || deriveLifecycleFromLegacy(this);
});

b2bJobSchema.pre('validate', function (next) {
  if (this.isNew && !this.lifecycleStatus) {
    this.lifecycleStatus = deriveLifecycleFromLegacy(this);
    this.lifecycleUpdatedAt = new Date();
  }
  next();
});

b2bJobSchema.pre('save', function (next) {
  if (this.isNew || this.$locals.lifecycleManaged) return next();

  if (this.isModified('lifecycleStatus')) {
    return next(new JobTransitionError(
      'lifecycleStatus can only be changed through the job lifecycle service',
      { status: 500, code: 'UNMANAGED_LIFECYCLE_WRITE' }
    ));
  }
  if (!this.isModified('status')) return next();

  const from = this.$locals.persistedLifecycle || deriveLifecycleFromLegacy(this);
  const to = deriveLifecycleFromLegacy(this);
  if (from === to) {
    this.lifecycleStatus = to;
    return next();
  }
  try {
    assertTransition(from, to, this);
  } catch (err) {
    return next(err);
  }
  this.lifecycleStatus = to;
  this.lifecycleUpdatedAt = new Date();
  return next();
});

b2bJobSchema.post('save', function () {
  this.$locals.persistedLifecycle = this.lifecycleStatus;
  this.$locals.lifecycleManaged = false;
});

const STATUS_PATHS = ['status', 'lifecycleStatus'];

const touchesStatus = (update = {}) => {
  if (!update || Array.isArray(update)) return Boolean(update);
  return STATUS_PATHS.some((p) =>
    Object.prototype.hasOwnProperty.call(update, p) ||
    Object.values(update).some(
      (op) => op && typeof op === 'object' && Object.prototype.hasOwnProperty.call(op, p)
    )
  );
};

b2bJobSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'], function (next) {
  if (this.getOptions().lifecycleManaged) return next();
  if (!touchesStatus(this.getUpdate())) return next();
  return next(new JobTransitionError(
    'Job status can only be changed through the job lifecycle service',
    { status: 500, code: 'UNMANAGED_STATUS_WRITE' }
  ));
});

b2bJobSchema.statics.JOB_SOURCES = JOB_SOURCES;

module.exports = mongoose.model('B2BJob', b2bJobSchema);
module.exports.JOB_SOURCES = JOB_SOURCES;
