const mongoose = require('mongoose');

const cmsContentSchema = new mongoose.Schema({
  targetPanel: {
    type: String,
    required: true,
    enum: ['user', 'engineer', 'b2b', 'vendor'],
    default: 'user',
    index: true
  },
  slug: {
    type: String,
    required: true,
    enum: ['about-us', 'terms-services', 'privacy-policy'],
    index: true
  },
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, { timestamps: true });

// Compound unique index for panel + slug
cmsContentSchema.index({ targetPanel: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('CmsContent', cmsContentSchema);
