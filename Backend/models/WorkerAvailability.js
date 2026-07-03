const mongoose = require('mongoose');

const workerAvailabilitySchema = new mongoose.Schema({
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    unique: true
  },
  serviceIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OneTimeService'
  }],
  workingDays: [{
    type: String, // e.g., "Monday", "Tuesday" etc.
    enum: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  }],
  startTime: {
    type: String, // "HH:MM" e.g., "09:00"
    required: true
  },
  endTime: {
    type: String, // "HH:MM" e.g., "19:00"
    required: true
  },
  blockedDates: [{
    type: String // YYYY-MM-DD format strings
  }],
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, { timestamps: true });

module.exports = mongoose.model('WorkerAvailability', workerAvailabilitySchema);
