const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OneTimeService',
    required: [true, 'Service reference is required'],
    index: true
  }
}, {
  timestamps: true
});

// Ensure a user can only wishlist a service once
wishlistSchema.index({ userId: 1, serviceId: 1 }, { unique: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);
