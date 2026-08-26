const mongoose = require('mongoose');
const Withdrawal = require('../models/Withdrawal');
const VendorBank = require('../models/VendorBank');
const Vendor = require('../models/Vendor');
const VendorFinanceWallet = require('../models/VendorFinanceWallet');
const VendorFinanceTransaction = require('../models/VendorFinanceTransaction');
const ServiceRequest = require('../models/ServiceRequest');
const { encrypt, decrypt, maskAccountNumber } = require('../utils/encryption');
const { storeOTP, verifyOTP, checkRateLimit, generateOTP, hashOTP } = require('../utils/redisOtp.util');
const { sendSMS } = require('./smsService');
const { createNotification } = require('../controllers/notificationControllers/notificationController');
const { getPayoutConfig, calculatePayoutFees } = require('./vendorPayoutConfig.service');
const { initiatePayout } = require('./payoutProvider.service');
const cgpeService = require('./cgpeService');

function emitFinance(vendorId, event, payload = {}) {
  try {
    const lifecycle = require('./vendorFinanceLifecycle.service');
    if (typeof lifecycle.emitFinance === 'function') {
      lifecycle.emitFinance(vendorId, event, payload);
    }
  } catch (err) {
    console.warn('[withdraw] emitFinance failed:', err.message);
  }
}

async function getEscrowHeldFromServiceRequests(vendorId) {
  const rows = await ServiceRequest.aggregate([
    {
      $match: {
        assignedVendorId: new mongoose.Types.ObjectId(vendorId),
        'payment.status': 'paid',
        'payment.escrowStatus': 'held'
      }
    },
    { $group: { _id: null, amount: { $sum: '$payment.amount' }, count: { $sum: 1 } } }
  ]);
  return {
    amount: rows[0]?.amount || 0,
    count: rows[0]?.count || 0
  };
}

async function getWithdrawEligibility(vendorId) {
  const config = await getPayoutConfig();
  const wallet = await VendorFinanceWallet.findOneAndUpdate(
    { vendorId },
    { $setOnInsert: { vendorId } },
    { new: true, upsert: true }
  ).lean();
  const srEscrow = await getEscrowHeldFromServiceRequests(vendorId);
  const banks = await VendorBank.find({ vendorId }).sort({ isPrimary: -1, updatedAt: -1 }).lean();
  const verifiedBanks = banks.filter((b) => b.verificationStatus === 'verified');
  const vendor = await Vendor.findById(vendorId).select('phone email name kycStatus isVerified').lean();

  const availableBalance = Number(wallet?.availableBalance) || 0;
  const financeEscrow = Number(wallet?.escrowBalance) || 0;
  const escrowBalance = financeEscrow + srEscrow.amount;

  return {
    config: {
      withdrawalEnabled: config.withdrawalEnabled,
      minWithdrawalAmount: config.minWithdrawalAmount,
      maxWithdrawalAmount: config.maxWithdrawalAmount,
      dailyWithdrawalLimit: config.dailyWithdrawalLimit,
      autoApproveMaxAmount: config.autoApproveMaxAmount,
      requireOtp: config.requireOtp,
      requireVerifiedBank: config.requireVerifiedBank,
      allowUpi: config.allowUpi,
      allowBankTransfer: config.allowBankTransfer,
      settlementSchedule: config.settlementSchedule,
      payoutProvider: config.payoutProvider,
      tdsPercentage: config.tdsPercentage,
      platformFeePercentage: config.platformFeePercentage,
      gstOnPlatformFee: config.gstOnPlatformFee
    },
    balances: {
      availableBalance,
      escrowBalance,
      financeEscrowBalance: financeEscrow,
      serviceRequestEscrow: srEscrow.amount,
      serviceRequestEscrowCount: srEscrow.count,
      pendingSettlement: Number(wallet?.pendingSettlement) || 0,
      processingWithdrawal: Number(wallet?.processingWithdrawal) || 0,
      totalWithdrawn: Number(wallet?.totalWithdrawn) || 0
    },
    kyc: {
      phone: vendor?.phone || null,
      isPhonePresent: Boolean(vendor?.phone),
      vendorVerified: vendor?.isVerified === true || vendor?.kycStatus === 'verified'
    },
    banks: banks.map((b) => ({
      _id: b._id,
      accountHolderName: b.accountHolderName,
      accountNumberMasked: b.accountNumberMasked,
      ifsc: b.ifsc,
      upiId: b.upiId,
      bankName: b.bankName,
      method: b.method,
      isPrimary: b.isPrimary,
      verificationStatus: b.verificationStatus,
      pennyDropStatus: b.pennyDropStatus,
      verifiedAccountName: b.verifiedAccountName
    })),
    canWithdraw:
      config.withdrawalEnabled &&
      availableBalance >= config.minWithdrawalAmount &&
      (!config.requireVerifiedBank || verifiedBanks.length > 0) &&
      Boolean(vendor?.phone || !config.requireOtp)
  };
}

