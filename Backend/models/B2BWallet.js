const mongoose = require('mongoose');

/**
 * Company wallet. `balance` is the AVAILABLE balance and `escrowBalance` the
 * RESERVED balance; both are written only by services/b2bWalletLedger.service.js,
 * which writes a B2BWalletTransaction row for every change.
 */
const b2bWalletSchema = new mongoose.Schema({
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BCompany', 
    required: true, 
    unique: true 
  },
  balance: { 
    type: Number, 
    default: 0 
  },
  escrowBalance: {
    type: Number,
    default: 0
  },
  totalTopup: { 
    type: Number, 
    default: 0 
  },
  totalSpent: { 
    type: Number, 
    default: 0 
  },
  pendingDeductions: { 
    type: Number, 
    default: 0 
  },
  /** Spend allowed beyond the available balance (from B2BCreditProfile). */
  creditLimit: {
    type: Number,
    default: 0
  },
  /** Ledger sequence of the last applied transaction — detects gaps. */
  ledgerSequence: {
    type: Number,
    default: 0
  },
  /**
   * The balance this wallet already held when its first ledger row was
   * written. Reconciliation counts it, so money that predates the ledger is
   * stated as an opening balance instead of showing up as unexplained drift.
   */
  openingBalance: { type: Number, default: 0 },
  openingReserved: { type: Number, default: 0 },
  openingBalanceAt: { type: Date, default: null },
  currency: { 
    type: String, 
    default: 'INR' 
  },
  autoDeductionEnabled: { 
    type: Boolean, 
    default: true 
  },
  deductionRuleId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BDeductionRule' 
  },
  lastUpdatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('B2BWallet', b2bWalletSchema);
