const mongoose = require('mongoose');
const { TXN_OPTS } = require('../utils/txnOptions');
const VendorFinanceDocument = require('../models/VendorFinanceDocument');
const VendorFinanceMilestone = require('../models/VendorFinanceMilestone');
const VendorFinanceReceivable = require('../models/VendorFinanceReceivable');
const VendorFinanceWallet = require('../models/VendorFinanceWallet');
const VendorFinanceTransaction = require('../models/VendorFinanceTransaction');
const VendorProposal = require('../models/VendorProposal');
const VendorContract = require('../models/VendorContract');
const VendorClient = require('../models/VendorClient');
const Vendor = require('../models/Vendor');
const Withdrawal = require('../models/Withdrawal');
const { postVendorFinanceLedger } = require('./vendorFinanceLedger.service');
const razorpayService = require('./razorpayService');
const socketService = require('./socket.service');

const emitFinance = (vendorId, event, payload = {}) => {
  try {
    socketService.emitToUser(String(vendorId), 'vendor', event, {
      ...payload,
      at: new Date().toISOString()
    });
    socketService.emitToUser(String(vendorId), 'vendor', 'finance:updated', {
      event,
      ...payload,
      at: new Date().toISOString()
    });
  } catch {
    // socket may not be ready in scripts/tests
  }
};

const calcTotals = (items = [], discount = 0, taxRate = 18) => {
  const normalized = items.map((item) => {
    const quantity = Number(item.quantity) || 1;
    const rate = Number(item.rate ?? item.unitPrice) || 0;
    return {
      description: item.description || 'Service',
      category: item.category || 'service',
      quantity,
      rate,
      amount: quantity * rate
    };
  });
  const subtotal = normalized.reduce((sum, item) => sum + item.amount, 0);
  const taxable = Math.max(0, subtotal - (Number(discount) || 0));
  const taxAmount = Math.round(taxable * ((Number(taxRate) || 0) / 100));
  return {
    items: normalized,
    subtotal,
    discount: Number(discount) || 0,
    taxRate: Number(taxRate) || 0,
    taxAmount,
    total: taxable + taxAmount
  };
};

async function resolveClientName(proposal) {
  if (proposal?.clientName) return proposal.clientName;
  if (proposal?.clientId) {
    const client = await VendorClient.findById(proposal.clientId).select('name companyName').lean();
    if (client) return client.companyName || client.name || 'Client';
  }
  return proposal?.title || 'Client';
}

/**
 * Sync Business Intake proposals → Finance quotations (idempotent).
 */
async function syncProposalsToFinance(vendorId) {
  const proposals = await VendorProposal.find({
    vendorId,
    status: { $in: ['sent', 'viewed', 'accepted', 'negotiating', 'rejected'] }
  }).lean();

  let created = 0;
  let updated = 0;

  for (const proposal of proposals) {
    const existing = await VendorFinanceDocument.findOne({
      vendorId,
      documentType: 'quotation',
      sourceProposalId: proposal._id
    });

    const clientName = await resolveClientName(proposal);
    const pricing = proposal.pricing || {};
    const totals = calcTotals(
      (pricing.lineItems || []).map((li) => ({
        description: li.description,
        quantity: li.quantity,
        rate: li.unitPrice,
        category: 'service'
      })),
      0,
      pricing.gstPercentage ?? 18
    );

    const statusMap = {
      draft: 'draft',
      sent: 'sent',
      viewed: 'sent',
      negotiating: 'negotiation',
      accepted: 'approved',
      rejected: 'rejected'
    };

    const payload = {
      vendorId,
      documentType: 'quotation',
      clientName,
      clientType: 'individual',
      projectName: proposal.title || '',
      projectCode: proposal.proposalCode || '',
      scope: proposal.coverLetter || '',
      items: totals.items,
      subtotal: totals.subtotal || pricing.subtotal || 0,
      discount: 0,
      taxRate: pricing.gstPercentage ?? 18,
      taxAmount: pricing.gstAmount ?? totals.taxAmount,
      total: pricing.totalAmount || totals.total,
      validUntil: pricing.validUntil || null,
      status: statusMap[proposal.status] || 'draft',
      sourceProposalId: proposal._id,
      convertedToProject: proposal.status === 'accepted'
    };

    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
      updated += 1;
    } else {
      await VendorFinanceDocument.create(payload);
      created += 1;
    }
  }

  return { created, updated, scanned: proposals.length };
}

/**
 * Sync active contracts → payment milestones + receivables (idempotent).
 */
