const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const skillSchema = new mongoose.Schema({
  name: { type: String, required: true },
  proficiency: { type: Number, default: 50, min: 0, max: 100 },
  years: { type: Number, default: 0 },
  certified: { type: Boolean, default: false }
}, { _id: false });

const vendorWorkforceEngineerSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  employeeId: { type: String, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  photo: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  role: { type: String, required: true },
  department: { type: String, default: 'Operations' },
  reportingManager: { type: String, default: '' },
  serviceCategoryCode: { type: String, required: true, index: true },
  serviceCategoryName: { type: String, default: '' },
  primarySkill: { type: String, default: '' },
  skills: [skillSchema],
  experienceYears: { type: Number, default: 0 },
  certificationLevel: { type: String, enum: ['trainee', 'junior', 'mid', 'senior', 'lead', 'expert'], default: 'mid' },
  assignedProjects: [{ name: String, projectCode: String }],
  todayTask: { type: String, default: '' },
  availability: {
    type: String,
    enum: ['available', 'busy', 'on_project', 'traveling', 'leave', 'offline'],
    default: 'available',
    index: true
  },
  currentLocation: { type: String, default: '' },
  city: { type: String, default: '' },
  gps: {
    lat: Number,
    lng: Number,
    lastSeen: Date,
    battery: { type: Number, default: 100 },
    internet: { type: String, enum: ['online', 'weak', 'offline'], default: 'online' }
  },
  attendanceStatus: {
    type: String,
    enum: ['checked_in', 'checked_out', 'on_break', 'absent', 'late'],
    default: 'checked_out'
  },
  kycStatus: { type: String, enum: ['pending', 'submitted', 'verified', 'rejected'], default: 'pending' },
  performanceScore: { type: Number, default: 80, min: 0, max: 100 },
  rating: { type: Number, default: 4.0, min: 0, max: 5 },
  walletBalance: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['active', 'suspended', 'deactivated', 'onboarding'],
    default: 'active',
    index: true
  },
  capacity: { type: Number, default: 100 },
  utilization: { type: Number, default: 0 },
  nextAvailableAt: Date,
  linkedEngineerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer',
    default: null,
    index: true
  },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorWorkforceEngineerSchema.pre('save', async function (next) {
  if (!this.employeeId) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `wf_eng_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.employeeId = `ENG-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('employeeId error:', err);
    }
  }
  next();
});

vendorWorkforceEngineerSchema.index({ vendorId: 1, status: 1, availability: 1 });
vendorWorkforceEngineerSchema.index({ vendorId: 1, serviceCategoryCode: 1 });
vendorWorkforceEngineerSchema.index(
  { vendorId: 1, linkedEngineerId: 1 },
  { unique: true, partialFilterExpression: { linkedEngineerId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('VendorWorkforceEngineer', vendorWorkforceEngineerSchema);
