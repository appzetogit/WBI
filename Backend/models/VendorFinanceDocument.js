const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const lineItemSchema = new mongoose.Schema({
  description: String,
  category: { type: String, default: 'service' },
  quantity: { type: Number, default: 1 },
  rate: { type: Number, default: 0 },
  amount: { type: Number, default: 0 }
}, { _id: false });

const vendorFinanceDocumentSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  documentCode: { type: String, unique: true, index: true },
  documentType: { type: String, enum: ['quotation', 'invoice'], required: true, index: true },
  invoiceType: {
    type: String,
    enum: ['advance', 'milestone', 'final', 'tax', 'credit_note', 'debit_note', 'not_applicable'],
    default: 'not_applicable'
  },
  clientName: { type: String, required: true },
  clientType: { type: String, enum: ['individual', 'b2b'], default: 'individual' },
  projectName: { type: String, default: '' },
  projectCode: { type: String, default: '' },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  scope: { type: String, default: '' },
  items: [lineItemSchema],
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  taxRate: { type: Number, default: 18 },
  taxAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  gstNumber: { type: String, default: '' },
  validUntil: Date,
  dueDate: Date,
  status: {
    type: String,
    enum: ['draft', 'sent', 'negotiation', 'approved', 'rejected', 'expired', 'issued', 'partial', 'paid', 'overdue', 'cancelled'],
    default: 'draft',
    index: true
  },
  convertedToProject: { type: Boolean, default: false },
  paymentEligible: { type: Boolean, default: false },
  paidAmount: { type: Number, default: 0 },
  paidAt: Date,
  razorpayOrderId: { type: String, default: '' },
  razorpayPaymentId: { type: String, default: '' },
  paymentIdempotencyKey: { type: String, default: '' },
  escrowReleased: { type: Boolean, default: false },
  commissionAmount: { type: Number, default: 0 },
  tdsAmount: { type: Number, default: 0 },
  netSettledAmount: { type: Number, default: 0 },
  sourceProposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProposal', default: null, index: true },
  sourceMilestoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorFinanceMilestone', default: null, index: true },
  sourceContractId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorContract', default: null, index: true },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorFinanceDocumentSchema.pre('save', async function (next) {
  if (!this.documentCode) {
    try {
      const year = new Date().getFullYear();
      const prefix = this.documentType === 'invoice' ? 'INV' : 'QT';
      const c = await Counter.findByIdAndUpdate(`fin_${prefix}_${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
      this.documentCode = `${prefix}-${year}-${String(c.seq).padStart(5, '0')}`;
    } catch (error) {
      console.error('documentCode error:', error);
    }
  }
  if (this.items?.length) {
    this.items.forEach((item) => { item.amount = item.quantity * item.rate; });
    this.subtotal = this.items.reduce((sum, item) => sum + item.amount, 0);
    const taxable = Math.max(0, this.subtotal - this.discount);
    this.taxAmount = Math.round(taxable * (this.taxRate / 100));
    this.total = taxable + this.taxAmount;
  }
  next();
});

vendorFinanceDocumentSchema.index({ vendorId: 1, documentType: 1, status: 1 });

module.exports = mongoose.model('VendorFinanceDocument', vendorFinanceDocumentSchema);
