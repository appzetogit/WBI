const walletLedger = require('../../services/b2bWalletLedger.service');
const B2BWallet = require('../../models/B2BWallet');
const B2BWalletTransaction = require('../../models/B2BWalletTransaction');
const B2BDeductionRule = require('../../models/B2BDeductionRule');

/** The signed-in actor, whatever the auth middleware called the field. */
const actorId = (req) => req.user?._id || req.user?.id || null;

/**
 * GET list of B2B wallets (Admin)
 */
const getB2BWalletsList = async (req, res) => {
  try {
    const wallets = await B2BWallet.find().populate('companyId', 'companyName email phone verificationStatus accountStatus').sort({ updatedAt: -1 });
    res.status(200).json({ success: true, data: wallets });
  } catch (error) {
    console.error('Admin Get Wallets Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch B2B wallets list' });
  }
};

/**
 * GET B2B wallet by company ID (Admin)
 */
const getB2BWalletByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const wallet = await B2BWallet.findOne({ companyId }).populate('companyId', 'companyName email phone verificationStatus');
    if (!wallet) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }
    const transactions = await B2BWalletTransaction.find({ companyId })
      .sort({ createdAt: -1 });
      
    res.status(200).json({ success: true, data: { wallet, transactions } });
  } catch (error) {
    console.error('Admin Get Wallet By Company Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve wallet details' });
  }
};

/**
 * PATCH update deduction rules (Admin)
 */
const updateDeductionRule = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { perJobCharge, gstPercent, autoDeductionEnabled } = req.body;

    // 1. Update deduction rule
    let rule = await B2BDeductionRule.findOne({ companyId, isActive: true });
    if (!rule) {
      rule = new B2BDeductionRule({ companyId, isActive: true });
    }
    if (perJobCharge !== undefined) rule.perJobCharge = perJobCharge;
    if (gstPercent !== undefined) rule.gstPercent = gstPercent;
    rule.updatedBy = 'Admin';
    await rule.save();

    // 2. Update wallet properties
    let wallet = await B2BWallet.findOne({ companyId });
    if (!wallet) {
      wallet = await B2BWallet.create({ companyId, balance: 0 });
    }
    if (autoDeductionEnabled !== undefined) {
      wallet.autoDeductionEnabled = autoDeductionEnabled;
    }
    wallet.deductionRuleId = rule._id;
    await wallet.save();

    res.status(200).json({
      success: true,
      message: 'Deduction rules updated successfully',
      rule,
      wallet
    });
  } catch (error) {
    console.error('Admin Update Deduction Rule Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update deduction rules' });
  }
};

/**
 * POST insert adjustments (Admin)
 */
const createAdjustment = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { amount, remark } = req.body;

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum === 0) {
      return res.status(400).json({ success: false, message: 'Invalid adjustment amount' });
    }

    // The ledger moves the balance and writes the row in one transaction.
    let posted;
    try {
      posted = await walletLedger.adjust({
        companyId,
        amount: amountNum,
        reason: remark || 'Admin balance adjustment',
        actor: { actorId: actorId(req) || null, role: 'admin', name: req.user?.name || '' }
      });
    } catch (err) {
      if (err.name === 'WalletError') {
        return res.status(err.status || 400).json({ success: false, message: err.message, code: err.code, ...err.details });
      }
      throw err;
    }

    const wallet = await B2BWallet.findOne({ companyId });
    res.status(200).json({
      success: true,
      message: 'Balance adjustment completed',
      wallet,
      txn: posted.transaction,
      balance: posted.balance
    });
  } catch (error) {
    console.error('Admin Create Adjustment Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create adjustment log' });
  }
};

/**
 * POST Process Refund (Admin)
 * If jobId is provided and escrow is held, refund from escrowBalance (not invented money).
 */
const processRefund = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { amount, remark, jobId } = req.body;

    if (jobId) {
      const { refundB2BJobEscrow } = require('../../services/escrowReleaseEngine.service');
      const result = await refundB2BJobEscrow({
        jobId,
        reason: remark || 'admin_escrow_refund'
      });
      if (!result.ok && !result.alreadyRefunded) {
        return res.status(400).json({
          success: false,
          message: result.reason === 'no_held_ledger'
            ? 'No held escrow found for this job'
            : `Escrow refund failed: ${result.reason}`
        });
      }
      const wallet = await B2BWallet.findOne({ companyId });
      return res.status(200).json({
        success: true,
        message: result.alreadyRefunded
          ? 'Escrow already refunded for this job'
          : `Escrow of ₹${result.amount} refunded to company wallet`,
        wallet,
        escrowRefund: result
      });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid refund amount' });
    }

    const existingWallet = await B2BWallet.findOne({ companyId });
    if (!existingWallet) {
      return res.status(404).json({ success: false, message: 'Company wallet does not exist' });
    }

    const posted = await walletLedger.refund({
      companyId,
      amount: amountNum,
      remark: remark || 'B2B partner wallet refund credit',
      actor: { actorId: actorId(req) || null, role: 'admin', name: req.user?.name || '' }
    });

    const wallet = await B2BWallet.findOne({ companyId });
    res.status(200).json({
      success: true,
      message: 'Refund successfully credited to wallet',
      wallet,
      txn: posted.transaction,
      balance: posted.balance
    });
  } catch (error) {
    console.error('Admin Process Refund Error:', error);
    res.status(500).json({ success: false, message: 'Failed to execute refund transaction' });
  }
};

/**
 * GET wallet reconciliation (Admin)
 * Recomputes both balances from the ledger and reports any drift.
 */
const reconcileWallet = async (req, res) => {
  try {
    const { companyId } = req.params;
    const report = await walletLedger.reconcile(companyId);
    res.status(200).json({ success: true, data: report });
  } catch (error) {
    console.error('Admin Wallet Reconcile Error:', error);
    res.status(500).json({ success: false, message: 'Failed to reconcile wallet' });
  }
};

/**
 * POST reverse a wallet transaction (Admin)
 * Posts the exact inverse; the original row is kept and marked reversed.
 */
const reverseTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason } = req.body;
    const posted = await walletLedger.reverse({
      transactionId,
      reason,
      actor: { actorId: actorId(req) || null, role: 'admin', name: req.user?.name || '' }
    });
    res.status(200).json({
      success: true,
      message: 'Transaction reversed',
      txn: posted.transaction,
      balance: posted.balance
    });
  } catch (error) {
    if (error.name === 'WalletError') {
      return res.status(error.status || 400).json({
        success: false,
        message: error.message,
        code: error.code,
        ...error.details
      });
    }
    console.error('Admin Wallet Reverse Error:', error);
    res.status(500).json({ success: false, message: 'Failed to reverse transaction' });
  }
};

module.exports = {
  getB2BWalletsList,
  getB2BWalletByCompany,
  updateDeductionRule,
  createAdjustment,
  processRefund,
  reconcileWallet,
  reverseTransaction
};
