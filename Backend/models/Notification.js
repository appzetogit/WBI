const mongoose = require('mongoose');

/**
 * Notification Model
 * Stores notifications for users, vendors, workers, and admins
 */
const notificationSchema = new mongoose.Schema({
  // Recipient Information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null,
    index: true
  },
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null,
    index: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
    index: true
  },
  // Notification Type — open string so new vendor events don't fail validation
  type: {
    type: String,
    required: true,
    index: true
  },
  // Notification Content
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  // Related Entity (optional)
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  relatedType: {
    type: String,
    default: null
  },
  // Notification Status
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  // Additional Data
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for faster queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ vendorId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ workerId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ adminId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

