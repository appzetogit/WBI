const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorResourceWarehouseSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  warehouseCode: { type: String, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  address: { type: String, default: '' },
  manager: { type: String, default: '' },
  contact: { type: String, default: '' },
  capacityUnits: { type: Number, default: 1000 },
  currentStockUnits: { type: Number, default: 0 },
  stockValue: { type: Number, default: 0 },
  lowStockCount: { type: Number, default: 0 },
  reservedCount: { type: Number, default: 0 },
  incomingCount: { type: Number, default: 0 },
  outgoingCount: { type: Number, default: 0 },
  damagedCount: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'inactive', 'full'], default: 'active', index: true },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorResourceWarehouseSchema.pre('save', async function (next) {
  if (!this.warehouseCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `res_wh_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.warehouseCode = `WH-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('warehouseCode error:', err);
    }
  }
  next();
});

vendorResourceWarehouseSchema.index({ vendorId: 1, status: 1 });

module.exports = mongoose.model('VendorResourceWarehouse', vendorResourceWarehouseSchema);
