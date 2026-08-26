const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorResourceInventorySchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  sku: { type: String, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true },
  serviceCategoryCode: { type: String, required: true, index: true },
  serviceCategoryName: { type: String, default: '' },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorResourceWarehouse', default: null },
  warehouseName: { type: String, default: '' },
  barcode: { type: String, default: '' },
  batchNumber: { type: String, default: '' },
  serialNumber: { type: String, default: '' },
  quantity: { type: Number, default: 0 },
  reservedQty: { type: Number, default: 0 },
  allocatedQty: { type: Number, default: 0 },
  reorderLevel: { type: Number, default: 10 },
  unitCost: { type: Number, default: 0 },
  unit: { type: String, default: 'pcs' },
  stockStatus: {
    type: String,
    enum: ['in_stock', 'low_stock', 'reserved', 'allocated', 'damaged', 'out_of_stock'],
    default: 'in_stock',
    index: true
  },
  lastMovement: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorResourceInventorySchema.pre('save', async function (next) {
  if (!this.sku) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `res_sku_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.sku = `SKU-${year}-${String(counter.seq).padStart(5, '0')}`;
    } catch (err) {
      console.error('sku error:', err);
    }
  }
  if (this.stockStatus !== 'damaged' && this.stockStatus !== 'reserved' && this.stockStatus !== 'allocated') {
    if (this.quantity <= 0) this.stockStatus = 'out_of_stock';
    else if (this.quantity <= this.reorderLevel) this.stockStatus = 'low_stock';
    else this.stockStatus = 'in_stock';
  }
  next();
});

vendorResourceInventorySchema.index({ vendorId: 1, serviceCategoryCode: 1 });
vendorResourceInventorySchema.index({ vendorId: 1, stockStatus: 1 });

module.exports = mongoose.model('VendorResourceInventory', vendorResourceInventorySchema);
