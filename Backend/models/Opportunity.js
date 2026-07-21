const mongoose = require('mongoose');

// Auto-increment counter helper
const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const bidSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  amount: { type: Number, required: true },
  proposalText: { type: String, default: '' },
  timeline: { type: Number, default: 30 }, // days
  teamSize: { type: Number, default: 1 },
  milestones: [{
    title: String,
    amount: Number,
    days: Number
  }],
  attachments: [String], // Cloudinary URLs
  technicalBid: { type: String, default: '' },
  financialBid: { type: String, default: '' },
  status: {
    type: String,
    enum: ['submitted', 'under_review', 'shortlisted', 'accepted', 'rejected'],
    default: 'submitted'
  },
  rejectionReason: String,
  submittedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: true });

const opportunitySchema = new mongoose.Schema({
  opportunityCode: {
    type: String,
    unique: true,
    index: true
  },
  type: {
    type: String,
    enum: ['client_request', 'b2b_opportunity', 'bulk_requirement', 'bid_quote_request', 'direct_invitation'],
    required: true,
    index: true
  },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },

  // Service category
  categoryCode: { type: String, required: true, index: true },
  categoryName: { type: String, required: true },
  subServices: [String],

  // Client Information
  clientInfo: {
    clientType: { type: String, enum: ['individual', 'company', 'b2b'], default: 'individual' },
    name: String,
    company: String,
    city: String,
    state: String,
    phone: String,
    gstNumber: String,
    companySize: String, // e.g. '50-200 employees'
    industry: String,
    // For direct invitations: vendorId this is directed to
    targetVendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null }
  },

  // Project Requirements
  requirements: {
    totalSites: { type: Number, default: 1 },
    cities: [String],
    description: { type: String, default: '' },
    specialRequirements: { type: String, default: '' },
    startDate: Date,
    contractDuration: String // e.g. '12 months'
  },

  // Budget
  budget: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
    type: { type: String, enum: ['fixed', 'negotiable', 'per_site', 'per_month'], default: 'negotiable' },
    currency: { type: String, default: 'INR' }
  },

  // RFQ Documents (for bid_quote_request type)
  rfqDocumentUrl: { type: String, default: null },
  technicalSpecsUrl: { type: String, default: null },

  deadline: { type: Date, index: true },
  expiresAt: { type: Date, index: true },
  priority: { type: String, enum: ['normal', 'urgent', 'high'], default: 'normal' },

  // Access Control
  eligibleVendors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true }],
  viewedBy: [{ 
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    viewedAt: { type: Date, default: Date.now }
  }],
  // Per-vendor bookmarks
  bookmarkedBy: [{
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    bookmarkedAt: { type: Date, default: Date.now }
  }],

  // Bids
  bids: [bidSchema],

  // Award Info
  awardedTo: {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    projectId: { type: mongoose.Schema.Types.ObjectId, default: null },
    awardedAt: { type: Date, default: null }
  },

  // Status
  status: {
    type: String,
    enum: ['open', 'closed', 'awarded', 'cancelled'],
    default: 'open',
    index: true
  },

  /** Enterprise assignment engine (vendor queue → timeout → freelancer pool) */
  assignment: {
    phase: {
      type: String,
      enum: [
        'project_created',
        'vendor_notified',
        'vendor_reviewing',
        'waiting_vendor_acceptance',
        'vendor_accepted',
        'awaiting_engineer',
        'freelancer_pool',
        'awarded',
        'expired',
        'cancelled'
      ],
      default: 'project_created',
      index: true
    },
    requiredEngineers: { type: Number, default: 1, min: 1 },
    subCatCode: { type: String, default: '' },
    serviceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRequest', default: null },
    b2bJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BJob', default: null },
    b2bCompanyId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BCompany', default: null },
    siteLocation: {
      city: String,
      address: String,
      coordinates: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: undefined }
      }
    },
    vendorQueue: [
      {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
        rank: { type: Number, default: 0 },
        score: { type: Number, default: 0 },
        status: {
          type: String,
          enum: ['pending', 'active', 'accepted', 'rejected', 'timeout', 'skipped'],
          default: 'pending'
        },
        notifiedAt: Date,
        respondedAt: Date,
        rejectionReason: String
      }
    ],
    currentVendorIndex: { type: Number, default: -1 },
    activeVendorUntil: { type: Date, default: null },
    configSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    freelancerPoolReleasedAt: { type: Date, default: null },
    freelancerLeadEngineerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Engineer',
      default: null
    },
    timeline: [
      {
        key: String,
        label: String,
        at: { type: Date, default: Date.now },
        meta: mongoose.Schema.Types.Mixed
      }
    ]
  },

  // Admin who created it
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },

}, { timestamps: true });

// Auto-generate opportunityCode before saving
opportunitySchema.pre('save', async function (next) {
  if (!this.opportunityCode) {
    try {
      const year = new Date().getFullYear();
      const counterId = `opportunity_${year}`;
      const counter = await Counter.findByIdAndUpdate(
        counterId,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.opportunityCode = `OPP-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('Error generating opportunityCode:', err);
    }
  }
  next();
});

// Index for fast vendor-filtered queries
opportunitySchema.index({ eligibleVendors: 1, status: 1, type: 1 });
opportunitySchema.index({ categoryCode: 1, status: 1 });
opportunitySchema.index({ deadline: 1, status: 1 });

module.exports = mongoose.model('Opportunity', opportunitySchema);
