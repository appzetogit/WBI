const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorFinanceMilestoneSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  milestoneCode: { type: String, unique: true, index: true },
  projectName: { type: String, required: true },
  projectCode: { type: String, default: '' },
  clientName: { type: String, default: '' },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  name: { type: String, required: true },
  sequence: { type: Number, default: 1 },
  amount: { type: Number, required: true, min: 0 },
  percentage: { type: Number, default: 0, min: 0, max: 100 },
  dueDate: Date,
  projectCompleted: { type: Boolean, default: false },
  qaApproved: { type: Boolean, default: false },
  clientApproved: { type: Boolean, default: false },
  invoiceNumber: { type: String, default: '' },
  status: {
    type: String,
    enum: ['upcoming', 'due', 'qa_pending', 'approval_pending', 'invoice_ready', 'invoiced', 'paid', 'blocked'],
    default: 'upcoming',
    index: true
  },
  paidAt: Date,
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorFinanceMilestoneSchema.pre('save', async function (next) {
  if (!this.milestoneCode) {
    try {
      const year = new Date().getFullYear();
      const c = await Counter.findByIdAndUpdate(`fin_mil_${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
      this.milestoneCode = `PM-${year}-${String(c.seq).padStart(5, '0')}`;
    } catch (error) {
      console.error('milestoneCode error:', error);
    }
  }
  next();
});

vendorFinanceMilestoneSchema.index({ vendorId: 1, status: 1, dueDate: 1 });

module.exports = mongoose.model('VendorFinanceMilestone', vendorFinanceMilestoneSchema);
