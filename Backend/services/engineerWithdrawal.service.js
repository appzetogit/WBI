/**
 * Engineer / Freelancer withdrawal settlement.
 * Mirrors vendorWithdrawal.service.js but operates on Engineer.wallet
 * (balance -> pendingBalance -> withdrawnAmount) instead of VendorFinanceWallet.
 * No fake success — manual provider waits for admin UTR, razorpayx/cashfree call real APIs.
 */
const Engineer = require('../models/Engineer');
const Withdrawal = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const { getPayoutConfig, calculatePayoutFees } = require('./vendorPayoutConfig.service');
const { initiatePayout } = require('./payoutProvider.service');

const WITHDRAWAL_STATUS_LABEL = {
  requested: 'requested',
  paid: 'completed',
  rejected: 'rejected',
  failed: 'failed'
};

/** Payout email to the account holder. Never throws. */
function mailWithdrawal(withdrawal, status, reason) {
  try {
    const { emitAsync } = require('./notification/notificationOrchestrator.service');
    emitAsync('withdrawal_status_updated', {
      targets: { engineerId: withdrawal.engineerId },
      data: {
        withdrawalId: String(withdrawal._id),
        status,
        statusLabel: WITHDRAWAL_STATUS_LABEL[status] || status,
        amount: withdrawal.amount,
        fee: withdrawal.feeAmount || withdrawal.platformFeeAmount || undefined,
        netAmount: withdrawal.netAmount || undefined,
        accountMasked: withdrawal.bankDetails?.accountNumberMasked || undefined,
        utr: status === 'paid' ? withdrawal.transactionReference || undefined : undefined,
        reason
      }
    });
  } catch (err) {
    console.warn('[withdraw] email notify failed:', err.message);
  }
}

function emitEngineer(engineerId, event, payload = {}) {
  try {
    if (global.io) {
      global.io.to(`engineer:${engineerId}`).emit(event, payload);
    }
  } catch (err) {
    console.warn('[engineerWithdraw] socket emit failed:', err.message);
  }
}

async function notifyEngineerSafe(engineerId, payload) {
  try {
    const { notifyEngineer } = require('./engineerNotify.service');
    await notifyEngineer(engineerId, payload);
  } catch (_) {
    /* best-effort */
  }
}

/**
 * Release the pending hold back to the available balance (reject / failure).
 */
async function refundPendingHold(withdrawal, reason) {
  const engineer = await Engineer.findById(withdrawal.engineerId);
  if (!engineer) return;
  engineer.wallet.balance = (engineer.wallet.balance || 0) + withdrawal.amount;
  engineer.wallet.pendingBalance = Math.max(0, (engineer.wallet.pendingBalance || 0) - withdrawal.amount);
  await engineer.save();

  await Transaction.findOneAndUpdate(
    { referenceId: String(withdrawal._id), type: 'withdrawal' },
    {
      status: 'failed',
      description: reason || 'Withdrawal failed/rejected — hold released'
    }
  );
}

/**
 * Admin approve OR auto-process → call payout provider.
 */
