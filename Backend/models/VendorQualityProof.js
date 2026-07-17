const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const proofItemSchema = new mongoose.Schema({
  label: String,
  type: { type: String, default: 'photo' },
  required: { type: Boolean, default: true },
  submitted: { type: Boolean, default: false },
  value: { type: String, default: '' }
}, { _id: false });

const vendorQualityProofSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  proofCode: { type: String, unique: true, index: true },
  projectName: { type: String, default: '' },
  projectCode: { type: String, default: '' },
  clientName: { type: String, default: '' },
  siteName: { type: String, default: '' },
  serviceCategoryCode: { type: String, required: true, index: true },
  serviceCategoryName: { type: String, default: '' },
  engineerName: { type: String, default: '' },
  submittedAt: Date,
  gpsVerified: { type: Boolean, default: false },
  otpVerified: { type: Boolean, default: false },
  signatureCaptured: { type: Boolean, default: false },
  requirements: [proofItemSchema],
  completeness: { type: Number, default: 0, min: 0, max: 100 },
  status: {
    type: String,
    enum: ['pending_review', 'under_review', 'approved', 'rejected', 'resubmit_required'],
    default: 'pending_review',
    index: true
  },
  internalNotes: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorQualityProofSchema.pre('save', async function (next) {
  if (!this.proofCode) {
    try {
      const year = new Date().getFullYear();
      const c = await Counter.findByIdAndUpdate(`qc_proof_${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
      this.proofCode = `PRF-${year}-${String(c.seq).padStart(4, '0')}`;
    } catch (err) { console.error('proofCode error:', err); }
  }
  if (this.requirements?.length) {
    const done = this.requirements.filter((r) => r.submitted).length;
    this.completeness = Math.round((done / this.requirements.length) * 100);
  }
  next();
});

vendorQualityProofSchema.index({ vendorId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('VendorQualityProof', vendorQualityProofSchema);
