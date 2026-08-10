const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { VENDOR_STATUS } = require('../utils/constants');

const vendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true
  },
  email: {
    type: String,
    sparse: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: false,
    sparse: true,
    unique: true,
    trim: true
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  appleId: {
    type: String,
    sparse: true,
    unique: true
  },
  role: {
    type: String,
    enum: ['vendor'],
    default: 'vendor'
  },
  password: {
    type: String,
    select: false
  },
  businessName: {
    type: String,
    trim: true
  },
  gstin: {
    type: String,
    trim: true,
    uppercase: true,
    default: null
  },
  incorporationType: {
    type: String,
    enum: ['Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'Public Limited', 'Other'],
    default: 'Proprietorship'
  },
  incorporationCertificate: {
    type: String, // Cloudinary URL
    default: null
  },
  teamSize: {
    type: Number,
    default: 1
  },
  partnerMode: {
    type: String,
    enum: ['independent', 'company'],
    default: 'independent'
  },
  businessType: {
    type: String,
    enum: ['quick_service', 'project_partner'],
    default: 'quick_service'
  },
  vendorType: {
    type: String,
    enum: ['quick_service', 'project_partner'],
    default: 'quick_service'
  },
  vendorModels: [{
    type: String,
    enum: ['ONE_TIME', 'PROJECT']
  }],
  subServiceIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'SubService',
    default: []
  },
  workingCities: {
    type: [String],
    default: []
  },
  serviceRadiusKm: {
    type: Number,
    default: 10
  },
  companyDescription: {
    type: String,
    default: null
  },
  website: {
    type: String,
    default: null
  },
  totalWorkers: {
    type: Number,
    default: 0
  },
  totalEngineers: {
    type: Number,
    default: 0
  },
  totalTechnicians: {
    type: Number,
    default: 0
  },
  canHandleDailyInstantJobs: {
    type: Boolean,
    default: true
  },
  totalProjectManagers: {
    type: Number,
    default: 0
  },
  totalFieldTechnicians: {
    type: Number,
    default: 0
  },
  hasInHouseTeam: {
    type: Boolean,
    default: true
  },
  usesSubcontractors: {
    type: Boolean,
    default: false
  },
  workingDays: {
    type: [String],
    default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  },
  workingHours: {
    type: String,
    default: '09:00 AM - 06:00 PM'
  },
  emergencyServiceAvailable: {
    type: Boolean,
    default: false
  },
  available24x7: {
    type: Boolean,
    default: false
  },
  kycStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  bankStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'skipped'],
    default: 'pending'
  },
  operatingCities: [{
    type: String
  }],
  operationalCities: [{
    type: String
  }],
  maxCapacity: {
    type: Number,
    default: 10
  },
  maxCapacityPerMonth: {
    type: Number,
    default: 200
  },
  vendorTier: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum'],
    default: 'bronze'
  },
  overallRating: {
    type: Number,
    default: 0
  },
  approvedServices: [{
    categoryCode: String,
    categoryName: String,
    subServices: [String],
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' }
  }],
  service: {
    type: [String], // Changed to array for multiple categories
    default: [],
    // required: [true, 'Please provide at least one service category'] 
  },
  categories: {
    type: [String],
    default: []
  },
  skills: {
    type: [String],
    default: []
  },
  teamEngineers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer'
  }],
  aadhar: {
    number: {
      type: String,
      trim: true,
      default: null
    },
    document: {
      type: String, // Cloudinary URL (Front Side)
      default: null
    },
    backDocument: {
      type: String, // Cloudinary URL (Back Side)
      default: null
    }
  },
  pan: {
    number: {
      type: String,
      trim: true,
      uppercase: true,
      default: null
    },
    document: {
      type: String, // Cloudinary URL
      default: null
    }
  },
  otherDocuments: [{
    type: String // Cloudinary URLs
  }],
  digitalSLAAccepted: {
    type: Boolean,
    default: false
  },
  pfDocument: {
    type: String, // Cloudinary URL
    default: null
  },
  esiDocument: {
    type: String, // Cloudinary URL
    default: null
  },
  compliance: {
    kycStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    panVerified: { type: Boolean, default: false },
    gstVerified: { type: Boolean, default: false },
    pfRegistered: { type: Boolean, default: false },
    esiRegistered: { type: Boolean, default: false },
    slaSignedAt: Date,
    agreementVersion: String
  },
  /** Live CGPE GST verification snapshot (locked after verify unless admin overrides) */
  gstVerification: {
    gstin: { type: String, uppercase: true, default: null },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'cancelled_gst', 'suspended_gst', 'admin_approved', 'admin_rejected'],
      default: 'pending'
    },
    verifiedAt: { type: Date, default: null },
    verificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'GstVerification', default: null },
    legalName: { type: String, default: null },
    tradeName: { type: String, default: null },
    pan: { type: String, default: null },
    constitutionOfBusiness: { type: String, default: null },
    taxpayerType: { type: String, default: null },
    registrationStatus: { type: String, default: null },
    registrationDate: { type: String, default: null },
    businessAddress: { type: String, default: null },
    state: { type: String, default: null },
    stateCode: { type: String, default: null },
    pincode: { type: String, default: null },
    natureOfBusiness: { type: String, default: null },
    lastUpdated: { type: String, default: null },
    locked: { type: Boolean, default: false }
  },
  /** MCA CIN (Company Identification Number) */
  cin: { type: String, uppercase: true, trim: true, default: null, sparse: true },
  cinNumber: { type: String, uppercase: true, trim: true, default: null },
  /** Live CGPE MCA/CIN verification snapshot */
  cinVerification: {
    cin: { type: String, uppercase: true, default: null },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'inactive_company', 'admin_approved', 'admin_rejected'],
      default: 'pending'
    },
    verifiedAt: { type: Date, default: null },
    verificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CinVerification', default: null },
    companyName: { type: String, default: null },
    companyType: { type: String, default: null },
    companyCategory: { type: String, default: null },
    companyClass: { type: String, default: null },
    rocCode: { type: String, default: null },
    registrationNumber: { type: String, default: null },
    dateOfIncorporation: { type: String, default: null },
    companyStatus: { type: String, default: null },
    listedStatus: { type: String, default: null },
    registeredAddress: { type: String, default: null },
    state: { type: String, default: null },
    pincode: { type: String, default: null },
    authorisedCapital: { type: String, default: null },
    paidUpCapital: { type: String, default: null },
    directors: { type: [mongoose.Schema.Types.Mixed], default: [] },
    charges: { type: [mongoose.Schema.Types.Mixed], default: [] },
    transactionId: { type: String, default: null },
    requestId: { type: String, default: null },
    locked: { type: Boolean, default: false }
  },
  approvalStatus: {
    type: String,
    enum: Object.values(VENDOR_STATUS),
    default: VENDOR_STATUS.PENDING
  },
  onboarding: {
    currentStep: { type: Number, default: 1 },
    completedSteps: { type: [Number], default: [] },
    progressPercentage: { type: Number, default: 0 },
    status: { 
      type: String, 
      enum: ['DRAFT', 'EMAIL_VERIFICATION_PENDING', 'OTP_VERIFICATION_PENDING', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'SUSPENDED'], 
      default: 'DRAFT' 
    }
  },
  inductionStatus: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending'
  },
  kitDispatchStatus: {
    type: String,
    enum: ['pending', 'dispatched', 'delivered'],
    default: 'pending'
  },
  kitWaybill: {
    type: String,
    default: null,
    trim: true
  },
  operationalAuditStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  operationalAuditAt: {
    type: Date,
    default: null
  },
  workspaceProvisioning: {
    status: {
      type: String,
      enum: ['idle', 'in_progress', 'completed', 'failed'],
      default: 'idle'
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    error: { type: String, default: null }
  },
  approvalDate: {
    type: Date
  },
  rejectedReason: {
    type: String
  },
  /** Engineer signup linking — WBI-{YEAR}-{6 chars} e.g. WBI-2026-X7K9M2 */
  uniqueCompanyCode: {
    type: String,
    trim: true,
    uppercase: true
    // Unique via partial index below — do NOT store null (breaks unique indexes)
  },
  codeStatus: {
    type: String,
    enum: ['active', 'revoked'],
    default: 'active'
  },
  codeGeneratedAt: {
    type: Date,
    default: null
  },
  codeRegeneratedCount: {
    type: Number,
    default: 0
  },
  companyCodeHistory: [{
    code: String,
    revokedAt: Date,
    reason: { type: String, default: 'regenerated' }
  }],
  inviteLinkToken: {
    type: String,
    trim: true
    // Unique via partial index below — omit field when unused (never set null)
  },
  inviteLinkExpiresAt: {
    type: Date
  },

  profilePhoto: {
    type: String,
    default: null
  },
  address: {
    fullAddress: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
    lat: {
      type: Number,
      default: null
    },
    lng: {
      type: Number,
      default: null
    }
  },
  wallet: {
    dues: {
      type: Number,
      default: 0 // Amount owed TO admin (from cash collection)
    },
    earnings: {
      type: Number,
      default: 0 // Amount owed BY admin (net income from jobs)
    },
    totalCashCollected: {
      type: Number,
      default: 0
    },
    totalWithdrawn: {
      type: Number,
      default: 0
    },
    totalSettled: {
      type: Number,
      default: 0
    },
    cashLimit: {
      type: Number,
      default: 10000
    },
    isBlocked: {
      type: Boolean,
      default: false
    },
    blockedAt: {
      type: Date,
      default: null
    },
    blockReason: {
      type: String,
      default: null
    }
  },
  masterWallet: {
    balance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    pendingSettlement: { type: Number, default: 0 },
    lastWithdrawalAt: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  // Settings
  settings: {
    notifications: {
      type: Boolean,
      default: true
    },
    soundAlerts: {
      type: Boolean,
      default: true
    },
    notificationPreferences: {
      leads: { type: Boolean, default: true },
      jobs: { type: Boolean, default: true },
      payments: { type: Boolean, default: true },
      account: { type: Boolean, default: true }
    },
    language: {
      type: String,
      default: 'en'
    },
    serviceRange: {
      type: Number,
      default: 10, // Default 10km service range for the vendor
      min: 1
    }
  },
  // Bank Details
  bankDetails: {
    accountName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    upiId: String
  },
  // Real-time Location
  location: {
    lat: Number,
    lng: Number,
    updatedAt: Date
  },
  // GeoJSON Location for 2dsphere indexing (fast geo queries)
  geoLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
  },
  // Real-time Online Status
  isOnline: {
    type: Boolean,
    default: false,
    index: true
  },
  lastSeenAt: {
    type: Date,
    default: null
  },
  currentSocketId: {
    type: String,
    default: null
  },
  // Availability Status
  availability: {
    type: String,
    enum: ['AVAILABLE', 'BUSY', 'ON_JOB', 'OFFLINE'],
    default: 'OFFLINE',
    index: true
  },
  // Rating & Stats
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  ratingMetrics: {
    slaAdherence: { type: Number, default: 0, min: 0, max: 5 },
    technicalCompletion: { type: Number, default: 0, min: 0, max: 5 },
    damageIncidentRate: { type: Number, default: 0, min: 0, max: 5 },
    professionalEthics: { type: Number, default: 0, min: 0, max: 5 }
  },
  totalJobs: {
    type: Number,
    default: 0
  },
  totalProjects: {
    type: Number,
    default: 0
  },
  activeAmc: {
    type: Number,
    default: 0
  },
  performance: {
    slaAdherence: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    damageIncidents: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0 },
    totalProjects: { type: Number, default: 0 },
    activeProjects: { type: Number, default: 0 }
  },
  completedJobs: {
    type: Number,
    default: 0
  },
  cancelledJobs: {
    type: Number,
    default: 0
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  // Business Hours
  businessHours: {
    monday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    tuesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    wednesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    thursday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    friday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    saturday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    sunday: { open: String, close: String, isOpen: { type: Boolean, default: false } }
  },

  // FCM Push Notification Tokens
  fcmTokens: {
    type: [String],
    default: []
  },
  fcmTokenMobile: {
    type: [String],
    default: []
  },
  loginSessionId: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for faster queries
vendorSchema.index({ approvalStatus: 1 });
vendorSchema.index({ 'wallet.earnings': -1 });
vendorSchema.index({ geoLocation: '2dsphere' }); // Fast geo queries
vendorSchema.index({ isOnline: 1, availability: 1, approvalStatus: 1 }); // Compound index for vendor search

// Partial unique indexes — multiple vendors may omit these fields.
// Storing null under a sparse unique index still collides (only one null allowed).
vendorSchema.index(
  { uniqueCompanyCode: 1 },
  {
    unique: true,
    name: 'uniqueCompanyCode_partial_unique',
    partialFilterExpression: {
      uniqueCompanyCode: { $type: 'string', $gt: '' }
    }
  }
);
vendorSchema.index(
  { inviteLinkToken: 1 },
  {
    unique: true,
    name: 'inviteLinkToken_partial_unique',
    partialFilterExpression: {
      inviteLinkToken: { $type: 'string', $gt: '' }
    }
  }
);

// Hash password before saving (skip if already a bcrypt hash)
vendorSchema.pre('save', async function (next) {
  // Never persist empty unique optional fields as null (E11000 on unique indexes).
  // Sparse unique indexes still index explicit null — omit the field instead.
  ['inviteLinkToken', 'uniqueCompanyCode', 'inviteLinkExpiresAt', 'googleId', 'appleId'].forEach((key) => {
    if (this[key] == null || this[key] === '') {
      this[key] = undefined;
      if (this._doc) delete this._doc[key];
    }
  });

  if (!this.isModified('password') || !this.password) {
    return next();
  }
  // Prevent double-hashing if password was already hashed upstream
  if (/^\$2[aby]\$\d{2}\$/.test(this.password)) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
vendorSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password || !candidatePassword) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Vendor', vendorSchema);