async function processApprovedWithdrawal(withdrawalId, { adminId = null, actorType = 'admin', notes = '', transactionReference = '' } = {}) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw Object.assign(new Error('Withdrawal not found'), { status: 404 });
  if (withdrawal.source && withdrawal.source !== 'engineer' && withdrawal.source !== 'worker') {
    throw Object.assign(new Error('Not an engineer withdrawal'), { status: 400 });
  }
  if (!['pending', 'approved', 'failed', 'awaiting_manual_transfer', 'processing'].includes(withdrawal.status)) {
    throw Object.assign(new Error(`Cannot process withdrawal in status ${withdrawal.status}`), { status: 400 });
  }

  // Manual settle with UTR supplied directly (no second gateway call)
  const config = await getPayoutConfig();
  if (transactionReference && (config.payoutProvider === 'manual' || withdrawal.status === 'awaiting_manual_transfer')) {
    return markWithdrawalPaid(withdrawalId, {
      utr: transactionReference,
      adminId,
      notes: notes || 'Manual transfer recorded'
    });
  }

  const fees = calculatePayoutFees(withdrawal.amount, config);
  Object.assign(withdrawal, {
    tdsRate: fees.tdsRate,
    tdsAmount: fees.tdsAmount,
    platformFeeRate: fees.platformFeeRate,
    platformFeeAmount: fees.platformFeeAmount,
    gstOnFee: fees.gstOnFee,
    netAmount: fees.netAmount
  });

  withdrawal.status = 'processing';
  withdrawal.processedBy = adminId || undefined;
  withdrawal.processedDate = new Date();
  withdrawal.adminNotes = notes || withdrawal.adminNotes;
  withdrawal.pushEvent('processing', 'Payout initiated', { actorType, actorId: adminId });
  await withdrawal.save();

  const bankPlain = {
    accountHolderName: withdrawal.bankDetails?.accountHolderName,
    accountNumber: withdrawal.bankDetails?.accountNumber,
    ifscCode: withdrawal.bankDetails?.ifscCode,
    upiId: withdrawal.bankDetails?.upiId,
    bankName: withdrawal.bankDetails?.bankName
  };

  try {
    const result = await initiatePayout(withdrawal, bankPlain);
    withdrawal.gatewayProvider = result.provider;
    withdrawal.gatewayPayoutId = result.gatewayPayoutId || '';
    withdrawal.gatewayStatus = result.status || '';
    withdrawal.gatewayResponse = result.gatewayResponse || null;

    if (result.provider === 'manual' || result.status === 'awaiting_manual_transfer') {
      withdrawal.status = 'awaiting_manual_transfer';
      withdrawal.pushEvent('awaiting_manual_transfer', 'Waiting for admin bank transfer / UTR', { actorType });
      await withdrawal.save();
      emitEngineer(withdrawal.engineerId, 'wallet:withdrawalUpdated', {
        withdrawalId: withdrawal._id,
        status: withdrawal.status
      });
      return { withdrawal, providerResult: result };
    }

    if (['processed', 'paid', 'success', 'SUCCESS'].includes(String(result.status).toLowerCase())) {
      return markWithdrawalPaid(withdrawal._id, {
        utr: result.utr || result.gatewayPayoutId,
        adminId,
        notes: 'Gateway reported success'
      });
    }

    withdrawal.status = 'processing';
    withdrawal.pushEvent('processing', `Gateway status: ${result.status}`, { actorType: 'gateway' });
    await withdrawal.save();
    emitEngineer(withdrawal.engineerId, 'wallet:withdrawalUpdated', {
      withdrawalId: withdrawal._id,
      status: withdrawal.status
    });
    return { withdrawal, providerResult: result };
  } catch (error) {
    withdrawal.status = 'failed';
    withdrawal.failedAt = new Date();
    withdrawal.failureReason = error.message;
    withdrawal.retryCount = (withdrawal.retryCount || 0) + 1;
    withdrawal.pushEvent('failed', error.message, { actorType: 'gateway' });
    await withdrawal.save();
    await refundPendingHold(withdrawal, error.message);
    mailWithdrawal(withdrawal, 'failed', "The bank transfer could not be completed. The amount has been returned to your wallet; please check your bank details or try again.");
    emitEngineer(withdrawal.engineerId, 'wallet:withdrawalFailed', {
      withdrawalId: withdrawal._id,
      reason: error.message
    });
    throw error;
  }
}