async function syncContractsToFinance(vendorId) {
  const contracts = await VendorContract.find({
    vendorId,
    status: { $in: ['active', 'pending_signature'] }
  }).lean();

  let milestonesCreated = 0;
  let receivablesCreated = 0;

  for (const contract of contracts || []) {
    const projectCode = contract.contractCode || String(contract._id).slice(-8);
    const projectName = contract.title || projectCode;
    let clientName = 'Client';
    if (contract.clientId) {
      const client = await VendorClient.findById(contract.clientId).select('name companyName').lean();
      clientName = client?.companyName || client?.name || 'Client';
    }
    const total = Number(contract.value || 0);
    if (total <= 0) continue;

    const categoryCode = String(contract.serviceCategoryCode || '').toUpperCase();
    const categoryName = contract.serviceCategoryName || categoryCode;

    const plan = [
      { name: 'Advance', percentage: 30 },
      { name: 'Mid Project', percentage: 40 },
      { name: 'Final', percentage: 30 }
    ];

    for (let i = 0; i < plan.length; i += 1) {
      const row = plan[i];
      const pct = Number(row.percentage) || Math.round(100 / plan.length);
      const amount = Math.round((total * pct) / 100);
      const sequence = i + 1;
      const existing = await VendorFinanceMilestone.findOne({
        vendorId,
        projectCode,
        sequence,
        sourceContractId: contract._id
      });
      if (existing) continue;

      await VendorFinanceMilestone.create({
        vendorId,
        projectName,
        projectCode,
        clientName,
        serviceCategoryCode: categoryCode,
        serviceCategoryName: categoryName,
        name: row.name || `Milestone ${sequence}`,
        sequence,
        amount,
        percentage: pct,
        dueDate: new Date(Date.now() + sequence * 14 * 24 * 60 * 60 * 1000),
        status: sequence === 1 ? 'due' : 'upcoming',
        sourceContractId: contract._id
      });
      milestonesCreated += 1;
    }

    const recvExists = await VendorFinanceReceivable.findOne({
      vendorId,
      contractCode: projectCode,
      sourceContractId: contract._id
    });
    if (!recvExists) {
      await VendorFinanceReceivable.create({
        vendorId,
        clientType: 'b2b',
        clientName,
        projectName,
        projectCode,
        contractCode: projectCode,
        serviceCategoryCode: categoryCode,
        serviceCategoryName: categoryName,
        amount: total,
        paidAmount: 0,
        dueDate: contract.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'pending',
        sourceContractId: contract._id
      });
      receivablesCreated += 1;
    }
  }

  return { milestonesCreated, receivablesCreated, scanned: (contracts || []).length };
}

async function syncVendorFinance(vendorId) {
  const proposals = await syncProposalsToFinance(vendorId);
  const contracts = await syncContractsToFinance(vendorId);
  emitFinance(vendorId, 'finance:synced', { proposals, contracts });
  return { proposals, contracts };
}

/**
 * Convert approved quotation → project plan (milestones + receivable).
 */
async function convertQuotationToProject(vendorId, documentId) {
  const doc = await VendorFinanceDocument.findOne({
    _id: documentId,
    vendorId,
    documentType: 'quotation'
  });
  if (!doc) {
    const err = new Error('Quotation not found');
    err.status = 404;
    throw err;
  }
  if (doc.status !== 'approved') {
    const err = new Error('Only approved quotations can be converted');
    err.status = 400;
    throw err;
  }
  if (doc.convertedToProject) {
    return { document: doc, alreadyConverted: true };
  }

  const total = Number(doc.total) || 0;
  const projectCode = doc.projectCode || doc.documentCode;
  const plan = [
    { name: 'Advance Payment', percentage: 30, sequence: 1 },
    { name: 'Progress Payment', percentage: 40, sequence: 2 },
    { name: 'Final Payment', percentage: 30, sequence: 3 }
  ];

  const milestones = [];
  for (const row of plan) {
    const amount = Math.round((total * row.percentage) / 100);
    const ms = await VendorFinanceMilestone.create({
      vendorId,
      projectName: doc.projectName || doc.clientName,
      projectCode,
      clientName: doc.clientName,
      serviceCategoryCode: doc.serviceCategoryCode,
      serviceCategoryName: doc.serviceCategoryName,
      name: row.name,
      sequence: row.sequence,
      amount,
      percentage: row.percentage,
      dueDate: new Date(Date.now() + row.sequence * 14 * 24 * 60 * 60 * 1000),
      status: row.sequence === 1 ? 'due' : 'upcoming',
      sourceQuotationId: doc._id
    });
    milestones.push(ms);
  }

  await VendorFinanceReceivable.create({
    vendorId,
    clientType: doc.clientType || 'individual',
    clientName: doc.clientName,
    projectName: doc.projectName,
    projectCode,
    serviceCategoryCode: doc.serviceCategoryCode,
    serviceCategoryName: doc.serviceCategoryName,
    amount: total,
    paidAmount: 0,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: 'pending',
    sourceQuotationId: doc._id
  });

  doc.convertedToProject = true;
  await doc.save();
  emitFinance(vendorId, 'finance:quotationConverted', { documentId: doc._id, projectCode });
  return { document: doc, milestones };
}

