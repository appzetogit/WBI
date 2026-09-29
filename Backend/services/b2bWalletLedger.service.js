const mongoose = require('mongoose');
const { TXN_OPTS } = require('../utils/txnOptions');
const B2BWallet = require('../models/B2BWallet');
const B2BWalletTransaction = require('../models/B2BWalletTransaction');
const B2BCompany = require('../models/B2BCompany');
const B2BCreditProfile = require('../models/B2BCreditProfile');
const { getTopUpMethods } = require('./b2bPlatformConfig.service');

/**
 * B2B wallet ledger — the ONLY writer of company wallet balances.
 *
 * Every balance change goes through postEntry(), which updates the wallet and
 * writes the matching B2BWalletTransaction row inside one MongoDB transaction.
 * A balance therefore never moves without a ledger row, and a ledger row never
 * exists without the balance having moved.
 *
 * Buckets: `balance` is AVAILABLE, `escrowBalance` is RESERVED. Money moves:
 *   TOP_UP           available +
 *   JOB_RESERVATION  available −, reserved +   (hold for a job / upload)
 *   JOB_CHARGE       reserved −                (job closed; spend booked)
 *   RELEASE          reserved −, available +   (cancelled before it was charged)
 *   REFUND           available +               (money returned after a charge)
 *   ADJUSTMENT       available ±               (admin correction, reason required)
 *   PAYOUT           available −               (money paid out of the wallet)
 *   REVERSAL         the exact inverse of an earlier row
 *
 * Demo companies (B2BCompany.billingMode = DEMO) post rows with
 * paymentMode 'DEMO'. Those rows are never reported as revenue or settled.
 */

