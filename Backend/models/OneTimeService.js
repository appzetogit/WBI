const mongoose = require('mongoose');

const oneTimeServiceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a service name'],
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceCategory',
    default: null,
    index: true
  },
  subtitle: {
    type: String,
    trim: true,
    default: ''
  },
  image: {
    type: String,
    default: null
  },
  categoryType: {
    type: String,
    enum: ['one_time', 'project'],
    default: 'one_time'
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  // --- Dynamic Configuration Flags ---
  isBrandRequired: { type: Boolean, default: false },
  isIssueRequired: { type: Boolean, default: false },
  isPackageRequired: { type: Boolean, default: true },
  allowSchedule: { type: Boolean, default: true },
  allowBookNow: { type: Boolean, default: true },
  allowPayAtHome: { type: Boolean, default: true },
  allowOnlinePayment: { type: Boolean, default: true },
  requiresOTP: { type: Boolean, default: true },
  requiresProofUpload: { type: Boolean, default: true },
  requiresLiveTracking: { type: Boolean, default: true },
  estimatedDuration: { type: String, default: '60 mins' },
  defaultRadiusKm: { type: Number, default: 10 },
  assignmentMode: { type: String, enum: ['auto_wave', 'manual'], default: 'auto_wave' },
  
  // --- Enhanced Dynamic Fields ---
  startingPrice: { type: Number, default: 0 },
  description: { type: String, default: '' },
  iconUrl: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  requiresBrand: { type: Boolean, default: false },
  requiresProblem: { type: Boolean, default: false },
  requiresPackage: { type: Boolean, default: true },
  allowsOtherProblem: { type: Boolean, default: true },
  estimatedTime: { type: String, default: '60 mins' },
  problemIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ServiceIssue' }],
  brandIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ServiceBrand' }],
  packageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ServicePackage' }]
}, {
  timestamps: true
});

oneTimeServiceSchema.pre('validate', function(next) {
  if (this.name && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  // Synchronize new styles and old styles with isModified protection
  if (this.isModified('isBrandRequired')) {
    this.requiresBrand = this.isBrandRequired;
  } else if (this.isModified('requiresBrand')) {
    this.isBrandRequired = this.requiresBrand;
  } else {
    this.requiresBrand = this.isBrandRequired;
  }

  if (this.isModified('isIssueRequired')) {
    this.requiresProblem = this.isIssueRequired;
  } else if (this.isModified('requiresProblem')) {
    this.isIssueRequired = this.requiresProblem;
  } else {
    this.requiresProblem = this.isIssueRequired;
  }

  if (this.isModified('isPackageRequired')) {
    this.requiresPackage = this.isPackageRequired;
  } else if (this.isModified('requiresPackage')) {
    this.isPackageRequired = this.requiresPackage;
  } else {
    this.requiresPackage = this.isPackageRequired;
  }

  if (this.isModified('estimatedDuration')) {
    this.estimatedTime = this.estimatedDuration;
  } else if (this.isModified('estimatedTime')) {
    this.estimatedDuration = this.estimatedTime;
  } else {
    this.estimatedTime = this.estimatedDuration;
  }

  if (this.isModified('image')) {
    this.imageUrl = this.image;
  } else if (this.isModified('imageUrl')) {
    this.image = this.imageUrl;
  } else {
    this.imageUrl = this.image;
  }

  if (this.isModified('subtitle')) {
    this.description = this.subtitle;
  } else if (this.isModified('description')) {
    this.subtitle = this.description;
  } else {
    this.description = this.subtitle;
  }

  next();
});

// Indexes for faster public querying
oneTimeServiceSchema.index({ isActive: 1, categoryType: 1, sortOrder: 1 });
oneTimeServiceSchema.index({ isActive: 1, categoryType: 1, rating: -1, totalReviews: -1 });

module.exports = mongoose.model('OneTimeService', oneTimeServiceSchema);