async function markWithdrawalPaid(withdrawalId, { utr, adminId = null, notes = '' } = {}) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw Object.assign(new Error('Withdrawal not found'), { status: 404 });
  if (withdrawal.status === 'paid') return { withdrawal, duplicate: true };

  const engineer = await Engineer.findById(withdrawal.engineerId);
  if (!engineer) throw Object.assign(new Error('Engineer not found'), { status: 404 });

  engineer.wallet.pendingBalance = Math.max(0, (engineer.wallet.pendingBalance || 0) - withdrawal.amount);
  engineer.wallet.withdrawnAmount = (engineer.wallet.withdrawnAmount || 0) + withdrawal.amount;
  await engineer.save();

  withdrawal.status = 'paid';
  withdrawal.paidAt = new Date();
  withdrawal.processedDate = withdrawal.processedDate || new Date();
  withdrawal.processedBy = adminId || withdrawal.processedBy;
  withdrawal.transactionReference = utr || withdrawal.transactionReference || withdrawal.gatewayPayoutId;
  if (notes) withdrawal.adminNotes = notes;
  withdrawal.pushEvent('paid', `Settled. UTR: ${withdrawal.transactionReference || 'N/A'}`, {
    actorType: adminId ? 'admin' : 'gateway',
    actorId: adminId
  });
  await withdrawal.save();

  await Transaction.findOneAndUpdate(
    { referenceId: String(withdrawal._id), type: 'withdrawal' },
    {
      status: 'completed',
      description: `Withdrawal paid. UTR: ${withdrawal.transactionReference || 'N/A'}`
    }
  );

  await notifyEngineerSafe(withdrawal.engineerId, {
    type: 'payout_processed',
    category: 'payments',
    title: 'Withdrawal completed',
    message: `₹${(withdrawal.netAmount || withdrawal.amount).toLocaleString('en-IN')} transferred. UTR: ${withdrawal.transactionReference || '—'}`,
    relatedId: withdrawal._id,
    relatedType: 'withdrawal',
    data: { utr: withdrawal.transactionReference || '' }
  });

  emitEngineer(withdrawal.engineerId, 'wallet:updated', {
    availableBalance: engineer.wallet.balance,
    pendingWithdrawal: engineer.wallet.pendingBalance,
    message: `Withdrawal of ₹${withdrawal.amount} completed`
  });
  mailWithdrawal(withdrawal, 'paid');
  emitEngineer(withdrawal.engineerId, 'wallet:withdrawalPaid', {
    withdrawalId: withdrawal._id,
    utr: withdrawal.transactionReference
  });

  return { withdrawal, duplicate: false };
}

async function rejectWithdrawal(withdrawalId, { adminId, reason } = {}) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw Object.assign(new Error('Withdrawal not found'), { status: 404 });
  if (['paid', 'cancelled', 'rejected'].includes(withdrawal.status)) {
    throw Object.assign(new Error('Withdrawal already finalized'), { status: 400 });
  }

  await refundPendingHold(withdrawal, reason || 'Rejected by admin');

  withdrawal.status = 'rejected';
  withdrawal.rejectionReason = reason || 'Rejected by admin';
  withdrawal.processedBy = adminId;
  withdrawal.processedDate = new Date();
  withdrawal.pushEvent('rejected', reason || 'Rejected by admin', { actorType: 'admin', actorId: adminId });
  await withdrawal.save();

  const engineer = await Engineer.findById(withdrawal.engineerId).select('wallet');

  await notifyEngineerSafe(withdrawal.engineerId, {
    type: 'general',
    category: 'payments',
    title: 'Withdrawal rejected',
    message: `Your withdrawal of ₹${withdrawal.amount.toLocaleString('en-IN')} was rejected: ${withdrawal.rejectionReason}`,
    relatedId: withdrawal._id,
    relatedType: 'withdrawal',
    data: {}
  });

  emitEngineer(withdrawal.engineerId, 'wallet:updated', {
    availableBalance: engineer?.wallet?.balance || 0,
    pendingWithdrawal: engineer?.wallet?.pendingBalance || 0,
    message: `Withdrawal of ₹${withdrawal.amount} rejected — refunded`
  });
  mailWithdrawal(withdrawal, 'rejected', withdrawal.rejectionReason);
  emitEngineer(withdrawal.engineerId, 'wallet:withdrawalRejected', { withdrawalId });

  return withdrawal;
}

async function retryWithdrawal(withdrawalId, { adminId } = {}) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw Object.assign(new Error('Withdrawal not found'), { status: 404 });
  if (withdrawal.status !== 'failed') {
    throw Object.assign(new Error('Only failed withdrawals can be retried'), { status: 400 });
  }

  const engineer = await Engineer.findById(withdrawal.engineerId);
  if (!engineer || (engineer.wallet.balance || 0) < withdrawal.amount) {
    throw Object.assign(new Error('Insufficient balance to retry'), { status: 400 });
  }
  engineer.wallet.balance -= withdrawal.amount;
  engineer.wallet.pendingBalance = (engineer.wallet.pendingBalance || 0) + withdrawal.amount;
  await engineer.save();

  withdrawal.status = 'pending';
  withdrawal.failureReason = '';
  withdrawal.pushEvent('pending', 'Retry queued', { actorType: 'admin', actorId: adminId });
  await withdrawal.save();

  return processApprovedWithdrawal(withdrawalId, { adminId, actorType: 'admin', notes: 'Retry payout' });
}

module.exports = {
  processApprovedWithdrawal,
  markWithdrawalPaid,
  rejectWithdrawal,
  retryWithdrawal
};
