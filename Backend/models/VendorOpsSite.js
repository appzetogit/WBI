const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorOpsSiteSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorOpsProject', required: true, index: true },
  siteCode: { type: String, unique: true, index: true },
  name: { type: String, required: true },
  clientName: { type: String, default: '' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  region: { type: String, default: '' },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  status: {
    type: String,
    enum: ['pending', 'active', 'in_progress', 'completed', 'blocked'],
    default: 'pending',
    index: true
  },
  assignedTeam: [{ name: String, role: String }],
  gpsStatus: { type: String, enum: ['online', 'offline', 'unknown'], default: 'unknown' },
  otpVerified: { type: Boolean, default: false },
  checkInAt: { type: Date, default: null },
  checkOutAt: { type: Date, default: null },
  photoCount: { type: Number, default: 0 },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorOpsSiteSchema.pre('save', async function (next) {
  if (!this.siteCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `ops_site_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.siteCode = `SITE-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('siteCode error:', err);
    }
  }
  next();
});

vendorOpsSiteSchema.index({ vendorId: 1, status: 1 });

module.exports = mongoose.model('VendorOpsSite', vendorOpsSiteSchema);
