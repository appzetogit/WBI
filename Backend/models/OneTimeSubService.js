const mongoose = require('mongoose');

const oneTimeSubServiceSchema = new mongoose.Schema({
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OneTimeService',
    required: [true, 'Service reference is required'],
    index: true
  },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceBrand',
    default: null, // null means applicable for all brands
    index: true
  },
  name: {
    type: String,
    required: [true, 'Sub-service name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  sortOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound index for retrieval
oneTimeSubServiceSchema.index({ serviceId: 1, brandId: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('OneTimeSubService', oneTimeSubServiceSchema);
