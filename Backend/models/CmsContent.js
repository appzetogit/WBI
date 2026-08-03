const mongoose = require('mongoose');

const cmsContentSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
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

module.exports = mongoose.model('CmsContent', cmsContentSchema);
