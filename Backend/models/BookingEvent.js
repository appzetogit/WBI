const mongoose = require('mongoose');

const bookingEventSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  statusFrom: {
    type: String,
    required: false
  },
  statusTo: {
    type: String,
    required: true
  },
  triggeredBy: {
    type: String, // 'user', 'worker', 'admin', 'system'
    required: true
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  remarks: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

bookingEventSchema.index({ bookingId: 1, createdAt: -1 });

module.exports = mongoose.model('BookingEvent', bookingEventSchema, 'booking_events');
