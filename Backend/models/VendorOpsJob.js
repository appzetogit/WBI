const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/**
 * VendorOpsJob — field job created when vendor assigns an Engineer
 * to a VendorOpsProject (after Business Intake accept).
 */
const vendorOpsJobSchema = new mongoose.Schema({
  jobCode: { type: String, unique: true, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorOpsProject', required: true, index: true },
  opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', default: null },
  engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer', required: true, index: true },
  engineerName: { type: String, default: '' },

  title: { type: String, required: true },
  clientName: { type: String, default: '' },
  clientPhone: { type: String, default: '' },
  city: { type: String, default: '' },
  address: { type: String, default: '' },
  serviceCategoryCode: { type: String, default: '' },
  serviceCategoryName: { type: String, default: '' },
  budget: { type: Number, default: 0 },
  priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
  notes: { type: String, default: '' },
  scheduledAt: { type: Date, default: null },

  status: {
    type: String,
    enum: [
      'pending_acceptance', // assigned, waiting engineer accept
      'accepted',
      'rejected',
      'en_route',
      'on_site',
      'in_progress',
      'completed',
      'cancelled'
    ],
    default: 'pending_acceptance',
    index: true
  },
  assignedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  engineerPayout: { type: Number, default: 0 },
  payoutStatus: {
    type: String,
    enum: ['pending', 'credited', 'not_applicable'],
    default: 'pending'
  },
  payoutAt: { type: Date, default: null },
  payoutTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null }
}, { timestamps: true });

vendorOpsJobSchema.pre('save', async function (next) {
  if (!this.jobCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `ops_job_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.jobCode = `JOB-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('jobCode error:', err);
    }
  }
  next();
});

vendorOpsJobSchema.index({ engineerId: 1, status: 1, createdAt: -1 });
vendorOpsJobSchema.index({ vendorId: 1, projectId: 1 });

module.exports = mongoose.model('VendorOpsJob', vendorOpsJobSchema);
