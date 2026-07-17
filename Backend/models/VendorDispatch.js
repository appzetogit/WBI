const mongoose = require('mongoose');

const vendorDispatchSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorOpsProject', default: null },
  siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorOpsSite', default: null },
  engineerName: { type: String, required: true },
  skills: [String],
  distanceKm: { type: Number, default: 0 },
  workload: { type: Number, default: 0 },
  availability: {
    type: String,
    enum: ['available', 'on_job', 'on_leave', 'offline'],
    default: 'available',
    index: true
  },
  vehicle: { type: String, default: '' },
  tools: [String],
  certificates: [String],
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  city: { type: String, default: '' },
  assignmentStatus: {
    type: String,
    enum: ['unassigned', 'recommended', 'assigned', 'en_route', 'on_site', 'completed'],
    default: 'unassigned',
    index: true
  },
  assignedJob: { type: String, default: '' },
  searchRadiusKm: { type: Number, default: 20 },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorDispatchSchema.index({ vendorId: 1, availability: 1 });

module.exports = mongoose.model('VendorDispatch', vendorDispatchSchema);
