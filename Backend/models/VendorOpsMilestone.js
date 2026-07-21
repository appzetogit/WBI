const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  taskCode: String,
  title: { type: String, required: true },
  priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
  assignedEngineer: { type: String, default: '' },
  dueDate: Date,
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'blocked', 'done', 'rejected'],
    default: 'todo'
  },
  checklist: [{ label: String, done: { type: Boolean, default: false } }],
  timeSpentMins: { type: Number, default: 0 },
  remarks: { type: String, default: '' }
}, { _id: true });

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorOpsMilestoneSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorOpsProject', required: true, index: true },
  milestoneCode: { type: String, unique: true, index: true },
  title: { type: String, required: true },
  serviceCategoryCode: { type: String, default: '' },
  sequence: { type: Number, default: 1 },
  dueDate: Date,
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'overdue'],
    default: 'pending',
    index: true
  },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  paymentPercent: { type: Number, default: 0, min: 0, max: 100 },
  escrowReleasedAmount: { type: Number, default: 0 },
  qaStatus: {
    type: String,
    enum: ['pending', 'in_review', 'passed', 'failed'],
    default: 'pending'
  },
  customerSignoff: {
    type: String,
    enum: ['not_required', 'pending', 'approved', 'rejected'],
    default: 'not_required'
  },
  b2bSignoff: {
    type: String,
    enum: ['not_required', 'pending', 'approved', 'rejected'],
    default: 'not_required'
  },
  customerSignoffAt: { type: Date, default: null },
  b2bSignoffAt: { type: Date, default: null },
  tasks: [taskSchema],
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorOpsMilestoneSchema.pre('save', async function (next) {
  if (!this.milestoneCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `ops_ms_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.milestoneCode = `MS-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('milestoneCode error:', err);
    }
  }
  next();
});

module.exports = mongoose.model('VendorOpsMilestone', vendorOpsMilestoneSchema);