/**
 * Generate a real tax invoice from an invoice_ready milestone.
 */
async function generateInvoiceFromMilestone(vendorId, milestoneId) {
  const milestone = await VendorFinanceMilestone.findOne({ _id: milestoneId, vendorId });
  if (!milestone) {
    const err = new Error('Milestone not found');
    err.status = 404;
    throw err;
  }
  if (!milestone.qaApproved || !milestone.clientApproved) {
    const err = new Error('QA and client approval are required before invoicing');
    err.status = 400;
    throw err;
  }
  if (milestone.invoiceDocumentId) {
    const existing = await VendorFinanceDocument.findById(milestone.invoiceDocumentId);
    return { invoice: existing, milestone, alreadyGenerated: true };
  }

  const vendor = await Vendor.findById(vendorId).select('gstNumber companyName').lean();
  const totals = calcTotals([
    {
      description: `${milestone.name} — ${milestone.projectName}`,
      quantity: 1,
      rate: milestone.amount,
      category: 'milestone'
    }
  ], 0, 18);

  const invoice = await VendorFinanceDocument.create({
    vendorId,
    documentType: 'invoice',
    invoiceType: 'milestone',
    clientName: milestone.clientName || 'Client',
    clientType: 'individual',
    projectName: milestone.projectName,
    projectCode: milestone.projectCode,
    serviceCategoryCode: milestone.serviceCategoryCode,
    serviceCategoryName: milestone.serviceCategoryName,
    scope: `Milestone invoice for ${milestone.milestoneCode}`,
    items: totals.items,
    subtotal: totals.subtotal,
    discount: 0,
    taxRate: totals.taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    gstNumber: vendor?.gstNumber || '',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: 'issued',
    paymentEligible: true,
    paidAmount: 0,
    sourceMilestoneId: milestone._id
  });

  await VendorFinanceReceivable.findOneAndUpdate(
    {
      vendorId,
      projectCode: milestone.projectCode,
      invoiceNumber: { $in: [null, '', milestone.invoiceNumber] }
    },
    {
      $set: {
        invoiceNumber: invoice.documentCode,
        amount: Math.max(totals.total, 0)
      },
      $setOnInsert: {
        vendorId,
        clientType: 'individual',
        clientName: milestone.clientName || 'Client',
        projectName: milestone.projectName,
        projectCode: milestone.projectCode,
        serviceCategoryCode: milestone.serviceCategoryCode,
        serviceCategoryName: milestone.serviceCategoryName,
        paidAmount: 0,
        dueDate: invoice.dueDate,
        status: 'pending',
        sourceMilestoneId: milestone._id
      }
    },
    { upsert: true, new: true }
  );

  milestone.invoiceNumber = invoice.documentCode;
  milestone.invoiceDocumentId = invoice._id;
  milestone.status = 'invoiced';
  await milestone.save();

  emitFinance(vendorId, 'finance:invoiceGenerated', {
    invoiceId: invoice._id,
    documentCode: invoice.documentCode,
    milestoneId: milestone._id
  });

  try {
    const { emitAsync } = require('./notification/notificationOrchestrator.service');
    emitAsync('invoice_generated', {
      targets: { vendorId },
      data: {
        invoiceId: invoice._id,
        invoiceNumber: invoice.documentCode,
        amount: invoice.total,
        message: `Invoice ${invoice.documentCode} for ₹${invoice.total} is ready.`,
        relatedId: invoice._id,
        relatedType: 'invoice'
      }
    });
  } catch (_) { /* non-blocking */ }

  return { invoice, milestone };
}

/**
 * Create Razorpay order for an issued finance invoice (client payment → escrow).
 */
