const mongoose = require('mongoose');

const serviceCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a category name'],
    trim: true,
    unique: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  shortDescription: {
    type: String,
    trim: true,
    default: ''
  },
  icon: {
    type: String, // Can be a URL from cloudinary or an SVG string / icon name
    default: null
  },
  image: {
    type: String, // URL for a banner or larger image if needed
    default: null
  },
  bannerImage: {
    type: String,
    default: null
  },
  trustPoints: [{
    type: String,
    trim: true
  }],
  baseCommissionPercentage: {
    type: Number,
    default: 10,
    min: 0,
    max: 100
  },
  displayOrder: {
    type: Number,
    default: 0,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  showOnApp: {
    type: Boolean,
    default: true,
    index: true
  },
  roles: [{
    type: String,
    enum: ['worker', 'engineer'],
    default: 'worker'
  }],
  serviceType: {
    type: String,
    enum: ['one_time', 'enterprise'],
    default: 'one_time',
    index: true
  },
  audience: {
    type: String,
    enum: ['b2c', 'b2b'],
    default: 'b2c',
    index: true
  },
  assignedRole: {
    type: String,
    enum: ['worker', 'engineer'],
    default: 'worker',
    index: true
  },
  categoryCode: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    default: '#3b82f6'
  },
  subCategories: [{
    subCatCode: String,
    subCatName: String,
    defaultMilestones: [String],
    requiredTools: [String],
    estimatedDays: Number,
    defaultChecklist: [String]
  }],
  projectTemplates: [{
    templateName: String,
    phases: [String],
    requiredCertifications: [String],
    defaultSLADays: Number
  }],
  complianceRequirements: {
    certifications: [String],
    insuranceRequired: { type: Boolean, default: false },
    govtApprovalRequired: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Generate slug before validation if not provided
serviceCategorySchema.pre('validate', function(next) {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

// Indexes for faster public querying
serviceCategorySchema.index({ isActive: 1, showOnApp: 1, displayOrder: 1 });

module.exports = mongoose.model('ServiceCategory', serviceCategorySchema);
