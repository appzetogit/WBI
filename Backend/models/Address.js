const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true
  },
  label: {
    type: String,
    required: [true, 'Label is required'],
    default: 'Home' // e.g. Home, Work, Other, etc.
  },
  fullAddress: {
    type: String,
    required: [true, 'Full address is required']
  },
  street: {
    type: String,
    default: ''
  },
  area: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    required: [true, 'City is required']
  },
  state: {
    type: String,
    required: [true, 'State is required']
  },
  pincode: {
    type: String,
    required: [true, 'Pincode is required']
  },
  latitude: {
    type: Number,
    required: [true, 'Latitude is required']
  },
  longitude: {
    type: Number,
    required: [true, 'Longitude is required']
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Compound index for user addresses lookup
addressSchema.index({ userId: 1, isActive: 1, isDefault: -1 });

module.exports = mongoose.model('Address', addressSchema);
