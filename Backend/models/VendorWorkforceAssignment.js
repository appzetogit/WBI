const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorWorkforceAssignmentSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  assignmentCode: { type: String, unique: true, index: true },
  projectName: { type: String, required: true },
  projectCode: { type: String, default: '' },
  engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorWorkforceEngineer', default: null },
  engineerName: { type: String, default: '' },
  employeeId: { type: String, default: '' },
  task: { type: String, default: '' },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  startDate: Date,
  deadline: Date,
  priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
  status: {
    type: String,
    enum: ['assigned', 'in_progress', 'completed', 'rejected', 'escalated', 'reassigned'],
    default: 'assigned',
    index: true
  },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  hoursLogged: { type: Number, default: 0 },
  location: { type: String, default: '' },
  city: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorWorkforceAssignmentSchema.pre('save', async function (next) {
  if (!this.assignmentCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `wf_asg_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.assignmentCode = `ASG-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('assignmentCode error:', err);
    }
  }
  next();
});

vendorWorkforceAssignmentSchema.index({ vendorId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('VendorWorkforceAssignment', vendorWorkforceAssignmentSchema);