function quoteFees(amount, config) {
  return calculatePayoutFees(amount, config);
}

async function listBanks(vendorId) {
  return VendorBank.find({ vendorId }).sort({ isPrimary: -1, updatedAt: -1 }).lean();
}

async function addOrUpdateBank(vendorId, payload) {
  const {
    accountHolderName,
    accountNumber,
    ifsc,
    upiId,
    bankName,
    method = 'bank',
    isPrimary = false,
    bankId
  } = payload;

  if (method === 'upi') {
    if (!upiId || !accountHolderName) {
      throw Object.assign(new Error('UPI ID and account holder name are required'), { status: 400 });
    }
  } else if (!accountHolderName || !accountNumber || !ifsc) {
    throw Object.assign(new Error('Account holder, account number and IFSC are required'), { status: 400 });
  }

  const data = {
    vendorId,
    accountHolderName: String(accountHolderName).trim(),
    accountNumberEncrypted: accountNumber ? encrypt(String(accountNumber).trim()) : encrypt(String(upiId || 'upi')),
    accountNumberMasked: accountNumber ? maskAccountNumber(String(accountNumber)) : String(upiId || '').replace(/.(?=.{4})/g, 'x'),
    ifsc: String(ifsc || 'UPI0000000').toUpperCase().trim(),
    upiId: upiId ? String(upiId).trim() : '',
    bankName: bankName || '',
    method,
    verificationStatus: 'pending',
    pennyDropStatus: 'pending',
    isPrimary: Boolean(isPrimary)
  };

  let bank;
  if (bankId) {
    bank = await VendorBank.findOneAndUpdate({ _id: bankId, vendorId }, { $set: data }, { new: true });
    if (!bank) throw Object.assign(new Error('Bank account not found'), { status: 404 });
  } else {
    if (isPrimary) {
      await VendorBank.updateMany({ vendorId }, { $set: { isPrimary: false } });
    }
    bank = await VendorBank.create(data);
  }

  if (isPrimary) {
    await VendorBank.updateMany({ vendorId, _id: { $ne: bank._id } }, { $set: { isPrimary: false } });
    bank.isPrimary = true;
    await bank.save();
  }

  // Sync legacy Vendor.bankDetails for fallbacks
  await Vendor.findByIdAndUpdate(vendorId, {
    bankDetails: {
      accountName: bank.accountHolderName,
      accountNumber: accountNumber || '',
      ifscCode: bank.ifsc,
      bankName: bank.bankName,
      upiId: bank.upiId || ''
    }
  });

  return bank;
}

