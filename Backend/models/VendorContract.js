const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorContractSchema = new mongoose.Schema({
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
  contractCode: {
    type: String,
    unique: true,
    index: true
  },
  title: { type: String, required: true, trim: true },
  value: { type: Number, default: 0 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  renewalDate: { type: Date, default: null },
  warrantyMonths: { type: Number, default: 12 },
  amc: {
    enabled: { type: Boolean, default: false },
    annualValue: { type: Number, default: 0 },
    nextDue: { type: Date, default: null }
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'expired', 'terminated', 'pending_signature'],
    default: 'draft',
    index: true
  },
  signatures: [{
    party: { type: String, enum: ['vendor', 'client'], required: true },
    name: String,
    signedAt: Date,
    method: { type: String, default: 'digital' }
  }],
  serviceCategoryCode: { type: String, default: '' },
  serviceCategoryName: { type: String, default: '' },
  version: { type: Number, default: 1 },
  notes: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorContractSchema.pre('save', async function (next) {
  if (!this.contractCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `contract_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.contractCode = `CNT-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('Error generating contractCode:', err);
    }
  }
  next();
});

vendorContractSchema.index({ vendorId: 1, status: 1, createdAt: -1 });
vendorContractSchema.index({ vendorId: 1, clientId: 1 });

module.exports = mongoose.model('VendorContract', vendorContractSchema);