async function createInvoicePaymentOrder(vendorId, invoiceId, { idempotencyKey } = {}) {
  const invoice = await VendorFinanceDocument.findOne({
    _id: invoiceId,
    vendorId,
    documentType: 'invoice'
  });
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  if (!['issued', 'partial', 'overdue'].includes(invoice.status)) {
    const err = new Error('Invoice is not payable in current status');
    err.status = 400;
    throw err;
  }

  const remaining = Math.max(0, Number(invoice.total) - Number(invoice.paidAmount || 0));
  if (remaining <= 0) {
    const err = new Error('Invoice is already paid');
    err.status = 400;
    throw err;
  }

  if (idempotencyKey && invoice.paymentIdempotencyKey === idempotencyKey && invoice.razorpayOrderId) {
    return {
      orderId: invoice.razorpayOrderId,
      amount: remaining,
      currency: 'INR',
      invoiceCode: invoice.documentCode,
      keyId: process.env.RAZORPAY_KEY_ID,
      reused: true
    };
  }

  const order = await razorpayService.createOrder(
    remaining,
    'INR',
    `fin_${String(invoice._id).slice(-10)}`,
    {
      vendorId: String(vendorId),
      invoiceId: String(invoice._id),
      documentCode: invoice.documentCode,
      purpose: 'vendor_finance_invoice'
    }
  );

  if (!order?.success || !order.orderId) {
    const err = new Error(order?.error || 'Failed to create Razorpay order');
    err.status = 502;
    throw err;
  }

  invoice.razorpayOrderId = order.orderId;
  if (idempotencyKey) invoice.paymentIdempotencyKey = idempotencyKey;
  await invoice.save();

  return {
    orderId: order.orderId,
    amount: remaining,
    currency: 'INR',
    invoiceCode: invoice.documentCode,
    keyId: process.env.RAZORPAY_KEY_ID,
    reused: false
  };
}

/**
 * Verify Razorpay payment → escrow hold + receivable update.
 */
async function verifyInvoicePayment(vendorId, {
  invoiceId,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature
}) {
  const valid = razorpayService.verifyPayment(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  );
  if (!valid) {
    const err = new Error('Invalid payment signature');
    err.status = 400;
    throw err;
  }

  const invoice = await VendorFinanceDocument.findOne({
    _id: invoiceId,
    vendorId,
    documentType: 'invoice'
  });
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }

  if (invoice.razorpayPaymentId === razorpay_payment_id) {
    return { invoice, duplicate: true };
  }

  const remaining = Math.max(0, Number(invoice.total) - Number(invoice.paidAmount || 0));
  invoice.paidAmount = Number(invoice.paidAmount || 0) + remaining;
  invoice.status = 'paid';
  invoice.razorpayPaymentId = razorpay_payment_id;
  invoice.razorpayOrderId = razorpay_order_id;
  invoice.paidAt = new Date();
  await invoice.save();

  // Escrow hold (not yet released to available wallet)
  await postVendorFinanceLedger({
    vendorId,
    type: 'escrow_hold',
    amount: remaining,
    description: `Client payment escrow for ${invoice.documentCode}`,
    projectCode: invoice.projectCode,
    referenceCode: invoice.documentCode,
    serviceCategoryCode: invoice.serviceCategoryCode,
    serviceCategoryName: invoice.serviceCategoryName,
    source: 'invoice_payment',
    walletInc: { escrowBalance: remaining, pendingSettlement: remaining }
  });

  try {
    // Soft escrow audit (EscrowLedger requires a Payment ref in other flows — skip if unavailable)
    if (mongoose.models.Payment) {
      /* optional future link */
    }
  } catch (escrowErr) {
    console.warn('[finance] Escrow audit skipped:', escrowErr.message);
  }

  await VendorFinanceReceivable.updateMany(
    { vendorId, invoiceNumber: invoice.documentCode },
    {
      $inc: { paidAmount: remaining },
      $set: { status: 'paid', paymentMethod: 'razorpay' }
    }
  );

  if (invoice.sourceMilestoneId) {
    await VendorFinanceMilestone.findByIdAndUpdate(invoice.sourceMilestoneId, {
      status: 'paid',
      paidAt: new Date()
    });
  }

  emitFinance(vendorId, 'finance:paymentReceived', {
    invoiceId: invoice._id,
    amount: remaining,
    paymentId: razorpay_payment_id
  });

  try {
    const { publishVendorNotification } = require('./vendorNotificationCenter.service');
    await publishVendorNotification({
      vendorId,
      type: 'payment_received',
      title: 'Payment received',
      message: `₹${remaining} received for invoice ${invoice.documentCode}. Funds held in escrow.`,
      module: 'finance',
      priority: 'high',
      relatedId: invoice._id,
      relatedType: 'invoice',
      actionUrl: 'finance/wallet',
      metadata: { amount: remaining, paymentId: razorpay_payment_id },
      category: 'payments'
    });
  } catch (_) { /* non-blocking */ }

  return { invoice, amount: remaining, duplicate: false };
}

