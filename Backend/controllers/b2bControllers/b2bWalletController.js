const walletLedger = require('../../services/b2bWalletLedger.service');
const { getTopUpMethods } = require('../../services/b2bPlatformConfig.service');
const B2BWallet = require('../../models/B2BWallet');
const B2BWalletTransaction = require('../../models/B2BWalletTransaction');
const B2BDeductionRule = require('../../models/B2BDeductionRule');
const B2BPaymentMethod = require('../../models/B2BPaymentMethod');
const B2BInvoice = require('../../models/B2BInvoice');
const B2BCompany = require('../../models/B2BCompany');
const { createOrder, verifyPayment, isTestMode } = require('../../services/razorpayService');
const {
  getPendingWalletGate,
  activatePendingWalletJobs
} = require('../../services/b2bWalletService');
const { generateAndUploadInvoicePdf } = require('../../utils/invoicePdfGenerator');

// Socket notification helper
const emitWalletEvent = (req, eventName, roomName, data) => {
  try {
    const io = req.app.get('socketio');
    if (io) {
      io.to(roomName).emit(eventName, data);
      console.log(`[Socket.io] Emitted ${eventName} to ${roomName}`);
    }
  } catch (err) {
    console.error('[Socket.io] Emit error:', err.message);
  }
};

/**
 * GET B2B Wallet Summary
 */
const getWalletSummary = async (req, res) => {
  try {
    const companyId = req.companyId;
    let wallet = await B2BWallet.findOne({ companyId });
    if (!wallet) {
      wallet = await B2BWallet.create({ companyId, balance: 0 });
    }

    let rule = await B2BDeductionRule.findOne({ companyId, isActive: true });
    if (!rule) {
      rule = await B2BDeductionRule.create({ companyId, perJobCharge: 12, gstPercent: 18, isActive: true });
    }

    // Available / reserved / credit all come from the ledger's own reader.
    const balance = await walletLedger.getBalance(companyId);
    const company = await B2BCompany.findById(companyId).select('billingMode').lean();
    const topUpMethods = await getTopUpMethods({ billingMode: company?.billingMode || 'LIVE' });

    res.status(200).json({
      success: true,
      data: {
        walletId: wallet._id,
        balance: balance.available,
        availableBalance: balance.available,
        escrowBalance: balance.reserved,
        reservedBalance: balance.reserved,
        totalBalance: balance.total,
        creditLimit: balance.creditLimit,
        spendable: balance.spendable,
        totalTopup: balance.totalTopup,
        totalSpent: balance.totalSpent,
        pendingDeductions: balance.pendingDeductions,
        currency: balance.currency,
        /** DEMO wallets hold simulated money only. */
        billingMode: company?.billingMode || 'LIVE',
        topUpMethods,
        autoDeductionEnabled: wallet.autoDeductionEnabled,
        deductionRule: {
          perJobCharge: rule.perJobCharge,
          gstPercent: rule.gstPercent,
          totalPerJob: parseFloat((rule.perJobCharge * (1 + rule.gstPercent / 100)).toFixed(2))
        }
      }
    });
  } catch (error) {
    console.error('B2B Wallet Summary Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve wallet summary' });
  }
};