async function verifyBankAccount(vendorId, bankId) {
  const bank = await VendorBank.findOne({ _id: bankId, vendorId });
  if (!bank) throw Object.assign(new Error('Bank account not found'), { status: 404 });

  if (bank.method === 'upi') {
    const { verifyVpa } = require('./upiVerification.service');
    try {
      const result = await verifyVpa({
        vpa: bank.upiId,
        entityType: 'vendor',
        entityId: vendorId,
        actorType: 'vendor',
        actorId: vendorId,
        bankId: bank._id
      });
      bank.verificationStatus = 'verified';
      bank.pennyDropStatus = 'not_required';
      bank.verifiedAccountName =
        result.profile?.accountHolderName || bank.accountHolderName;
      bank.accountHolderName =
        result.profile?.accountHolderName || bank.accountHolderName;
      bank.verifiedAt = new Date();
      bank.providerRef = result.profile?.transactionId || String(result.verification._id);
      bank.rejectionReason = null;
      await bank.save();
      return bank;
    } catch (e) {
      bank.verificationStatus = 'rejected';
      bank.pennyDropStatus = 'failed';
      bank.rejectionReason = e.message || 'UPI verification failed';
      await bank.save();
      throw Object.assign(new Error(e.message || 'UPI verification failed'), {
        status: e.statusCode || 400,
        code: e.code
      });
    }
  }

  const accountNumber = decrypt(bank.accountNumberEncrypted);
  try {
    const result = await cgpeService.verifyBank(accountNumber, bank.ifsc);
    const verifiedName = result?.data?.accountHolderName || '';
    bank.verifiedAccountName = verifiedName;
    bank.pennyDropStatus = result?.data?.isValid === false ? 'failed' : 'success';
    bank.verificationStatus = bank.pennyDropStatus === 'success' ? 'verified' : 'rejected';
    bank.verifiedAt = bank.verificationStatus === 'verified' ? new Date() : null;
    bank.rejectionReason = bank.verificationStatus === 'verified' ? null : 'Bank verification failed';
    // Fuzzy name score
    if (verifiedName) {
      const a = verifiedName.toLowerCase().replace(/\s+/g, '');
      const b = String(bank.accountHolderName).toLowerCase().replace(/\s+/g, '');
      bank.fuzzyMatchScore = a.includes(b) || b.includes(a) ? 90 : 60;
    }
    await bank.save();
    return bank;
  } catch (error) {
    bank.pennyDropStatus = 'failed';
    bank.verificationStatus = 'rejected';
    bank.rejectionReason = error.message || 'Penny drop failed';
    await bank.save();
    throw Object.assign(new Error(error.message || 'Bank verification failed'), { status: 400 });
  }
}

async function sendWithdrawalOtp(vendorId) {
  const vendor = await Vendor.findById(vendorId).select('phone name').lean();
  if (!vendor?.phone) {
    throw Object.assign(new Error('Vendor phone required for OTP confirmation'), { status: 400 });
  }
  const allowed = await checkRateLimit(vendor.phone);
  if (!allowed) {
    throw Object.assign(new Error('OTP rate limit exceeded. Try again later.'), { status: 429 });
  }
  const otp = generateOTP(vendor.phone);
  await storeOTP(vendor.phone, hashOTP(otp));
  try {
    await sendSMS(vendor.phone, `Your WBI withdrawal OTP is ${otp}. Valid for 5 minutes. Do not share.`);
  } catch (smsErr) {
    console.warn('[withdraw OTP] SMS failed:', smsErr.message);
    if (process.env.NODE_ENV === 'production' && process.env.USE_DEFAULT_OTP !== 'true') {
      throw Object.assign(new Error('Failed to send OTP SMS'), { status: 502 });
    }
  }
  return {
    sent: true,
    phoneMasked: String(vendor.phone).replace(/.(?=.{4})/g, 'x'),
    expiresIn: 300
  };
}

async function assertOtp(vendorId, otp) {
  const vendor = await Vendor.findById(vendorId).select('phone').lean();
  if (!vendor?.phone) throw Object.assign(new Error('Vendor phone missing'), { status: 400 });
  const result = await verifyOTP(vendor.phone, String(otp).trim());
  if (!result?.success) {
    throw Object.assign(new Error(result?.message || 'Invalid or expired OTP'), { status: 400 });
  }
}