/**
 * Release escrow for a paid invoice into available wallet (settlement).
 */
async function releaseInvoiceEscrow(vendorId, invoiceId, { commissionRate = 5, tdsRate = 0 } = {}) {
  const invoice = await VendorFinanceDocument.findOne({
    _id: invoiceId,
    vendorId,
    documentType: 'invoice',
    status: 'paid'
  });
  if (!invoice) {
    const err = new Error('Paid invoice not found');
    err.status = 404;
    throw err;
  }
  if (invoice.escrowReleased) {
    return { invoice, alreadyReleased: true };
  }

  const gross = Number(invoice.paidAmount || invoice.total) || 0;
  const commission = Math.round((gross * Number(commissionRate)) / 100);
  const tds = Math.round((gross * Number(tdsRate)) / 100);
  const net = Math.max(0, gross - commission - tds);

  // Move out of escrow
  await postVendorFinanceLedger({
    vendorId,
    type: 'escrow_release',
    amount: net,
    description: `Escrow release ${invoice.documentCode}`,
    projectCode: invoice.projectCode,
    referenceCode: invoice.documentCode,
    serviceCategoryCode: invoice.serviceCategoryCode,
    serviceCategoryName: invoice.serviceCategoryName,
    source: 'escrow_release',
    walletInc: {
      escrowBalance: -gross,
      pendingSettlement: -gross,
      availableBalance: net,
      totalEarnings: net,
      commissionDeducted: commission
    }
  });

  if (commission > 0) {
    await new VendorFinanceTransaction({
      vendorId,
      type: 'commission',
      amount: commission,
      description: `Platform commission ${commissionRate}% on ${invoice.documentCode}`,
      referenceCode: invoice.documentCode,
      serviceCategoryCode: invoice.serviceCategoryCode,
      source: 'commission',
      status: 'completed',
      balanceAfter: (await VendorFinanceWallet.findOne({ vendorId }).lean())?.availableBalance || 0,
      occurredAt: new Date()
    }).save();
  }

  invoice.escrowReleased = true;
  invoice.commissionAmount = commission;
  invoice.tdsAmount = tds;
  invoice.netSettledAmount = net;
  await invoice.save();

  emitFinance(vendorId, 'finance:escrowReleased', { invoiceId: invoice._id, net });

  try {
    const { emitAsync } = require('./notification/notificationOrchestrator.service');
    emitAsync('payment_released', {
      targets: { vendorId },
      data: {
        paymentId: invoice._id,
        invoiceId: invoice._id,
        amount: net,
        message: `₹${net} released to your available wallet from invoice ${invoice.documentCode}.`,
        relatedId: invoice._id,
        relatedType: 'invoice'
      }
    });
  } catch (_) { /* non-blocking */ }

  return { invoice, gross, commission, tds, net };
}

/**
 * Production withdrawal: hold finance wallet + create Withdrawal for admin/bank payout.
 */
