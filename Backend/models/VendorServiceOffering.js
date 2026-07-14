const mongoose = require('mongoose');

const vendorServiceOfferingSchema = new mongoose.Schema({
  vendorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Vendor', 
    required: true 
  },
  categoryId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'DigitalServiceCategory', // or 'ServiceCategory' depending on master catalogue
    required: true 
  },
  subCategoryId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'DigitalServiceSubcategory',
    default: null
  },
  
  executionModel: {
    type: String,
    enum: ["ONE_TIME", "PROJECT"],
    required: true
  },

  title: { 
    type: String, 
    required: true, 
    trim: true 
  },
  slug: { 
    type: String, 
    required: true,
    lowercase: true
  },
  shortDescription: { 
    type: String,
    required: true
  },
  detailedDescription: { 
    type: String 
  },

  status: {
    type: String,
    enum: [
      "DRAFT",
      "PENDING_APPROVAL",
      "ACTIVE",
      "INACTIVE",
      "REJECTED",
      "SUSPENDED",
      "ARCHIVED"
    ],
    default: "DRAFT"
  },

  approvalStatus: {
    type: String,
    enum: [
      "NOT_SUBMITTED",
      "PENDING",
      "APPROVED",
      "CHANGES_REQUESTED",
      "REJECTED"
    ],
    default: "NOT_SUBMITTED"
  },

  approvalReason: { type: String },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  approvedAt: { type: Date },

  // ONE_TIME fields
  coverage: {
    type: mongoose.Schema.Types.Mixed, 
    // e.g. { type: 'cities', locations: ['Mumbai', 'Delhi'], radiusKm: 10 }
    default: {}
  },
  pricing: {
    type: mongoose.Schema.Types.Mixed,
    // e.g. { basePrice: 15000, priceType: 'FIXED', taxConfig: 'GST_18' }
    default: {}
  },
  capacity: {
    type: mongoose.Schema.Types.Mixed,
    // e.g. { maxSimultaneousJobs: 5, expectedResponseTime: '2h' }
    default: {}
  },
  sla: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // PROJECT fields
  projectCapability: {
    type: mongoose.Schema.Types.Mixed,
    // e.g. { minProjectValue: 50000, maxProjectValue: 5000000, maxSimultaneousSites: 10 }
    default: {}
  },

  media: [{
    fileUrl: String,
    publicId: String,
    type: { type: String, enum: ['IMAGE', 'VIDEO', 'DOCUMENT'] },
    mimeType: String,
    size: Number,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    createdAt: { type: Date, default: Date.now }
  }],
  documents: [{
    fileUrl: String,
    publicId: String,
    title: String,
    type: { type: String, enum: ['IMAGE', 'VIDEO', 'DOCUMENT'] },
    mimeType: String,
    size: Number,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    createdAt: { type: Date, default: Date.now }
  }],

  isFeatured: { type: Boolean, default: false },
  visibility: { type: String, enum: ['PUBLIC', 'PRIVATE', 'B2B_ONLY'], default: 'PUBLIC' },

  deletedAt: { type: Date, default: null }

}, { timestamps: true });

// Pre-save hook for slug
vendorServiceOfferingSchema.pre('validate', function(next) {
  if (this.title && !this.slug) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
  }
  next();
});

// Indexes for performance
vendorServiceOfferingSchema.index({ vendorId: 1 });
vendorServiceOfferingSchema.index({ categoryId: 1 });
vendorServiceOfferingSchema.index({ subCategoryId: 1 });
vendorServiceOfferingSchema.index({ executionModel: 1 });
vendorServiceOfferingSchema.index({ status: 1 });
vendorServiceOfferingSchema.index({ approvalStatus: 1 });
vendorServiceOfferingSchema.index({ vendorId: 1, subCategoryId: 1, executionModel: 1 });

module.exports = mongoose.model('VendorServiceOffering', vendorServiceOfferingSchema);
