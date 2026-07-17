const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorQualityChangeRequestSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  changeCode: { type: String, unique: true, index: true },
  title: { type: String, required: true },
  projectName: { type: String, default: '' },
  projectCode: { type: String, default: '' },
  clientName: { type: String, default: '' },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  requestedBy: { type: String, enum: ['client', 'b2b', 'vendor', 'admin'], default: 'client' },
  changeType: {
    type: String,
    enum: ['additional_work', 'design_change', 'site_change', 'timeline_extension', 'budget_revision'],
    default: 'additional_work'
  },
  previousScope: { type: String, default: '' },
  updatedScope: { type: String, default: '' },
  costDifference: { type: Number, default: 0 },
  timelineDifferenceDays: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['requested', 'under_approval', 'approved', 'rejected', 'implementing', 'closed'],
    default: 'requested',
    index: true
  },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorQualityChangeRequestSchema.pre('save', async function (next) {
  if (!this.changeCode) {
    try {
      const year = new Date().getFullYear();
      const c = await Counter.findByIdAndUpdate(`qc_chg_${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
      this.changeCode = `CHG-${year}-${String(c.seq).padStart(4, '0')}`;
    } catch (err) { console.error('changeCode error:', err); }
  }
  next();
});

vendorQualityChangeRequestSchema.index({ vendorId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('VendorQualityChangeRequest', vendorQualityChangeRequestSchema);