async function getDailyWithdrawn(vendorId) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const agg = await Withdrawal.aggregate([
    {
      $match: {
        vendorId: new mongoose.Types.ObjectId(vendorId),
        createdAt: { $gte: start },
        status: { $in: ['pending', 'approved', 'processing', 'awaiting_manual_transfer', 'paid'] }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return agg[0]?.total || 0;
}

/**
 * Create withdrawal request (holds available balance).
 */
async function createWithdrawalRequest(vendorId, {
  amount,
  bankAccountId,
  method = 'bank',
  otp,
  idempotencyKey,
  notes = ''
}) {
  const config = await getPayoutConfig();
  if (!config.withdrawalEnabled) {
    throw Object.assign(new Error('Withdrawals are temporarily disabled'), { status: 403 });
  }

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw Object.assign(new Error('Valid amount is required'), { status: 400 });
  }
  if (amt < config.minWithdrawalAmount) {
    throw Object.assign(new Error(`Minimum withdrawal is ₹${config.minWithdrawalAmount}`), { status: 400 });
  }
  if (amt > config.maxWithdrawalAmount) {
    throw Object.assign(new Error(`Maximum withdrawal is ₹${config.maxWithdrawalAmount}`), { status: 400 });
  }

  if (config.requireOtp) {
    if (!otp) throw Object.assign(new Error('OTP is required'), { status: 400 });
    await assertOtp(vendorId, String(otp));
  }

  if (method === 'upi' && !config.allowUpi) {
    throw Object.assign(new Error('UPI withdrawals are disabled'), { status: 400 });
  }
  if (method === 'bank' && !config.allowBankTransfer) {
    throw Object.assign(new Error('Bank withdrawals are disabled'), { status: 400 });
  }

  const bank = await VendorBank.findOne({ _id: bankAccountId, vendorId });
  if (!bank) throw Object.assign(new Error('Select a linked bank / UPI account'), { status: 400 });

  // Live UPI verify required when withdrawing to UPI (or bank record is method=upi)
  if (method === 'upi' || bank.method === 'upi') {
    if (process.env.UPI_REQUIRE_FOR_WITHDRAWAL !== 'false') {
      const { requireVerifiedVpa } = require('./upiVerification.service');
      try {
        await requireVerifiedVpa({ vpa: bank.upiId });
      } catch (e) {
        // Attempt live re-verify once
        try {
          const { verifyVpa } = require('./upiVerification.service');
          await verifyVpa({
            vpa: bank.upiId,
            entityType: 'vendor',
            entityId: vendorId,
            actorType: 'vendor',
            actorId: vendorId,
            bankId: bank._id,
            forceRefresh: true
          });
        } catch (re) {
          throw Object.assign(new Error(re.message || 'UPI must be verified before withdrawal'), {
            status: re.statusCode || 422,
            code: re.code || 'UPI_NOT_VERIFIED'
          });
        }
      }
    }
  }

  const daily = await getDailyWithdrawn(vendorId);
  if (daily + amt > config.dailyWithdrawalLimit) {
    throw Object.assign(new Error('Daily withdrawal limit exceeded'), { status: 400 });
  }

  const key = idempotencyKey || `wd_${vendorId}_${amt}_${Date.now()}`;
  const existing = await Withdrawal.findOne({ idempotencyKey: key });
  if (existing) return { withdrawal: existing, reused: true };

  // reload bank after possible verify
  const bankFresh = await VendorBank.findOne({ _id: bankAccountId, vendorId });
  if (!bankFresh) throw Object.assign(new Error('Select a linked bank / UPI account'), { status: 400 });
  if (config.requireVerifiedBank && bankFresh.verificationStatus !== 'verified') {
    throw Object.assign(new Error('Bank account must be verified (penny drop) before withdrawal'), { status: 400 });
  }

  const fees = quoteFees(amt, config);
  const wallet = await VendorFinanceWallet.findOne({ vendorId });
  if (!wallet || wallet.availableBalance < amt) {
    throw Object.assign(
      new Error(
        `Insufficient settled balance. Available: ₹${wallet?.availableBalance || 0}. Escrow funds cannot be withdrawn until released.`
      ),
      { status: 400 }
    );
  }

  const accountNumber = bankFresh.method === 'upi' ? '' : decrypt(bankFresh.accountNumberEncrypted);
  const approvalMode = amt <= config.autoApproveMaxAmount ? 'auto' : 'manual';

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    wallet.availableBalance -= amt;
    wallet.processingWithdrawal = (wallet.processingWithdrawal || 0) + amt;
    await wallet.save({ session });

    const txn = await new VendorFinanceTransaction({
      vendorId,
      type: 'withdrawal',
      amount: amt,
      description: notes || `Withdrawal request (${method})`,
      balanceAfter: wallet.availableBalance,
      status: 'processing',
      source: 'withdrawal',
      occurredAt: new Date()
    }).save({ session });

    const [withdrawal] = await Withdrawal.create(
      [
        {
          vendorId,
          source: 'finance_wallet',
          method,
          settlementSchedule: config.settlementSchedule,
          amount: amt,
          status: 'pending',
          bankAccountId: bankFresh._id,
          bankDetails: {
            accountNumber,
            accountNumberMasked: bankFresh.accountNumberMasked,
            ifscCode: bankFresh.ifsc,
            accountHolderName: bankFresh.accountHolderName,
            bankName: bankFresh.bankName,
            upiId: bankFresh.upiId
          },
          financeTransactionId: txn._id,
          idempotencyKey: key,
          ...fees,
          otpVerifiedAt: config.requireOtp ? new Date() : null,
          approvalMode,
          gatewayProvider: config.payoutProvider,
          timeline: [
            {
              status: 'pending',
              message: 'Withdrawal requested — balance held',
              actorType: 'vendor',
              at: new Date()
            }
          ]
        }
      ],
      { session }
    );

    txn.referenceCode = String(withdrawal._id);
    await txn.save({ session });

    await session.commitTransaction();

    // Notify admins
    try {
      const Admin = require('../models/Admin');
      const admins = await Admin.find({ isActive: true }).select('_id').limit(20).lean();
      for (const admin of admins) {
        await createNotification({
          adminId: admin._id,
          type: 'withdrawal_request',
          title: 'Vendor withdrawal request',
          message: `₹${amt} withdrawal pending (${approvalMode} approval)`,
          relatedId: withdrawal._id,
          relatedType: 'withdrawal'
        });
      }
    } catch (nErr) {
      console.warn('[withdraw] admin notify failed', nErr.message);
    }

    emitFinance(vendorId, 'finance:withdrawalRequested', {
      withdrawalId: withdrawal._id,
      amount: amt,
      status: withdrawal.status
    });

    // Auto-approve small amounts
    if (approvalMode === 'auto') {
      const processed = await processApprovedWithdrawal(withdrawal._id, {
        actorType: 'system',
        notes: 'Auto-approved under amount threshold'
      });
      return { withdrawal: processed.withdrawal, fees, reused: false, autoApproved: true };
    }

    return { withdrawal, fees, reused: false, autoApproved: false };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

async function cancelWithdrawal(vendorId, withdrawalId) {
  const withdrawal = await Withdrawal.findOne({ _id: withdrawalId, vendorId });
  if (!withdrawal) throw Object.assign(new Error('Withdrawal not found'), { status: 404 });
  if (!['pending', 'otp_pending', 'awaiting_manual_transfer'].includes(withdrawal.status)) {
    throw Object.assign(new Error('Only pending withdrawals can be cancelled'), { status: 400 });
  }

  const wallet = await VendorFinanceWallet.findOne({ vendorId: withdrawal.vendorId });
  if (wallet && withdrawal.source === 'finance_wallet') {
    wallet.availableBalance += withdrawal.amount;
    wallet.processingWithdrawal = Math.max(0, (wallet.processingWithdrawal || 0) - withdrawal.amount);
    await wallet.save();
  }
  if (withdrawal.financeTransactionId) {
    await VendorFinanceTransaction.findByIdAndUpdate(withdrawal.financeTransactionId, {
      status: 'failed',
      description: 'Withdrawal cancelled by vendor'
    });
  }

  withdrawal.status = 'cancelled';
  withdrawal.cancelledAt = new Date();
  withdrawal.pushEvent('cancelled', 'Cancelled by vendor before processing', { actorType: 'vendor' });
  await withdrawal.save();

  emitFinance(vendorId, 'finance:withdrawalCancelled', { withdrawalId });
  return withdrawal;
}

/**
 * Finalize finance wallet after successful payout.
 */
async function settleFinanceWalletOnPaid(withdrawal) {
  if (withdrawal.source !== 'finance_wallet') return;
  const wallet = await VendorFinanceWallet.findOne({ vendorId: withdrawal.vendorId });
  if (!wallet) return;
  wallet.processingWithdrawal = Math.max(0, (wallet.processingWithdrawal || 0) - withdrawal.amount);
  wallet.totalWithdrawn = (wallet.totalWithdrawn || 0) + withdrawal.amount;
  await wallet.save();

  if (withdrawal.financeTransactionId) {
    await VendorFinanceTransaction.findByIdAndUpdate(withdrawal.financeTransactionId, {
      status: 'completed',
      referenceCode: withdrawal.transactionReference || withdrawal.gatewayPayoutId || String(withdrawal._id)
    });
  }
}

async function refundFinanceHold(withdrawal, reason) {
  if (withdrawal.source !== 'finance_wallet') return;
  const wallet = await VendorFinanceWallet.findOne({ vendorId: withdrawal.vendorId });
  if (!wallet) return;
  wallet.availableBalance += withdrawal.amount;
  wallet.processingWithdrawal = Math.max(0, (wallet.processingWithdrawal || 0) - withdrawal.amount);
  await wallet.save();
  if (withdrawal.financeTransactionId) {
    await VendorFinanceTransaction.findByIdAndUpdate(withdrawal.financeTransactionId, {
      status: 'failed',
      description: reason || 'Withdrawal failed/rejected — hold released'
    });
  }
}

/**
 * Admin approve OR auto process → call payout provider.
 */
async function processApprovedWithdrawal(withdrawalId, { adminId = null, actorType = 'admin', notes = '', transactionReference = '' } = {}) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw Object.assign(new Error('Withdrawal not found'), { status: 404 });
  if (!['pending', 'approved', 'failed', 'awaiting_manual_transfer', 'processing'].includes(withdrawal.status)) {
    throw Object.assign(new Error(`Cannot process withdrawal in status ${withdrawal.status}`), { status: 400 });
  }

  // Manual settle with UTR (no second gateway call)
  if (transactionReference && ['awaiting_manual_transfer', 'processing', 'pending'].includes(withdrawal.status)) {
    const config = await getPayoutConfig();
    if (config.payoutProvider === 'manual' || withdrawal.status === 'awaiting_manual_transfer') {
      return markWithdrawalPaid(withdrawalId, {
        utr: transactionReference,
        adminId,
        notes: notes || 'Manual transfer recorded'
      });
    }
  }

  const config = await getPayoutConfig();
  const fees = quoteFees(withdrawal.amount, config);
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
      if (transactionReference) {
        return markWithdrawalPaid(withdrawal._id, {
          utr: transactionReference,
          adminId,
          notes: notes || 'Manual transfer recorded'
        });
      }
      withdrawal.pushEvent('awaiting_manual_transfer', 'Waiting for admin bank transfer / UTR', {
        actorType
      });
      await withdrawal.save();
      emitFinance(withdrawal.vendorId, 'finance:withdrawalUpdated', {
        withdrawalId: withdrawal._id,
        status: withdrawal.status
      });
      return { withdrawal, providerResult: result };
    }

    // Gateway accepted — may still be processing; webhook will mark paid
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
    emitFinance(withdrawal.vendorId, 'finance:withdrawalUpdated', {
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
    await refundFinanceHold(withdrawal, error.message);
    emitFinance(withdrawal.vendorId, 'finance:withdrawalFailed', {
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
  await settleFinanceWalletOnPaid(withdrawal);

  try {
    await createNotification({
      vendorId: withdrawal.vendorId,
      type: 'withdrawal_paid',
      title: 'Withdrawal completed',
      message: `₹${withdrawal.netAmount || withdrawal.amount} transferred. UTR: ${withdrawal.transactionReference || '—'}`,
      relatedId: withdrawal._id,
      relatedType: 'withdrawal',
      data: {
        module: 'finance',
        actionUrl: 'finance/wallet',
        notifyCategory: 'payments',
        utr: withdrawal.transactionReference
      }
    });
  } catch {
    /* ignore */
  }

  emitFinance(withdrawal.vendorId, 'finance:withdrawalPaid', {
    withdrawalId: withdrawal._id,
    utr: withdrawal.transactionReference
  });
  return { withdrawal, duplicate: false };
}

async function rejectWithdrawal(withdrawalId, { adminId, reason }) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw Object.assign(new Error('Withdrawal not found'), { status: 404 });
  if (['paid', 'cancelled', 'rejected'].includes(withdrawal.status)) {
    throw Object.assign(new Error('Withdrawal already finalized'), { status: 400 });
  }
  await refundFinanceHold(withdrawal, reason || 'Rejected by admin');
  withdrawal.status = 'rejected';
  withdrawal.rejectionReason = reason || 'Rejected';
  withdrawal.processedBy = adminId;
  withdrawal.processedDate = new Date();
  withdrawal.pushEvent('rejected', reason || 'Rejected by admin', { actorType: 'admin', actorId: adminId });
  await withdrawal.save();
  emitFinance(withdrawal.vendorId, 'finance:withdrawalRejected', { withdrawalId });
  return withdrawal;
}

async function retryWithdrawal(withdrawalId, { adminId } = {}) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw Object.assign(new Error('Withdrawal not found'), { status: 404 });
  if (!['failed'].includes(withdrawal.status)) {
    throw Object.assign(new Error('Only failed withdrawals can be retried'), { status: 400 });
  }
  // Re-hold if previously refunded
  const wallet = await VendorFinanceWallet.findOne({ vendorId: withdrawal.vendorId });
  if (!wallet || wallet.availableBalance < withdrawal.amount) {
    throw Object.assign(new Error('Insufficient balance to retry'), { status: 400 });
  }
  wallet.availableBalance -= withdrawal.amount;
  wallet.processingWithdrawal = (wallet.processingWithdrawal || 0) + withdrawal.amount;
  await wallet.save();
  withdrawal.status = 'pending';
  withdrawal.failureReason = '';
  withdrawal.pushEvent('pending', 'Retry queued', { actorType: 'admin', actorId: adminId });
  await withdrawal.save();
  return processApprovedWithdrawal(withdrawalId, { adminId, actorType: 'admin', notes: 'Retry payout' });
}

async function handlePayoutWebhook(provider, payload) {
  // RazorpayX payout webhook
  const payoutId =
    payload?.payload?.payout?.entity?.id ||
    payload?.data?.payout?.id ||
    payload?.id ||
    null;
  const status =
    payload?.payload?.payout?.entity?.status ||
    payload?.data?.status ||
    payload?.status ||
    '';
  const utr =
    payload?.payload?.payout?.entity?.utr ||
    payload?.data?.utr ||
    payload?.utr ||
    '';

  if (!payoutId) return { ignored: true };

  const withdrawal = await Withdrawal.findOne({ gatewayPayoutId: payoutId });
  if (!withdrawal) return { ignored: true, reason: 'withdrawal_not_found' };

  withdrawal.gatewayStatus = status;
  withdrawal.gatewayResponse = payload;
  withdrawal.gatewayProvider = provider;

  if (['processed', 'paid', 'success'].includes(String(status).toLowerCase())) {
    return markWithdrawalPaid(withdrawal._id, { utr: utr || payoutId });
  }
  if (['rejected', 'failed', 'cancelled', 'reversed'].includes(String(status).toLowerCase())) {
    withdrawal.status = 'failed';
    withdrawal.failureReason = `Gateway ${status}`;
    withdrawal.failedAt = new Date();
    withdrawal.pushEvent('failed', `Gateway webhook: ${status}`, { actorType: 'gateway' });
    await withdrawal.save();
    await refundFinanceHold(withdrawal, `Gateway ${status}`);
    return { withdrawal, failed: true };
  }

  await withdrawal.save();
  return { withdrawal, status };
}

async function listVendorWithdrawals(vendorId, { page = 1, limit = 20, status } = {}) {
  const filter = { vendorId, source: 'finance_wallet' };
  if (status) filter.status = status;
  const skip = (Math.max(1, page) - 1) * limit;
  const [data, total] = await Promise.all([
    Withdrawal.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Withdrawal.countDocuments(filter)
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
}

async function getWithdrawalDetail(vendorId, withdrawalId) {
  const w = await Withdrawal.findOne({ _id: withdrawalId, vendorId }).lean();
  if (!w) throw Object.assign(new Error('Withdrawal not found'), { status: 404 });
  return w;
}

module.exports = {
  getWithdrawEligibility,
  quoteFees,
  listBanks,
  addOrUpdateBank,
  verifyBankAccount,
  sendWithdrawalOtp,
  createWithdrawalRequest,
  cancelWithdrawal,
  processApprovedWithdrawal,
  markWithdrawalPaid,
  rejectWithdrawal,
  retryWithdrawal,
  handlePayoutWebhook,
  listVendorWithdrawals,
  getWithdrawalDetail,
  getEscrowHeldFromServiceRequests
};
