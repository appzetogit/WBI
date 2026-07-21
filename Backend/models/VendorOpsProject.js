const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorOpsProjectSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  projectCode: { type: String, unique: true, index: true },
  title: { type: String, required: true, trim: true },
  clientName: { type: String, default: '' },
  clientType: { type: String, enum: ['individual', 'b2b'], default: 'b2b' },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorClient', default: null },
  serviceCategoryCode: { type: String, required: true, index: true },
  serviceCategoryName: { type: String, default: '' },
  projectType: {
    type: String,
    enum: ['project', 'amc', 'installation', 'support', 'break_fix'],
    default: 'project',
    index: true
  },
  priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
  budget: { type: Number, default: 0 },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  currentStage: { type: String, default: 'Planning' },
  status: {
    type: String,
    enum: ['draft', 'planning', 'in_progress', 'on_hold', 'at_risk', 'completed', 'archived'],
    default: 'planning',
    index: true
  },
  assignedManager: { type: String, default: '' },
  assignedEngineers: [{
    name: String,
    role: String,
    status: { type: String, default: 'available' },
    engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer', default: null }
  }],
  opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', default: null },
  startDate: Date,
  endDate: Date,
  city: { type: String, default: '' },
  siteCount: { type: Number, default: 0 },
  riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
  paymentStatus: { type: String, enum: ['pending', 'partial', 'paid', 'overdue'], default: 'pending' },
  slaStatus: { type: String, enum: ['on_track', 'at_risk', 'breached'], default: 'on_track' },
  upcomingMilestone: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorOpsProjectSchema.pre('save', async function (next) {
  if (!this.projectCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `ops_project_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.projectCode = `PRJ-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('projectCode error:', err);
    }
  }
  next();
});

vendorOpsProjectSchema.index({ vendorId: 1, status: 1, createdAt: -1 });
vendorOpsProjectSchema.index({ vendorId: 1, serviceCategoryCode: 1 });

module.exports = mongoose.model('VendorOpsProject', vendorOpsProjectSchema);