class WalletError extends Error {
  constructor(message, { code = 'WALLET_ERROR', status = 400, details = null } = {}) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Canonical ledger type to the legacy `type`, so existing readers keep working. */
const LEGACY_TYPE = {
  TOP_UP: 'topup',
  JOB_RESERVATION: 'escrow_hold',
  JOB_CHARGE: 'job_deduction',
  RELEASE: 'escrow_release',
  REFUND: 'refund',
  ADJUSTMENT: 'adjustment',
  PAYOUT: 'payout',
  REVERSAL: 'reversal'
};

/** How each type moves the two buckets, per unit of amount. */
const EFFECTS = {
  TOP_UP: { available: 1, reserved: 0 },
  JOB_RESERVATION: { available: -1, reserved: 1 },
  JOB_CHARGE: { available: 0, reserved: -1 },
  RELEASE: { available: 1, reserved: -1 },
  REFUND: { available: 1, reserved: 0 },
  PAYOUT: { available: -1, reserved: 0 },
  ADJUSTMENT: { available: 1, reserved: 0 }, // amount may be negative
  REVERSAL: { available: 0, reserved: 0 } // deltas come from the reversed row
};

const CODE_FOR = {
  TOP_UP: 'TOP',
  JOB_RESERVATION: 'RSV',
  JOB_CHARGE: 'CHG',
  RELEASE: 'REL',
  REFUND: 'RFD',
  ADJUSTMENT: 'ADJ',
  PAYOUT: 'PAY',
  REVERSAL: 'REV'
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const txnCode = (prefix) =>
  `TXN-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

/** The wallet row, created on first use. Never returns null. */
async function ensureWallet(companyId, session = null) {
  const q = B2BWallet.findOneAndUpdate(
    { companyId },
    { $setOnInsert: { companyId, balance: 0, escrowBalance: 0 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  if (session) q.session(session);
  return q;
}

/** Credit limit lives on the credit profile; the wallet mirrors it. */
async function syncCreditLimit(companyId) {
  const wallet = await ensureWallet(companyId);
  const profile = await B2BCreditProfile.findOne({ companyId }).lean();
  const limit = round2(profile?.approvedLimit || 0);
  if (round2(wallet.creditLimit) !== limit) {
    await B2BWallet.updateOne({ companyId }, { $set: { creditLimit: limit } });
    wallet.creditLimit = limit;
  }
  return wallet;
}

/** Available, reserved, and what the company may actually commit right now. */
async function getBalance(companyId) {
  const wallet = await syncCreditLimit(companyId);
  const available = round2(wallet.balance);
  const reserved = round2(wallet.escrowBalance);
  const creditLimit = round2(wallet.creditLimit);
  return {
    companyId: String(companyId),
    available,
    reserved,
    total: round2(available + reserved),
    creditLimit,
    /** Available balance plus any approved credit. */
    spendable: round2(available + creditLimit),
    currency: wallet.currency || 'INR',
    totalTopup: round2(wallet.totalTopup),
    totalSpent: round2(wallet.totalSpent),
    pendingDeductions: round2(wallet.pendingDeductions),
    ledgerSequence: wallet.ledgerSequence || 0,
    lastUpdatedAt: wallet.lastUpdatedAt
  };
}

/** A DEMO company may only ever post simulated money. */
async function resolvePaymentMode(companyId, requested = null) {
  const company = await B2BCompany.findById(companyId).select('billingMode').lean();
  if (company?.billingMode === 'DEMO') return 'DEMO';
  return requested === 'DEMO' ? 'DEMO' : 'REAL';
}

/** What the company is shown when it cannot cover an amount. */
async function shortfallDetails(companyId, required) {
  const balance = await getBalance(companyId);
  const company = await B2BCompany.findById(companyId).select('billingMode').lean();
  const methods = await getTopUpMethods({ billingMode: company?.billingMode || 'LIVE' });
  return {
    required: round2(required),
    available: balance.available,
    creditLimit: balance.creditLimit,
    spendable: balance.spendable,
    shortfall: round2(Math.max(0, required - balance.spendable)),
    topUpMethods: methods.map((m) => ({
      key: m.key,
      label: m.label,
      minAmount: m.minAmount,
      maxAmount: m.maxAmount,
      instructions: m.instructions,
      requiresApproval: m.requiresApproval
    }))
  };
}

/**
 * Post one ledger entry. The wallet update and the ledger row commit together
 * or not at all. Callers pass a positive `amount` and the direction comes from
 * `ledgerType`; ADJUSTMENT is the one type that takes a signed amount.
 */
async function postEntry({
  companyId,
  ledgerType,
  amount,
  reservationId = null,
  jobId = null,
  batchId = null,
  invoiceId = null,
  deductionId = null,
  relatedJobIds = [],
  remark = '',
  reason = '',
  paymentMode = null,
  paymentStatus = null,
  paymentMethod = null,
  status = 'success',
  gstAmount = 0,
  platformFee = 0,
  actor = null,
  idempotencyKey = null,
  razorpay = null,
  allowCredit = true,
  /**
   * Apply this entry to an existing `pending` row (a gateway order created
   * before the money arrived) instead of writing a new one, so a top-up is
   * one row from order to credit.
   */
  applyToTransactionId = null,
  session: outerSession = null
} = {}) {
  if (!companyId) throw new WalletError('companyId is required', { code: 'COMPANY_REQUIRED' });
  const effect = EFFECTS[ledgerType];
  if (!effect) throw new WalletError(`Unknown ledger type ${ledgerType}`, { code: 'BAD_LEDGER_TYPE' });

  const signed = round2(amount);
  const magnitude = Math.abs(signed);
  if (!magnitude) throw new WalletError('amount must be non-zero', { code: 'BAD_AMOUNT' });
  if (ledgerType !== 'ADJUSTMENT' && signed < 0) {
    throw new WalletError('amount must be positive for this ledger type', { code: 'BAD_AMOUNT' });
  }

  const availableDelta = ledgerType === 'ADJUSTMENT' ? signed : round2(effect.available * magnitude);
  const reservedDelta = ledgerType === 'ADJUSTMENT' ? 0 : round2(effect.reserved * magnitude);

  if (idempotencyKey) {
    const seen = await B2BWalletTransaction.findOne({ idempotencyKey }).lean();
    if (seen) return { transaction: seen, replayed: true, balance: seen.balanceAfter };
  }

  const mode = paymentMode || (await resolvePaymentMode(companyId));
  const wallet = await syncCreditLimit(companyId);

  // First ledger row for this wallet: record what it already held, so the
  // reconciliation can account for money that predates the ledger.
  if (!wallet.openingBalanceAt) {
    await B2BWallet.updateOne(
      { companyId, openingBalanceAt: null },
      {
        $set: {
          openingBalance: round2(wallet.balance),
          openingReserved: round2(wallet.escrowBalance),
          openingBalanceAt: new Date()
        }
      }
    );
  }

  // Guards: a bucket may never go below what the type allows.
  const filter = { companyId };
  if (availableDelta < 0) {
    const needed = Math.abs(availableDelta);
    filter.$expr = allowCredit
      ? { $gte: [{ $add: ['$balance', { $ifNull: ['$creditLimit', 0] }] }, needed] }
      : { $gte: ['$balance', needed] };
  }
  if (reservedDelta < 0) {
    filter.escrowBalance = { $gte: Math.abs(reservedDelta) };
  }

  const inc = { balance: availableDelta, escrowBalance: reservedDelta, ledgerSequence: 1 };
  if (ledgerType === 'TOP_UP') inc.totalTopup = magnitude;
  if (ledgerType === 'JOB_CHARGE' || ledgerType === 'PAYOUT') inc.totalSpent = magnitude;
  if (ledgerType === 'REFUND') inc.totalSpent = -magnitude;

  const run = async (session) => {
    // Pipeline update so every stored balance is rounded to paise in the same
    // atomic write (plain $inc accumulated float noise like 4341.570000000001).
    const set = { lastUpdatedAt: new Date() };
    for (const [field, delta] of Object.entries(inc)) {
      const next = { $add: [{ $ifNull: [`$${field}`, 0] }, delta] };
      set[field] = field === 'ledgerSequence' ? next : { $round: [next, 2] };
    }
    const updated = await B2BWallet.findOneAndUpdate(filter, [{ $set: set }], { new: true, session });
    if (!updated) {
      if (reservedDelta < 0) {
        throw new WalletError('Reserved balance is lower than the amount being released', {
          code: 'RESERVATION_TOO_SMALL',
          details: { required: Math.abs(reservedDelta), reserved: round2(wallet.escrowBalance) }
        });
      }
      throw new WalletError('Insufficient wallet balance', {
        code: 'INSUFFICIENT_FUNDS',
        status: 402,
        details: await shortfallDetails(companyId, Math.abs(availableDelta))
      });
    }

    const entry = {
      companyId,
      walletId: updated._id,
      ledgerType,
      type: LEGACY_TYPE[ledgerType],
      amount: magnitude,
      gstAmount: round2(gstAmount),
      platformFee: round2(platformFee),
      totalAmount: magnitude,
      status,
      paymentMode: mode,
      paymentStatus: paymentStatus || (mode === 'DEMO' ? 'SIMULATED_SUCCESS' : null),
      paymentMethod,
      availableDelta,
      reservedDelta,
      balanceAfter: {
        available: round2(updated.balance),
        reserved: round2(updated.escrowBalance),
        total: round2(updated.balance + updated.escrowBalance)
      },
      sequence: updated.ledgerSequence,
      idempotencyKey,
      reservationId,
      jobId,
      batchId,
      invoiceId,
      deductionId,
      relatedJobIds: relatedJobIds.length ? relatedJobIds : (jobId ? [jobId] : []),
      remark: remark || reason,
      performedBy: actor
        ? { actorId: actor.actorId || actor.id || null, role: actor.role || null, name: actor.name || '' }
        : undefined,
      razorpayOrderId: razorpay?.orderId,
      razorpayPaymentId: razorpay?.paymentId,
      razorpaySignature: razorpay?.signature
    };

    let row;
    if (applyToTransactionId) {
      // Keep whatever the pending row already holds where this call says nothing.
      const patch = Object.fromEntries(
        Object.entries(entry).filter(([, v]) => v !== null && v !== undefined)
      );
      // Only a row that has not moved money yet may be completed this way.
      row = await B2BWalletTransaction.findOneAndUpdate(
        { _id: applyToTransactionId, status: 'pending' },
        { $set: patch },
        { new: true, session }
      );
      if (!row) {
        throw new WalletError('That payment is no longer pending', {
          code: 'TXN_NOT_PENDING',
          status: 409
        });
      }
    } else {
      entry.transactionId = txnCode(CODE_FOR[ledgerType] || 'GEN');
      [row] = await B2BWalletTransaction.create([entry], { session });
    }

    // The company document mirrors the available balance for list screens.
    await B2BCompany.updateOne(
      { _id: companyId },
      { $set: { walletBalance: round2(updated.balance) } },
      { session }
    );

    return {
      transaction: row.toObject(),
      balance: {
        available: round2(updated.balance),
        reserved: round2(updated.escrowBalance),
        total: round2(updated.balance + updated.escrowBalance)
      }
    };
  };

  if (outerSession) return run(outerSession);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await run(session); }, TXN_OPTS);
    return result;
  } catch (err) {
    // A duplicate key means a concurrent caller already posted this entry.
    if (err && err.code === 11000 && idempotencyKey) {
      const seen = await B2BWalletTransaction.findOne({ idempotencyKey }).lean();
      if (seen) return { transaction: seen, replayed: true, balance: seen.balanceAfter };
    }
    throw err;
  } finally {
    session.endSession();
  }
}

// ── Operations ──────────────────────────────────────────────────────────────

/** Credit the wallet. Gateway payments and admin credits both land here. */
async function topUp({
  companyId, amount, paymentMethod = null, razorpay = null, actor = null,
  remark = '', idempotencyKey = null, paymentMode = null,
  applyToTransactionId = null, session = null
} = {}) {
  const mode = await resolvePaymentMode(companyId, paymentMode);
  return postEntry({
    companyId,
    ledgerType: 'TOP_UP',
    amount,
    paymentMethod,
    razorpay,
    actor,
    remark: remark || (mode === 'DEMO' ? 'Simulated top-up (demo account)' : 'Wallet top-up'),
    paymentMode: mode,
    paymentStatus: mode === 'DEMO' ? 'SIMULATED_SUCCESS' : 'SUCCESS',
    idempotencyKey,
    applyToTransactionId,
    session
  });
}

/**
 * Hold money for a job or a bulk upload. Nothing is dispatched until this
 * succeeds; on failure the caller gets required / available / shortfall and
 * the configured top-up methods.
 */
async function reserve({
  companyId, amount, reservationId, jobId = null, batchId = null,
  actor = null, remark = '', idempotencyKey = null, session = null
} = {}) {
  if (!reservationId) throw new WalletError('reservationId is required', { code: 'RESERVATION_REQUIRED' });
  return postEntry({
    companyId,
    ledgerType: 'JOB_RESERVATION',
    amount,
    reservationId,
    jobId,
    batchId,
    actor,
    remark: remark || `Reserved for ${batchId ? 'upload' : 'job'} ${reservationId}`,
    idempotencyKey,
    session
  });
}

/** Book reserved money as spent, once the job is closed. */
async function charge({
  companyId, amount, reservationId = null, jobId = null, batchId = null,
  actor = null, remark = '', idempotencyKey = null, session = null
} = {}) {
  return postEntry({
    companyId,
    ledgerType: 'JOB_CHARGE',
    amount,
    reservationId,
    jobId,
    batchId,
    actor,
    remark: remark || 'Job charge',
    idempotencyKey,
    session
  });
}

/** Return a hold to the available balance (cancelled before it was charged). */
async function release({
  companyId, amount, reservationId = null, jobId = null, batchId = null,
  actor = null, remark = '', idempotencyKey = null, session = null
} = {}) {
  return postEntry({
    companyId,
    ledgerType: 'RELEASE',
    amount,
    reservationId,
    jobId,
    batchId,
    actor,
    remark: remark || 'Reservation released',
    idempotencyKey,
    session
  });
}

/** Give money back after it was charged. */
async function refund({
  companyId, amount, jobId = null, batchId = null, reservationId = null,
  actor = null, remark = '', reason = '', idempotencyKey = null, session = null
} = {}) {
  return postEntry({
    companyId,
    ledgerType: 'REFUND',
    amount,
    jobId,
    batchId,
    reservationId,
    actor,
    remark: remark || reason || 'Refund',
    reason,
    idempotencyKey,
    session
  });
}

/** Admin correction. `amount` is signed and a reason is mandatory. */
async function adjust({ companyId, amount, reason, actor = null, idempotencyKey = null, session = null } = {}) {
  if (!reason || !String(reason).trim()) {
    throw new WalletError('A reason is required for a wallet adjustment', { code: 'REASON_REQUIRED' });
  }
  return postEntry({
    companyId,
    ledgerType: 'ADJUSTMENT',
    amount,
    reason: String(reason).trim(),
    remark: String(reason).trim(),
    actor,
    idempotencyKey,
    session
  });
}

/** Money leaving the wallet to a payee. */
async function payout({ companyId, amount, jobId = null, actor = null, remark = '', idempotencyKey = null, session = null } = {}) {
  return postEntry({
    companyId,
    ledgerType: 'PAYOUT',
    amount,
    jobId,
    actor,
    remark: remark || 'Payout',
    idempotencyKey,
    session
  });
}

/**
 * REVERSAL is the only type whose deltas are not derived from the type, so it
 * has its own writer. The original row is kept and marked `reversed`.
 */
async function reverse({ transactionId, reason, actor = null } = {}) {
  const original = await B2BWalletTransaction.findById(transactionId);
  if (!original) throw new WalletError('Transaction not found', { code: 'TXN_NOT_FOUND', status: 404 });
  if (original.status === 'reversed') {
    throw new WalletError('Transaction is already reversed', { code: 'ALREADY_REVERSED' });
  }
  if (!reason || !String(reason).trim()) {
    throw new WalletError('A reason is required to reverse a transaction', { code: 'REASON_REQUIRED' });
  }

  const availableDelta = -round2(original.availableDelta);
  const reservedDelta = -round2(original.reservedDelta);
  if (!availableDelta && !reservedDelta) {
    throw new WalletError('This transaction moved no money and cannot be reversed', {
      code: 'NOTHING_TO_REVERSE'
    });
  }

  const companyId = original.companyId;
  const note = String(reason).trim();

  const run = async (session) => {
    const filter = { companyId };
    if (availableDelta < 0) filter.$expr = { $gte: ['$balance', Math.abs(availableDelta)] };
    if (reservedDelta < 0) filter.escrowBalance = { $gte: Math.abs(reservedDelta) };

    const updated = await B2BWallet.findOneAndUpdate(
      filter,
      {
        $inc: { balance: availableDelta, escrowBalance: reservedDelta, ledgerSequence: 1 },
        $set: { lastUpdatedAt: new Date() }
      },
      { new: true, session }
    );
    if (!updated) {
      throw new WalletError('The wallet no longer holds the money this row moved', {
        code: 'REVERSAL_NOT_POSSIBLE'
      });
    }

    const [row] = await B2BWalletTransaction.create([{
      companyId,
      walletId: updated._id,
      transactionId: txnCode('REV'),
      ledgerType: 'REVERSAL',
      type: LEGACY_TYPE.REVERSAL,
      amount: round2(original.amount),
      totalAmount: round2(original.amount),
      status: 'success',
      paymentMode: original.paymentMode || 'REAL',
      availableDelta,
      reservedDelta,
      balanceAfter: {
        available: round2(updated.balance),
        reserved: round2(updated.escrowBalance),
        total: round2(updated.balance + updated.escrowBalance)
      },
      sequence: updated.ledgerSequence,
      reservationId: original.reservationId,
      jobId: original.jobId,
      batchId: original.batchId,
      reversalOf: original._id,
      remark: note,
      performedBy: actor
        ? { actorId: actor.actorId || actor.id || null, role: actor.role || null, name: actor.name || '' }
        : undefined
    }], { session });

    await B2BWalletTransaction.updateOne(
      { _id: original._id },
      { $set: { status: 'reversed' } },
      { session }
    );
    await B2BCompany.updateOne(
      { _id: companyId },
      { $set: { walletBalance: round2(updated.balance) } },
      { session }
    );

    return {
      transaction: row.toObject(),
      balance: {
        available: round2(updated.balance),
        reserved: round2(updated.escrowBalance),
        total: round2(updated.balance + updated.escrowBalance)
      }
    };
  };

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await run(session); }, TXN_OPTS);
    return result;
  } finally {
    session.endSession();
  }
}

/**
 * Recompute both balances from the ledger and compare them with the wallet.
 * Drift means something wrote a balance outside this service.
 */
async function reconcile(companyId) {
  const [agg] = await B2BWalletTransaction.aggregate([
    // Every row counts, including one later reversed: it moved money at the
    // time, and its reversal carries the opposite deltas.
    { $match: { companyId: new mongoose.Types.ObjectId(String(companyId)) } },
    {
      $group: {
        _id: null,
        available: { $sum: { $ifNull: ['$availableDelta', 0] } },
        reserved: { $sum: { $ifNull: ['$reservedDelta', 0] } },
        rows: { $sum: 1 },
        ledgered: { $sum: { $cond: [{ $ifNull: ['$ledgerType', false] }, 1, 0] } }
      }
    }
  ]);
  const wallet = await ensureWallet(companyId);
  const opening = {
    available: round2(wallet.openingBalance),
    reserved: round2(wallet.openingReserved)
  };
  const expectedAvailable = round2(opening.available + (agg?.available || 0));
  const expectedReserved = round2(opening.reserved + (agg?.reserved || 0));
  const actualAvailable = round2(wallet.balance);
  const actualReserved = round2(wallet.escrowBalance);
  const driftAvailable = round2(actualAvailable - expectedAvailable);
  const driftReserved = round2(actualReserved - expectedReserved);
  return {
    companyId: String(companyId),
    rows: agg?.rows || 0,
    /** Rows written before this ledger existed carry no deltas. */
    legacyRows: (agg?.rows || 0) - (agg?.ledgered || 0),
    /** Money the wallet already held when the ledger started. */
    opening,
    expected: { available: expectedAvailable, reserved: expectedReserved },
    actual: { available: actualAvailable, reserved: actualReserved },
    drift: { available: driftAvailable, reserved: driftReserved },
    balanced: driftAvailable === 0 && driftReserved === 0
  };
}

module.exports = {
  WalletError,
  LEGACY_TYPE,
  ensureWallet,
  getBalance,
  shortfallDetails,
  resolvePaymentMode,
  postEntry,
  topUp,
  reserve,
  charge,
  release,
  refund,
  adjust,
  payout,
  reverse,
  reconcile
};