async function requestFinanceWithdrawal(vendorId, {
  amount,
  bankDetails = {},
  categoryCode = '',
  notes = ''
}) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    const err = new Error('Valid withdrawal amount is required');
    err.status = 400;
    throw err;
  }

  const vendor = await Vendor.findById(vendorId).select('bankDetails companyName');
  const wallet = await VendorFinanceWallet.findOne({ vendorId });
  if (!wallet || wallet.availableBalance < amt) {
    const err = new Error('Insufficient available balance');
    err.status = 400;
    throw err;
  }

  const session = await mongoose.startSession();
  session.startTransaction(TXN_OPTS);
  try {
    wallet.availableBalance -= amt;
    wallet.processingWithdrawal = (wallet.processingWithdrawal || 0) + amt;
    await wallet.save({ session });

    const txn = await new VendorFinanceTransaction({
      vendorId,
      type: 'withdrawal',
      amount: amt,
      description: notes || 'Bank withdrawal request',
      balanceAfter: wallet.availableBalance,
      status: 'processing',
      serviceCategoryCode: categoryCode ? String(categoryCode).toUpperCase() : '',
      source: 'withdrawal',
      occurredAt: new Date()
    }).save({ session });

    const bank = {
      accountNumber: bankDetails.accountNumber || vendor?.bankDetails?.accountNumber || '',
      ifscCode: bankDetails.ifscCode || vendor?.bankDetails?.ifscCode || '',
      accountHolderName:
        bankDetails.accountHolderName ||
        vendor?.bankDetails?.accountHolderName ||
        vendor?.companyName ||
        '',
      bankName: bankDetails.bankName || vendor?.bankDetails?.bankName || '',
      upiId: bankDetails.upiId || vendor?.bankDetails?.upiId || ''
    };

    const [withdrawal] = await Withdrawal.create([{
      vendorId,
      amount: amt,
      status: 'pending',
      bankDetails: bank,
      adminNotes: `Finance txn ${txn.transactionCode || txn._id}`,
      netAmount: amt
    }], { session });

    txn.referenceCode = String(withdrawal._id);
    await txn.save({ session });

    await session.commitTransaction();
    emitFinance(vendorId, 'finance:withdrawalRequested', {
      withdrawalId: withdrawal._id,
      amount: amt
    });
    return { wallet, transaction: txn, withdrawal };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * CSV ledger export (no dummy rows).
 */
async function exportLedgerCsv(vendorId, { category, status, search } = {}) {
  const filter = { vendorId };
  if (category) filter.serviceCategoryCode = String(category).toUpperCase();
  if (status) filter.status = status;
  if (search) {
    const term = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { transactionCode: term },
      { description: term },
      { referenceCode: term },
      { projectCode: term }
    ];
  }

  const rows = await VendorFinanceTransaction.find(filter).sort({ occurredAt: -1 }).limit(5000).lean();
  const header = [
    'transactionCode',
    'type',
    'amount',
    'status',
    'description',
    'referenceCode',
    'projectCode',
    'serviceCategoryCode',
    'balanceAfter',
    'occurredAt'
  ];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.transactionCode,
      row.type,
      row.amount,
      row.status,
      row.description,
      row.referenceCode,
      row.projectCode,
      row.serviceCategoryCode,
      row.balanceAfter,
      row.occurredAt ? new Date(row.occurredAt).toISOString() : ''
    ].map(escape).join(','));
  }
  return lines.join('\n');
}

/**
 * Simple HTML invoice printable payload.
 */
async function getInvoiceHtml(vendorId, documentId) {
  const doc = await VendorFinanceDocument.findOne({ _id: documentId, vendorId }).lean();
  if (!doc) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  const vendor = await Vendor.findById(vendorId).select('companyName gstNumber email phone address').lean();
  const lines = (doc.items || [])
    .map(
      (item) =>
        `<tr><td>${item.description}</td><td>${item.quantity}</td><td>₹${item.rate}</td><td>₹${item.amount}</td></tr>`
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${doc.documentCode}</title>
  <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin-top:16px}
  th,td{border:1px solid #ddd;padding:8px;text-align:left}h1{margin:0}</style></head><body>
  <h1>${doc.documentType === 'invoice' ? 'TAX INVOICE' : 'QUOTATION'} — ${doc.documentCode}</h1>
  <p><strong>${vendor?.companyName || 'Vendor'}</strong><br/>GST: ${doc.gstNumber || vendor?.gstNumber || '—'}<br/>
  ${vendor?.email || ''} ${vendor?.phone || ''}</p>
  <p><strong>Bill To:</strong> ${doc.clientName}<br/>Project: ${doc.projectName || '—'} (${doc.projectCode || '—'})</p>
  <table><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
  <tbody>${lines}</tbody></table>
  <p style="margin-top:16px">Subtotal: ₹${doc.subtotal || 0}<br/>Tax (${doc.taxRate || 0}%): ₹${doc.taxAmount || 0}<br/>
  <strong>Total: ₹${doc.total || 0}</strong></p>
  <p>Status: ${doc.status} ${doc.paidAt ? `| Paid: ${new Date(doc.paidAt).toLocaleString('en-IN')}` : ''}</p>
  </body></html>`;
}

module.exports = {
  emitFinance,
  syncVendorFinance,
  syncProposalsToFinance,
  syncContractsToFinance,
  convertQuotationToProject,
  generateInvoiceFromMilestone,
  createInvoicePaymentOrder,
  verifyInvoicePayment,
  releaseInvoiceEscrow,
  requestFinanceWithdrawal,
  exportLedgerCsv,
  getInvoiceHtml,
  calcTotals
};
