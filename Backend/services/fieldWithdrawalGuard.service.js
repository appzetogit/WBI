/**
 * Shared safety rails for engineer/worker wallet withdrawals.
 *
 * 1. The balance hold is a single conditional $inc, so parallel requests can
 *    never withdraw the same money twice.
 * 2. The payout destination comes from the account's own records — the
 *    verified bank account, or the UPI ID saved on the profile — never from
 *    whatever the request body names.
 */
const BankAccount = require('../models/BankAccount');
const { decrypt } = require('../utils/encryption');

const UPI_ID_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9._-]{2,64}$/i;

/** Move `amount` from wallet.balance to wallet.pendingBalance, or return null if short. */
const holdBalance = (Model, ownerId, amount) =>
  Model.findOneAndUpdate(
    { _id: ownerId, 'wallet.balance': { $gte: amount } },
    { $inc: { 'wallet.balance': -amount, 'wallet.pendingBalance': amount } },
    { new: true }
  );

/** Undo a hold when the withdrawal record could not be created. */
const releaseHold = (Model, ownerId, amount) =>
  Model.updateOne(
    { _id: ownerId },
    { $inc: { 'wallet.balance': amount, 'wallet.pendingBalance': -amount } }
  );

const plainAccountNumber = (stored) => {
  try {
    return decrypt(stored) || stored;
  } catch (_) {
    return stored;
  }
};

/**
 * @returns {{ ok: true, method: 'bank'|'upi', payoutDetails: object } | { ok: false, status: number, message: string }}
 */
const resolvePayoutDestination = async ({ ownerId, method, upiId, savedUpiId }) => {
  if (method === 'upi' || upiId) {
    const requested = String(upiId || '').trim().toLowerCase();
    const saved = String(savedUpiId || '').trim().toLowerCase();
    if (!UPI_ID_REGEX.test(requested)) {
      return { ok: false, status: 400, message: 'Valid UPI ID is required' };
    }
    if (!saved || requested !== saved) {
      return { ok: false, status: 403, message: 'Withdraw only to the UPI ID verified on your profile' };
    }
    return { ok: true, method: 'upi', payoutDetails: { upiId: saved } };
  }

  const account = await BankAccount.findOne({ ownerId, verificationStatus: 'verified' })
    .sort({ isPrimary: -1, updatedAt: -1 })
    .lean();
  if (!account) {
    return { ok: false, status: 403, message: 'Withdrawal blocked: Please link and verify your bank details first.' };
  }
  return {
    ok: true,
    method: 'bank',
    payoutDetails: {
      bankAccountId: account._id,
      accountHolderName: account.accountHolderName,
      accountNumber: plainAccountNumber(account.accountNumberEncrypted),
      ifscCode: account.ifsc,
      bankName: account.bankName || ''
    }
  };
};

module.exports = { holdBalance, releaseHold, resolvePayoutDestination, UPI_ID_REGEX };
