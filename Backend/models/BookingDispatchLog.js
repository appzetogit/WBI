const mongoose = require('mongoose');

const bookingDispatchLogSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    index: true
  },
  distance: {
    type: Number, // distance in KM or meters
    required: true
  },
  notificationTime: {
    type: Date,
    default: Date.now
  },
  acceptTime: {
    type: Date,
    default: null
  },
  rejectTime: {
    type: Date,
    default: null
  },
  timeout: {
    type: Boolean,
    default: false
  },
  dispatchWave: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['NOTIFIED', 'ACCEPTED', 'REJECTED', 'TIMEOUT', 'MISSED_DUE_TO_OTHER_ACCEPT'],
    default: 'NOTIFIED',
    index: true
  }
}, { timestamps: true });

// Ensure fast lookup for wave timeouts and individual worker queries
bookingDispatchLogSchema.index({ bookingId: 1, workerId: 1 });

module.exports = mongoose.model('BookingDispatchLog', bookingDispatchLogSchema);
