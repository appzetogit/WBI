const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const approvalLevelSchema = new mongoose.Schema({
  level: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  by: String,
  at: Date
}, { _id: false });

const vendorQualityApprovalSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  approvalCode: { type: String, unique: true, index: true },
  approvalType: { type: String, enum: ['client', 'b2b'], required: true, index: true },
  projectName: { type: String, default: '' },
  projectCode: { type: String, default: '' },
  clientName: { type: String, default: '' },
  clientType: { type: String, enum: ['individual', 'b2b'], default: 'individual' },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'waiting_changes'],
    default: 'pending',
    index: true
  },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  feedback: { type: String, default: '' },
  // B2B-specific validation points
  slaCompliance: { type: Boolean, default: null },
  documentationOk: { type: Boolean, default: null },
  siteCompletion: { type: Number, default: 0 },
  approvalLevels: [approvalLevelSchema],
  paymentEligible: { type: Boolean, default: false },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorQualityApprovalSchema.pre('save', async function (next) {
  if (!this.approvalCode) {
    try {
      const year = new Date().getFullYear();
      const c = await Counter.findByIdAndUpdate(`qc_appr_${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
      this.approvalCode = `APR-${year}-${String(c.seq).padStart(4, '0')}`;
    } catch (err) { console.error('approvalCode error:', err); }
  }
  this.paymentEligible = this.status === 'approved';
  next();
});

vendorQualityApprovalSchema.index({ vendorId: 1, approvalType: 1, status: 1 });

module.exports = mongoose.model('VendorQualityApproval', vendorQualityApprovalSchema);
