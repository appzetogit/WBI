const mongoose = require('mongoose');

const timeSlotConfigSchema = new mongoose.Schema({
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OneTimeService',
    required: true
  },
  city: {
    type: String,
    required: true
  },
  slotStartTime: {
    type: String, // format: "HH:MM" e.g., "09:00"
    required: true
  },
  slotEndTime: {
    type: String, // format: "HH:MM" e.g., "10:00"
    required: true
  },
  maxBookingsPerSlot: {
    type: Number,
    default: 5
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Index for query optimization
timeSlotConfigSchema.index({ serviceId: 1, city: 1, isActive: 1 });

module.exports = mongoose.model('TimeSlotConfig', timeSlotConfigSchema);
