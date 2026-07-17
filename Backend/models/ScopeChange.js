const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const scopeChangeSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorClient',
    required: true,
    index: true
  },
  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorContract',
    default: null
  },
  changeCode: {
    type: String,
    unique: true,
    index: true
  },
  title: { type: String, required: true, trim: true },
  previousScope: { type: String, required: true },
  updatedScope: { type: String, required: true },
  costDelta: { type: Number, default: 0 },
  timelineDeltaDays: { type: Number, default: 0 },
  requestedBy: { type: String, default: 'Client' },
  approvedBy: { type: String, default: null },
  reason: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  attachments: [{
    name: String,
    url: String
  }],
  decidedAt: { type: Date, default: null },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

scopeChangeSchema.pre('save', async function (next) {
  if (!this.changeCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `scope_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.changeCode = `SC-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('Error generating changeCode:', err);
    }
  }
  next();
});

scopeChangeSchema.index({ vendorId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ScopeChange', scopeChangeSchema);
