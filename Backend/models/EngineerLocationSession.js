const mongoose = require('mongoose');

const engineerLocationSessionSchema = new mongoose.Schema({
  engineerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer',
    required: true,
    unique: true
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  heading: {
    type: Number,
    default: 0
  },
  speed: {
    type: Number,
    default: 0
  },
  battery: {
    type: Number,
    default: 100
  },
  status: {
    type: String,
    enum: ['available', 'assigned', 'en_route', 'at_location', 'working', 'on_break', 'offline'],
    default: 'available'
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now
  },
  socketId: {
    type: String,
    default: ''
  },
  isOnline: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

engineerLocationSessionSchema.index({ 'currentLocation.coordinates': '2dsphere' });

module.exports = mongoose.model('EngineerLocationSession', engineerLocationSessionSchema);
