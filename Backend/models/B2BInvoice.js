const mongoose = require('mongoose');

const b2bInvoiceSchema = new mongoose.Schema({
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BCompany', 
    required: true 
  },
  // Legacy / compatibility support for unique invoiceId
  invoiceId: { 
    type: String, 
    required: true, 
    unique: true,
    default: function() { return this.invoiceNumber || 'INV-' + Date.now(); }
  },
  invoiceNumber: { 
    type: String,
    required: true,
    unique: true
  },
  invoiceType: { 
    type: String,
    enum: ['topup', 'deduction', 'monthly'],
    default: 'monthly'
  },
  // Legacy / compatibility support
  billingPeriod: { 
    type: String 
  },
  billingPeriodStart: { 
    type: Date 
  },
  billingPeriodEnd: { 
    type: Date 
  },
  invoiceDate: { 
    type: Date, 
    default: Date.now 
  },
  dueDate: { 
    type: Date 
  },
  totalJobs: { 
    type: Number, 
    default: 0 
  },
  completedJobIds: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BJob' 
  }],
  perJobCharge: { 
    type: Number, 
    default: 0 
  },
  platformFee: { 
    type: Number, 
    default: 0 
  },
  subtotal: { 
    type: Number, 
    default: 0 
  },
  gstPercent: { 
    type: Number, 
    default: 18 
  },
  gstAmount: { 
    type: Number,
    default: 0
  },
  totalAmount: { 
    type: Number,
    default: 0
  },
  // Compatibility: alias totalAmount to amount if not explicitly provided
  amount: {
    type: Number,
    required: true,
    default: function() { return this.totalAmount || 0; }
  },
  paidAmount: { 
    type: Number, 
    default: 0 
  },
  status: { 
    type: String, 
    enum: ['draft', 'generated', 'paid', 'pending', 'overdue', 'cancelled', 'Settled'], // include 'Settled' for backward compatibility
    default: 'generated' 
  },
  paymentStatus: { 
    type: String, 
    enum: ['unpaid', 'paid', 'partial', 'failed'], 
    default: 'unpaid' 
  },
  paymentDate: { 
    type: Date 
  },
  transactionId: { 
    type: String 
  },
  paymentMethod: { 
    type: String 
  },
  razorpayPaymentId: { 
    type: String 
  },
  invoicePdfUrl: { 
    type: String 
  },
  // Legacy support for fileUrl
  fileUrl: {
    type: String,
    default: function() { return this.invoicePdfUrl || ''; }
  },
  companySnapshot: {
    companyName: { type: String },
    gstNumber: { type: String },
    billingAddress: { type: String },
    email: { type: String },
    phone: { type: String }
  },
  // Legacy support
  date: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true 
});

// Configure Pre-Save hooks to ensure aliases align
b2bInvoiceSchema.pre('save', function(next) {
  if (this.totalAmount && !this.amount) {
    this.amount = this.totalAmount;
  }
  if (this.amount && !this.totalAmount) {
    this.totalAmount = this.amount;
  }
  if (this.invoicePdfUrl && !this.fileUrl) {
    this.fileUrl = this.invoicePdfUrl;
  }
  if (this.fileUrl && !this.invoicePdfUrl) {
    this.invoicePdfUrl = this.fileUrl;
  }
  if (this.invoiceDate && !this.date) {
    this.date = this.invoiceDate;
  }
  next();
});

// Create Mongoose indexes for rapid query performance

b2bInvoiceSchema.index({ status: 1 });
b2bInvoiceSchema.index({ invoiceDate: 1 });
b2bInvoiceSchema.index({ billingPeriodStart: 1 });

module.exports = mongoose.model('B2BInvoice', b2bInvoiceSchema);
