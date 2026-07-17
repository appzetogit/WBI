const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const memberSchema = new mongoose.Schema({
  engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorWorkforceEngineer' },
  name: String,
  role: String,
  employeeId: String
}, { _id: false });

const vendorWorkforceTeamSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  teamCode: { type: String, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  teamType: { type: String, default: 'execution' },
  serviceCategoryCode: { type: String, required: true, index: true },
  serviceCategoryName: { type: String, default: '' },
  leaderName: { type: String, default: '' },
  leaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorWorkforceEngineer', default: null },
  members: [memberSchema],
  currentProjects: [{ name: String, projectCode: String }],
  location: { type: String, default: '' },
  city: { type: String, default: '' },
  capacity: { type: Number, default: 10 },
  utilization: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['active', 'idle', 'deployed', 'dissolved'],
    default: 'active',
    index: true
  },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorWorkforceTeamSchema.pre('save', async function (next) {
  if (!this.teamCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `wf_team_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.teamCode = `TEAM-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('teamCode error:', err);
    }
  }
  next();
});

vendorWorkforceTeamSchema.index({ vendorId: 1, status: 1 });

module.exports = mongoose.model('VendorWorkforceTeam', vendorWorkforceTeamSchema);
