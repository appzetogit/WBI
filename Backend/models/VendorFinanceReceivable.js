const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorFinanceReceivableSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  receivableCode: { type: String, unique: true, index: true },
  clientType: { type: String, enum: ['individual', 'b2b'], required: true, index: true },
  clientName: { type: String, required: true },
  projectName: { type: String, default: '' },
  projectCode: { type: String, default: '' },
  contractCode: { type: String, default: '' },
  poNumber: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  amount: { type: Number, required: true, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  dueDate: { type: Date, required: true, index: true },
  paymentMethod: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'overdue', 'cancelled'],
    default: 'pending',
    index: true
  },
  lastReminderAt: Date,
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorFinanceReceivableSchema.virtual('remainingAmount').get(function () {
  return Math.max(0, this.amount - this.paidAmount);
});

vendorFinanceReceivableSchema.pre('save', async function (next) {
  if (!this.receivableCode) {
    try {
      const year = new Date().getFullYear();
      const c = await Counter.findByIdAndUpdate(`fin_recv_${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
      this.receivableCode = `REC-${year}-${String(c.seq).padStart(5, '0')}`;
    } catch (error) {
      console.error('receivableCode error:', error);
    }
  }
  if (this.status !== 'cancelled') {
    if (this.paidAmount >= this.amount) this.status = 'paid';
    else if (this.paidAmount > 0) this.status = 'partial';
    else if (this.dueDate < new Date()) this.status = 'overdue';
  }
  next();
});

vendorFinanceReceivableSchema.set('toJSON', { virtuals: true });
vendorFinanceReceivableSchema.index({ vendorId: 1, clientType: 1, status: 1 });

module.exports = mongoose.model('VendorFinanceReceivable', vendorFinanceReceivableSchema);
