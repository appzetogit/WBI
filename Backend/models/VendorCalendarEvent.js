const mongoose = require('mongoose');

const vendorCalendarEventSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorOpsProject', default: null },
  title: { type: String, required: true },
  type: {
    type: String,
    enum: ['project', 'milestone', 'dispatch', 'leave', 'holiday', 'meeting', 'maintenance', 'deadline'],
    default: 'project',
    index: true
  },
  start: { type: Date, required: true, index: true },
  end: { type: Date, required: true },
  allDay: { type: Boolean, default: false },
  engineerName: { type: String, default: '' },
  location: { type: String, default: '' },
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled', 'conflict'], default: 'scheduled' },
  color: { type: String, default: 'blue' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorCalendarEventSchema.index({ vendorId: 1, start: 1, end: 1 });

module.exports = mongoose.model('VendorCalendarEvent', vendorCalendarEventSchema);
