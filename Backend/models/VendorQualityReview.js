const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const checklistItemSchema = new mongoose.Schema({
  label: String,
  passed: { type: Boolean, default: null },
  notes: { type: String, default: '' }
}, { _id: false });

const vendorQualityReviewSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  reviewCode: { type: String, unique: true, index: true },
  projectName: { type: String, default: '' },
  projectCode: { type: String, default: '' },
  clientName: { type: String, default: '' },
  serviceCategoryCode: { type: String, required: true, index: true },
  serviceCategoryName: { type: String, default: '' },
  engineerName: { type: String, default: '' },
  checklist: [checklistItemSchema],
  qualityScore: { type: Number, default: 0, min: 0, max: 100 },
  qaStatus: {
    type: String,
    enum: ['pending', 'passed', 'failed'],
    default: 'pending',
    index: true
  },
  reworkStatus: {
    type: String,
    enum: ['none', 'pending', 'assigned', 'completed'],
    default: 'none',
    index: true
  },
  reworkEngineer: { type: String, default: '' },
  revisitDate: Date,
  remarks: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorQualityReviewSchema.pre('save', async function (next) {
  if (!this.reviewCode) {
    try {
      const year = new Date().getFullYear();
      const c = await Counter.findByIdAndUpdate(`qc_qa_${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
      this.reviewCode = `QA-${year}-${String(c.seq).padStart(4, '0')}`;
    } catch (err) { console.error('reviewCode error:', err); }
  }
  const scored = this.checklist?.filter((c) => c.passed !== null) || [];
  if (scored.length) {
    const pass = scored.filter((c) => c.passed).length;
    this.qualityScore = Math.round((pass / scored.length) * 100);
  }
  next();
});

vendorQualityReviewSchema.index({ vendorId: 1, qaStatus: 1, createdAt: -1 });

module.exports = mongoose.model('VendorQualityReview', vendorQualityReviewSchema);
