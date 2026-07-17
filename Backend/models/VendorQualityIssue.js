const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorQualityIssueSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  issueCode: { type: String, unique: true, index: true },
  title: { type: String, required: true },
  issueType: {
    type: String,
    enum: ['technical', 'customer', 'material', 'safety', 'delay', 'escalation', 'compliance'],
    default: 'technical',
    index: true
  },
  projectName: { type: String, default: '' },
  projectCode: { type: String, default: '' },
  clientName: { type: String, default: '' },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium', index: true },
  owner: { type: String, default: '' },
  description: { type: String, default: '' },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'escalated', 'resolved', 'closed'],
    default: 'open',
    index: true
  },
  slaBreached: { type: Boolean, default: false },
  reportedAt: Date,
  resolvedAt: Date,
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorQualityIssueSchema.pre('save', async function (next) {
  if (!this.issueCode) {
    try {
      const year = new Date().getFullYear();
      const c = await Counter.findByIdAndUpdate(`qc_issue_${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
      this.issueCode = `ISS-${year}-${String(c.seq).padStart(4, '0')}`;
    } catch (err) { console.error('issueCode error:', err); }
  }
  next();
});

vendorQualityIssueSchema.index({ vendorId: 1, status: 1, priority: 1 });

module.exports = mongoose.model('VendorQualityIssue', vendorQualityIssueSchema);
