const mongoose = require('mongoose');

/**
 * Append-only log of every stock change made through the Parts section
 * (restock, correction, damage, reserve for a job, release, use on a job).
 */
const vendorStockMovementSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorResourceInventory', required: true, index: true },
  itemName: { type: String, default: '' },
  type: {
    type: String,
    enum: ['create', 'restock', 'correction', 'damaged', 'reserve', 'release', 'use'],
    required: true
  },
  /** Change in free stock (negative = out). */
  quantityDelta: { type: Number, default: 0 },
  /** Change in stock reserved for jobs. */
  reservedDelta: { type: Number, default: 0 },
  balanceAfter: { type: Number, default: null },
  reservedAfter: { type: Number, default: null },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BJob', default: null },
  jobCode: { type: String, default: '' },
  jobPartId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPart', default: null },
  note: { type: String, default: '' },
  actor: { actorId: mongoose.Schema.Types.ObjectId, role: String }
}, { timestamps: { createdAt: true, updatedAt: false } });

vendorStockMovementSchema.index({ vendorId: 1, createdAt: -1 });

module.exports = mongoose.model('VendorStockMovement', vendorStockMovementSchema);
