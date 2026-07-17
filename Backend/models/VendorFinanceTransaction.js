const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorFinanceTransactionSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  transactionCode: { type: String, unique: true, index: true },
  type: {
    type: String,
    enum: ['credit', 'debit', 'escrow_hold', 'escrow_release', 'refund', 'commission', 'withdrawal'],
    required: true,
    index: true
  },
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
  projectCode: { type: String, default: '' },
  referenceCode: { type: String, default: '' },
  balanceAfter: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'completed', index: true },
  occurredAt: { type: Date, default: Date.now, index: true },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorFinanceTransactionSchema.pre('save', async function (next) {
  if (!this.transactionCode) {
    try {
      const year = new Date().getFullYear();
      const c = await Counter.findByIdAndUpdate(`fin_txn_${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
      this.transactionCode = `TXN-${year}-${String(c.seq).padStart(6, '0')}`;
    } catch (error) {
      console.error('transactionCode error:', error);
    }
  }
  next();
});

vendorFinanceTransactionSchema.index({ vendorId: 1, occurredAt: -1 });

module.exports = mongoose.model('VendorFinanceTransaction', vendorFinanceTransactionSchema);
