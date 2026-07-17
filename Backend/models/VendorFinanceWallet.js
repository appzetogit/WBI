const mongoose = require('mongoose');

const vendorFinanceWalletSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, unique: true, index: true },
  currency: { type: String, default: 'INR' },
  availableBalance: { type: Number, default: 0 },
  escrowBalance: { type: Number, default: 0 },
  pendingSettlement: { type: Number, default: 0 },
  processingWithdrawal: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
  commissionDeducted: { type: Number, default: 0 },
  refundAmount: { type: Number, default: 0 },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

module.exports = mongoose.model('VendorFinanceWallet', vendorFinanceWalletSchema);
