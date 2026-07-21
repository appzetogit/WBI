const mongoose = require('mongoose');

const b2bCreditProfileSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'B2BCompany',
      required: true,
      unique: true,
      index: true
    },
    requestedLimit: { type: Number, default: 0 },
    approvedLimit: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    paymentTermsDays: { type: Number, default: 30 },
    billingCycle: { type: String, default: 'monthly' },
    gstBillingEnabled: { type: Boolean, default: true },
    invoicePreferences: { type: mongoose.Schema.Types.Mixed, default: {} },
    purchaseOrderRules: { type: mongoose.Schema.Types.Mixed, default: {} },
    escrowRequired: { type: Boolean, default: true },
    retentionPercent: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'approved', 'rejected', 'suspended'],
      default: 'draft',
      index: true
    },
    financeReviewNote: { type: String, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('B2BCreditProfile', b2bCreditProfileSchema);
