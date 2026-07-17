const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorResourceToolSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  toolCode: { type: String, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, default: 'General' },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  serialNumber: { type: String, default: '' },
  assignedEngineer: { type: String, default: '' },
  assignedEngineerId: { type: String, default: '' },
  assignedProject: { type: String, default: '' },
  condition: { type: String, enum: ['excellent', 'good', 'fair', 'poor'], default: 'good' },
  purchaseDate: Date,
  warrantyExpiry: Date,
  calibrationDate: Date,
  lastInspection: Date,
  status: {
    type: String,
    enum: ['available', 'assigned', 'maintenance', 'lost', 'damaged'],
    default: 'available',
    index: true
  },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorResourceToolSchema.pre('save', async function (next) {
  if (!this.toolCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `res_tool_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.toolCode = `TOOL-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('toolCode error:', err);
    }
  }
  next();
});

vendorResourceToolSchema.index({ vendorId: 1, status: 1 });

module.exports = mongoose.model('VendorResourceTool', vendorResourceToolSchema);