/**
 * GET B2B Wallet Transactions
 */
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ledger filter shared by the list and the statement export. */
const buildTransactionFilter = (companyId, q = {}) => {
  const filter = { companyId };
  if (q.ledgerType && q.ledgerType !== 'all') filter.ledgerType = String(q.ledgerType).toUpperCase();
  if (q.status && q.status !== 'all') filter.status = String(q.status).toLowerCase();
  if (q.paymentMode && q.paymentMode !== 'all') filter.paymentMode = String(q.paymentMode).toUpperCase();
  if (q.startDate || q.endDate) {
    filter.createdAt = {};
    if (q.startDate && !isNaN(Date.parse(q.startDate))) filter.createdAt.$gte = new Date(q.startDate);
    if (q.endDate && !isNaN(Date.parse(q.endDate))) {
      const end = new Date(q.endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }
  if (q.search && String(q.search).trim()) {
    const rx = { $regex: escapeRegex(String(q.search).trim().slice(0, 100)), $options: 'i' };
    filter.$or = [{ transactionId: rx }, { remark: rx }, { razorpayPaymentId: rx }];
  }
  return filter;
};

/** Money flowing in or out of the company's available balance, for display. */
const signedAmount = (t) => {
  if (typeof t.availableDelta === 'number' && (t.availableDelta !== 0 || t.reservedDelta)) {
    // A charge only drains the reserved bucket: that is money spent.
    return t.availableDelta !== 0 ? t.availableDelta : t.reservedDelta;
  }
  const amt = Math.abs(Number(t.totalAmount || t.amount || 0));
  return ['topup', 'refund', 'release'].includes(t.type) ? amt : (t.amount < 0 ? -amt : amt);
};

/**
 * GET B2B Wallet Transactions — paginated, filterable ledger.
 */
const getWalletTransactions = async (req, res) => {
  try {
    const companyId = req.companyId;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
    const filter = buildTransactionFilter(companyId, req.query);

    const [transactions, total] = await Promise.all([
      B2BWalletTransaction.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-razorpaySignature')
        .lean(),
      B2BWalletTransaction.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: transactions.map((t) => ({ ...t, signedAmount: signedAmount(t) })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('B2B Wallet Transactions Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve ledger logs' });
  }
};

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/**
 * GET wallet statement as CSV (same filters as the list).
 */
const exportWalletStatement = async (req, res) => {
  try {
    const filter = buildTransactionFilter(req.companyId, req.query);
    const rows = await B2BWalletTransaction.find(filter).sort({ createdAt: 1, _id: 1 }).limit(50000).lean();
    const header = ['Date', 'Transaction ID', 'Ledger Type', 'Legacy Type', 'Status', 'Mode', 'Method',
      'Amount', 'Available Change', 'Reserved Change', 'Available After', 'Reserved After', 'Remark'];
    const lines = [header.map(csvCell).join(',')];
    for (const t of rows) {
      lines.push([
        new Date(t.createdAt).toISOString(), t.transactionId, t.ledgerType || '', t.type || '', t.status || '',
        t.paymentMode || '', t.paymentMethod || '', signedAmount(t),
        t.availableDelta ?? '', t.reservedDelta ?? '',
        t.balanceAfter?.available ?? '', t.balanceAfter?.reserved ?? '', t.remark || ''
      ].map(csvCell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=WBI_Wallet_Statement_${Date.now()}.csv`);
    return res.send('﻿' + lines.join('\n'));
  } catch (error) {
    console.error('B2B Wallet Statement Error:', error);
    res.status(500).json({ success: false, message: 'Failed to export wallet statement' });
  }
};

/**
 * GET reconciliation — recompute the company's balances from its ledger and
 * compare them with the wallet, plus a per-type movement summary for the period.
 */
const getWalletReconciliation = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const companyId = req.companyId;
    const recon = await walletLedger.reconcile(companyId);

    const match = buildTransactionFilter(new mongoose.Types.ObjectId(String(companyId)), {
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });
    const byType = await B2BWalletTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$ledgerType', { $toUpper: '$type' }] },
          count: { $sum: 1 },
          availableDelta: { $sum: { $ifNull: ['$availableDelta', 0] } },
          reservedDelta: { $sum: { $ifNull: ['$reservedDelta', 0] } },
          gross: { $sum: { $abs: { $ifNull: ['$totalAmount', '$amount'] } } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const [jobsReserved, jobsCharged] = await Promise.all([
      require('../../models/B2BJob').aggregate([
        { $match: { companyId: new mongoose.Types.ObjectId(String(companyId)), walletStatus: 'reserved' } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: { $ifNull: ['$pricing.totalAmount', 0] } } } }
      ]),
      require('../../models/B2BJob').aggregate([
        { $match: { companyId: new mongoose.Types.ObjectId(String(companyId)), walletStatus: 'charged' } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: { $ifNull: ['$pricing.totalAmount', 0] } } } }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...recon,
        checkedAt: new Date(),
        movements: byType.map((r) => ({
          type: r._id || 'UNKNOWN',
          count: r.count,
          availableDelta: Math.round(r.availableDelta * 100) / 100,
          reservedDelta: Math.round(r.reservedDelta * 100) / 100,
          gross: Math.round(r.gross * 100) / 100
        })),
        jobs: {
          reserved: { count: jobsReserved[0]?.count || 0, amount: jobsReserved[0]?.amount || 0 },
          charged: { count: jobsCharged[0]?.count || 0, amount: jobsCharged[0]?.amount || 0 }
        }
      }
    });
  } catch (error) {
    console.error('B2B Wallet Reconciliation Error:', error);
    res.status(500).json({ success: false, message: 'Failed to reconcile wallet' });
  }
};

/**
 * POST Create Razorpay Top Up Order
 */
const createTopupOrder = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { amount, paymentMethod } = req.body;

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount entered' });
    }

    const company = await B2BCompany.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found. Please re-login.' });
    }

    // The method must be one the platform currently offers this company, and
    // only methods settled through the gateway can open a checkout here.
    const methods = await getTopUpMethods({ billingMode: company.billingMode || 'LIVE' });
    const method = methods.find((m) => m.key === String(paymentMethod || '').toUpperCase());
    if (!method) {
      return res.status(400).json({ success: false, message: 'Select a top-up method that is enabled for your account' });
    }
    if (method.requiresApproval || method.key === 'DEMO') {
      return res.status(400).json({
        success: false,
        code: 'OFFLINE_METHOD',
        message: method.instructions || `${method.label} is credited by WBI finance, not through online checkout`
      });
    }
    if (method.minAmount && amountNum < method.minAmount) {
      return res.status(400).json({ success: false, message: `Minimum top-up for ${method.label} is ₹${method.minAmount.toLocaleString('en-IN')}` });
    }
    if (method.maxAmount && amountNum > method.maxAmount) {
      return res.status(400).json({ success: false, message: `Maximum top-up for ${method.label} is ₹${method.maxAmount.toLocaleString('en-IN')}` });
    }

    let wallet = await B2BWallet.findOne({ companyId });
    if (!wallet) {
      wallet = await B2BWallet.create({ companyId, balance: 0 });
    }

    // 1. Create order on Razorpay
    const receipt = `txn_b2b_${Date.now()}`;
    const orderResult = await createOrder(amountNum, 'INR', receipt);
    if (!orderResult.success) {
      return res.status(500).json({ success: false, message: orderResult.error });
    }

    // 2. Insert pending transaction record
    const transactionId = `TXN-TOPUP-${Date.now()}`;
    const newTxn = await B2BWalletTransaction.create({
      companyId,
      walletId: wallet._id,
      transactionId,
      razorpayOrderId: orderResult.orderId,
      type: 'topup',
      amount: amountNum,
      totalAmount: amountNum,
      status: 'pending',
      paymentMethod: method.key,
      remark: 'B2B Corporate Wallet Top Up'
    });

    // 3. Return keys to frontend checkout
    res.status(200).json({
      success: true,
      razorpayOrderId: orderResult.orderId,
      amount: amountNum,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      transactionId: newTxn.transactionId,
      company: {
        name: company.companyName,
        email: company.email,
        phone: company.phone
      }
    });
  } catch (error) {
    console.error('B2B Create Topup Order Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create topup request' });
  }
};

/**
 * POST Verify Razorpay Payment Signature
 */
const verifyTopupPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, transactionId } = req.body;
    if (!transactionId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ success: false, message: 'Payment details are incomplete' });
    }

    // 1. Find transaction and check status (Idempotency Check). Only the
    //    caller's own top-up can be verified.
    const txn = await B2BWalletTransaction.findOne({ transactionId, companyId: req.companyId });
    if (!txn) {
      return res.status(404).json({ success: false, message: 'Transaction record not found' });
    }

    // The signature proves a payment against `razorpayOrderId`; it only proves
    // THIS top-up when that order is the one created for it. Without this
    // check a payment on a small order could credit a larger pending top-up.
    if (!txn.razorpayOrderId || txn.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({ success: false, message: 'Payment does not belong to this top-up' });
    }

    if (txn.status !== 'pending') {
      // Already processed (success or failed) - prevent duplicate double-crediting
      const wallet = await B2BWallet.findOne({ companyId: txn.companyId });
      return res.status(200).json({
        success: true,
        message: 'Payment already verified and credited previously',
        wallet
      });
    }

    // 2. Validate cryptographic signature
    const isValid = verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      txn.status = 'failed';
      txn.remark = 'Cryptographic signature verification failed';
      await txn.save();
      
      // Emit websocket alert
      emitWalletEvent(req, 'b2b:topupFailed', `b2b:${txn.companyId}`, {
        transactionId,
        message: 'Payment verification signature mismatches'
      });
      try {
        require('../../services/notification/notificationOrchestrator.service').emitAsync('PAYMENT_FAILED', {
          targets: { b2bCompanyId: txn.companyId },
          data: {
            b2bCompanyId: String(txn.companyId),
            transactionId: String(txn._id),
            amount: txn.amount,
            paymentId: razorpayPaymentId,
            message: `A wallet top-up of ₹${Number(txn.amount || 0).toLocaleString('en-IN')} could not be verified. If money was debited, it will be refunded by your bank.`
          }
        });
      } catch (_) { /* non-blocking */ }

      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // 3. Credit the wallet through the ledger: the balance change and this
    //    transaction row are written together, or neither is.
    //    Test-mode gateway keys are NOT real money — they post as DEMO.
    const simulated = isTestMode();
    let posted;
    try {
      posted = await walletLedger.topUp({
        companyId: txn.companyId,
        amount: txn.amount,
        paymentMethod: txn.paymentMethod || 'razorpay',
        paymentMode: simulated ? 'DEMO' : null,
        razorpay: {
          orderId: razorpayOrderId,
          paymentId: razorpayPaymentId,
          signature: razorpaySignature
        },
        remark: simulated
          ? 'Simulated wallet top-up (Razorpay test mode) — not real money'
          : 'Successful wallet top-up via Razorpay',
        applyToTransactionId: txn._id
      });
    } catch (err) {
      if (err.name === 'WalletError') {
        return res.status(err.status || 400).json({ success: false, message: err.message, code: err.code });
      }
      throw err;
    }

    let wallet = await B2BWallet.findOne({ companyId: txn.companyId });

    // 4. The company document mirrors the available balance for list screens.
    const company = await B2BCompany.findById(txn.companyId);

    // 5. Generate a real PDF invoice and upload it, then create the B2BInvoice record
    const invoiceId = `INV-${Date.now()}`;
    const invoiceNumber = `WBI-B2B-INV-${Date.now().toString().substring(5)}`;
    const now = new Date();

    let pdfUrl = '';
    try {
      // A simulated (test-mode) payment is never invoiced as real revenue.
      pdfUrl = simulated ? '' : await generateAndUploadInvoicePdf({
        invoiceNumber,
        invoiceDate: now,
        dueDate: now,
        billingPeriod: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        companySnapshot: {
          companyName: company?.companyName || 'B2B Client Company',
          gstNumber: company?.gstNumber || 'N/A',
          email: company?.email || 'N/A',
          phone: company?.phone || 'N/A',
          billingAddress: company?.billingAddress || 'N/A'
        },
        totalJobs: 1,
        perJobCharge: txn.amount,
        platformFee: 0,
        subtotal: txn.amount,
        gstPercent: 0,
        gstAmount: 0,
        totalAmount: txn.amount,
        status: 'Settled',
        paymentStatus: 'paid',
        paymentDate: now,
        transactionId: razorpayPaymentId,
        paymentMethod: 'Razorpay (Online)'
      });
    } catch (pdfErr) {
      // Never let a PDF rendering/upload failure block a successful, already-
      // verified payment — the invoice record still gets created, and the
      // download endpoint reports "not generated yet" instead of streaming a
      // dead link, until this is retried.
      console.error('[B2B Topup] Invoice PDF generation failed (non-blocking):', pdfErr.message);
    }

    if (!simulated) await B2BInvoice.create({
      companyId: txn.companyId,
      invoiceId,
      invoiceNumber,
      invoiceType: 'topup',
      billingPeriod: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      amount: txn.amount,
      totalAmount: txn.amount,
      status: 'Settled',
      invoicePdfUrl: pdfUrl || undefined,
      fileUrl: pdfUrl || undefined
    });

    // 6. Emit real-time websockets updates
    emitWalletEvent(req, 'b2b:walletUpdated', `b2b:${txn.companyId}`, {
      balance: wallet.balance,
      totalTopup: wallet.totalTopup
    });
    emitWalletEvent(req, 'b2b:topupSuccess', `b2b:${txn.companyId}`, {
      transactionId,
      amount: txn.amount
    });
    try {
      require('../../services/notification/notificationOrchestrator.service').emitAsync('PAYMENT_SUCCESS', {
        targets: { b2bCompanyId: txn.companyId },
        data: {
          b2bCompanyId: String(txn.companyId),
          transactionId: String(txn._id),
          amount: txn.amount,
          balance: wallet.balance,
          paymentId: razorpayPaymentId,
          simulated
        }
      });
    } catch (_) { /* non-blocking */ }
    emitWalletEvent(req, 'admin:b2bWalletUpdated', 'admin', {
      companyId: txn.companyId,
      balance: wallet.balance
    });

    // Auto-activate pending_wallet jobs if balance now covers them
    let activation = null;
    try {
      activation = await activatePendingWalletJobs(txn.companyId, req.app);
      if (activation.activated > 0) {
        wallet = await B2BWallet.findOne({ companyId: txn.companyId });
      }
    } catch (actErr) {
      console.error('[B2B Topup] Pending activation failed (non-blocking):', actErr.message);
    }

    const gate = activation?.gate || (await getPendingWalletGate(txn.companyId));

    res.status(200).json({
      success: true,
      message: activation?.activated
        ? `Wallet credited. Activated ${activation.activated} pending job(s).`
        : 'Wallet balance successfully credited',
      wallet,
      activation,
      walletGate: gate,
      transaction: posted.transaction,
      /** True when the gateway is in test mode: demo money, never real revenue. */
      simulated
    });
  } catch (error) {
    console.error('B2B Verify Topup Error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify transaction payment' });
  }
};

/**
 * GET pending_wallet activation gate (balance vs pending batch cost)
 */
const getWalletActivationGate = async (req, res) => {
  try {
    const companyId = req.companyId;
    const gate = await getPendingWalletGate(companyId);
    res.status(200).json({ success: true, data: gate });
  } catch (error) {
    console.error('B2B Wallet Gate Error:', error);
    res.status(500).json({ success: false, message: 'Failed to compute wallet activation gate' });
  }
};

/**
 * POST manually activate pending_wallet jobs when funded
 */
const activatePendingJobs = async (req, res) => {
  try {
    const companyId = req.companyId;
    const result = await activatePendingWalletJobs(companyId, req.app);

    if (result.blocked) {
      return res.status(400).json({
        success: false,
        message: result.gate.message,
        data: result
      });
    }

    res.status(200).json({
      success: true,
      message: result.activated
        ? `Activated ${result.activated} job(s). Matching queued.`
        : 'No pending jobs to activate',
      data: result
    });
  } catch (error) {
    console.error('B2B Activate Pending Error:', error);
    res.status(500).json({ success: false, message: 'Failed to activate pending jobs' });
  }
};

/**
 * GET B2B Wallet Usage breakdown (For Donut charts)
 */
const getWalletUsageSummary = async (req, res) => {
  try {
    const companyId = req.companyId;
    const txns = await B2BWalletTransaction.find({ companyId, status: 'success' });

    let jobDeductions = 0;
    let refunds = 0;
    let adjustments = 0;

    txns.forEach(t => {
      if (t.type === 'job_deduction') jobDeductions += t.amount;
      else if (t.type === 'refund') refunds += t.amount;
      else if (t.type === 'adjustment') adjustments += t.amount;
    });

    res.status(200).json({
      success: true,
      data: {
        totalUsage: jobDeductions + refunds + adjustments,
        usage: [
          { name: 'Job Deductions', value: Math.abs(jobDeductions), color: '#10AFA5' },
          { name: 'Refunds', value: Math.abs(refunds), color: '#3B82F6' },
          { name: 'Adjustments', value: Math.abs(adjustments), color: '#F59E0B' }
        ]
      }
    });
  } catch (error) {
    console.error('B2B Usage Summary Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve usage stats' });
  }
};

/**
 * GET active Deduction Rule
 */
const getDeductionRule = async (req, res) => {
  try {
    const companyId = req.companyId;
    let rule = await B2BDeductionRule.findOne({ companyId, isActive: true });
    if (!rule) {
      rule = await B2BDeductionRule.create({ companyId, perJobCharge: 12, gstPercent: 18, isActive: true });
    }
    res.status(200).json({ success: true, data: rule });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET Saved Payment Methods
 */
const getPaymentMethods = async (req, res) => {
  try {
    const companyId = req.companyId;
    const methods = await B2BPaymentMethod.find({ companyId, isActive: true });
    res.status(200).json({ success: true, data: methods });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST Saved Payment Method
 */
const addPaymentMethod = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { type, label, maskedDetails } = req.body;

    const newMethod = await B2BPaymentMethod.create({
      companyId,
      type,
      label,
      maskedDetails,
      isPrimary: false
    });

    res.status(200).json({ success: true, data: newMethod });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE Saved Payment Method
 */
const deletePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const removed = await B2BPaymentMethod.findOneAndDelete({ _id: id, companyId: req.companyId });
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }
    res.status(200).json({ success: true, message: 'Payment method profile removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getWalletSummary,
  getWalletTransactions,
  exportWalletStatement,
  getWalletReconciliation,
  createTopupOrder,
  verifyTopupPayment,
  getWalletUsageSummary,
  getDeductionRule,
  getPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
  getWalletActivationGate,
  activatePendingJobs
};
