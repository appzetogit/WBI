const mongoose = require('mongoose');

/**
 * A part needed for, or used on, a job — the Vendor Panel "Required Parts" and
 * "Used Parts" ledger.
 *
 *   required  → needed; stock may be short (shortfall is computed live)
 *   reserved  → held from the vendor's inventory for this job
 *   used      → consumed on the job (stock already deducted)
 *   cancelled → no longer needed; any reservation went back to stock
 *
 * A part may reference a vendor inventory item (stock is moved), a WBI parts
 * catalog entry (price/HSN), or neither (bought locally).
 */
const jobPartSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BJob', required: true, index: true },
  jobCode: { type: String, default: '' },
  engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer', default: null },
  engineerName: { type: String, default: '' },
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorResourceInventory', default: null },
  catalogPartId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorPartsCatalog', default: null },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  sku: { type: String, default: '' },
  hsnCode: { type: String, default: '' },
  unit: { type: String, default: 'pcs' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, default: 0, min: 0 },
  gstPercentage: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['required', 'reserved', 'used', 'cancelled'],
    default: 'required',
    index: true
  },
  note: { type: String, default: '', maxlength: 500 },
  cancelReason: { type: String, default: '' },
  requestedBy: { actorId: mongoose.Schema.Types.ObjectId, role: String },
  usedBy: { actorId: mongoose.Schema.Types.ObjectId, role: String },
  requiredAt: { type: Date, default: Date.now },
  reservedAt: { type: Date, default: null },
  usedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null }
}, { timestamps: true });

jobPartSchema.index({ vendorId: 1, status: 1, requiredAt: -1 });
jobPartSchema.index({ vendorId: 1, status: 1, usedAt: -1 });
jobPartSchema.index({ inventoryItemId: 1, status: 1 });

module.exports = mongoose.model('JobPart', jobPartSchema);
