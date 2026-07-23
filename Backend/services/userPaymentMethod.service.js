const crypto = require('crypto');
const User = require('../models/User');
const Booking = require('../models/Booking');
const UserPaymentMethod = require('../models/UserPaymentMethod');
const PaymentMethodConfig = require('../models/PaymentMethodConfig');
const PaymentAuditLog = require('../models/PaymentAuditLog');
const razorpayService = require('./razorpayService');
const { encryptToken, decryptToken, hashVpa, maskVpa } = require('../utils/paymentTokenCrypto');
const { getRedis, isRedisConnected } = require('./redisService');
const {
  generateOTP,
  hashOTP,
  storeOTP,
  verifyOTP,
  checkRateLimit
} = require('../utils/redisOtp.util');
const { sendOTP: sendOtpSms } = require('./smsService');

const VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

function logMetric(event, fields = {}) {
  console.log(`[payment.${event}]`, JSON.stringify(fields));
}

async function writeAudit({ actorRole, actorId, action, userId, targetType, targetId, meta, req }) {
  try {
    await PaymentAuditLog.create({
      actorRole,
      actorId: actorId || null,
      action,
      userId: userId || null,
      targetType: targetType || null,
      targetId: targetId ? String(targetId) : null,
      meta: meta || {},
      ip: req?.ip || null,
      userAgent: req?.headers?.['user-agent'] || null
    });
  } catch (e) {
    console.warn('[payment.audit]', e.message);
  }
}

async function getPublicConfig() {
  const cfg = await PaymentMethodConfig.getOrCreate();
  const keyId = razorpayService.getPublicKeyId() || cfg.gateway?.publicKeyId;
  return {
    gateway: {
      provider: cfg.gateway?.provider || 'razorpay',
      keyId,
      testMode: razorpayService.isTestMode(),
      verificationAmount: cfg.gateway?.verificationAmount ?? 1,
      verificationNote:
        cfg.cod?.verificationNote ||
        'We will debit ₹1 to verify a new payment method. This will be refunded after verification.'
    },
    methods: (cfg.methods || [])
      .filter((m) => m.enabled)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((m) => ({
        key: m.key,
        label: m.label,
        sortOrder: m.sortOrder,
        minAmount: m.minAmount,
        maxAmount: m.maxAmount,
        metadata: m.metadata || {}
      })),
    cod: {
      enabled: cfg.cod?.enabled !== false && (cfg.methods || []).some((m) => m.key === 'cod' && m.enabled),
      minOrderAmount: cfg.cod?.minOrderAmount || 0,
      maxOrderAmount: cfg.cod?.maxOrderAmount ?? null,
      allowedCities: cfg.cod?.allowedCities || [],
      allowedCategories: cfg.cod?.allowedCategories || [],
      verificationNote: cfg.cod?.verificationNote
    },
    onlineEnabled: (cfg.methods || []).some((m) =>
      ['upi', 'card', 'netbanking', 'wallet'].includes(m.key) && m.enabled
    )
  };
}

async function ensureUserCustomer(user) {
  if (user.razorpayCustomerId) {
    const check = await razorpayService.ensureCustomer({
      name: user.name,
      email: user.email,
      contact: user.phone,
      failExistingId: user.razorpayCustomerId
    });
    if (check.success) {
      if (check.customerId !== user.razorpayCustomerId) {
        user.razorpayCustomerId = check.customerId;
        await user.save();
      }
      return user.razorpayCustomerId;
    }
  }

  const created = await razorpayService.ensureCustomer({
    name: user.name,
    email: user.email,
    contact: user.phone
  });
  if (!created.success) throw new Error(created.error || 'Failed to create Razorpay customer');
  user.razorpayCustomerId = created.customerId;
  await user.save();
  return created.customerId;
}

async function checkVelocity(userId) {
  const cfg = await PaymentMethodConfig.getOrCreate();
  const limit = cfg.fraud?.velocityLimitPerHour || 20;
  if (!isRedisConnected()) return true;
  try {
    const redis = getRedis();
    const key = `pay:velocity:${userId}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 3600);
    return n <= limit;
  } catch {
    return true;
  }
}

function mapMethodFromPayment(payment) {
  const method = payment.method || 'card';
  if (method === 'upi' || payment.vpa) {
    const vpa = payment.vpa || payment.upi?.vpa || '';
    return {
      type: 'upi',
      maskedDisplay: vpa ? maskVpa(vpa) : 'UPI',
      vpa,
      bank: payment.bank || null
    };
  }
  if (method === 'netbanking') {
    return {
      type: 'netbanking',
      maskedDisplay: payment.bank ? `${payment.bank} Net Banking` : 'Net Banking',
      bank: payment.bank || null
    };
  }
  if (method === 'wallet') {
    return {
      type: 'wallet',
      maskedDisplay: payment.wallet || 'Wallet',
      walletProvider: payment.wallet || null
    };
  }
  const last4 = payment.card?.last4 || payment.card?.last_4 || null;
  return {
    type: 'card',
    maskedDisplay: last4 ? `**** ${last4}` : 'Card',
    last4,
    network: payment.card?.network || null,
    bank: payment.card?.issuer || payment.bank || null,
    expiryMonth: payment.card?.expiry_month ? String(payment.card.expiry_month) : null,
    expiryYear: payment.card?.expiry_year ? String(payment.card.expiry_year) : null
  };
}

function toPublicMethod(doc) {
  return {
    id: String(doc._id),
    type: doc.type,
    maskedDisplay: doc.maskedDisplay,
    network: doc.network,
    bank: doc.bank,
    walletProvider: doc.walletProvider,
    last4: doc.last4,
    expiryMonth: doc.expiryMonth,
    expiryYear: doc.expiryYear,
    isDefault: !!doc.isDefault,
    isVerified: !!doc.isVerified,
    status: doc.status,
    lastUsedAt: doc.lastUsedAt,
    createdAt: doc.createdAt
  };
}

async function listMethods(userId) {
  const methods = await UserPaymentMethod.find({
    userId,
    deletedAt: null,
    status: { $ne: 'disabled' }
  })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
  return methods.map(toPublicMethod);
}

async function startInstrument(userId, { methodType = 'card' } = {}, req) {
  const allowed = await getPublicConfig();
  const keyMap = { card: 'card', upi: 'upi', netbanking: 'netbanking', wallet: 'wallet' };
  const catalogKey = keyMap[methodType] || methodType;
  if (!allowed.methods.some((m) => m.key === catalogKey)) {
    const err = new Error(`${catalogKey} payments are disabled`);
    err.status = 400;
    throw err;
  }

  if (!(await checkVelocity(userId))) {
    const err = new Error('Too many payment attempts. Try again later.');
    err.status = 429;
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const customerId = await ensureUserCustomer(user);
  const amount = allowed.gateway.verificationAmount || 1;
  const order = await razorpayService.createVerificationOrder({
    amount,
    receipt: `iv_${String(userId).slice(-6)}_${Date.now()}`.slice(0, 40),
    notes: {
      purpose: 'instrument_verify',
      userId: String(userId),
      methodType
    },
    customerId
  });

  if (!order.success) {
    const err = new Error(order.error || 'Failed to start verification');
    err.status = 502;
    throw err;
  }

  await writeAudit({
    actorRole: 'user',
    actorId: userId,
    userId,
    action: 'instrument_start',
    meta: { methodType, orderId: order.orderId },
    req
  });
  logMetric('instrument_start', { userId: String(userId), methodType, orderId: order.orderId });

  return {
    orderId: order.orderId,
    amount: order.amount / 100,
    currency: order.currency || 'INR',
    keyId: allowed.gateway.keyId,
    customerId,
    methodType,
    save: true,
    prefill: {
      name: user.name,
      email: user.email || undefined,
      contact: user.phone || undefined
    },
    notes: {
      purpose: 'instrument_verify',
      userId: String(userId),
      methodType
    },
    verificationNote: allowed.gateway.verificationNote
  };
}

async function confirmInstrument(userId, payload, req) {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    methodType
  } = payload;

  if (!razorpayService.verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    const err = new Error('Invalid payment signature');
    err.status = 400;
    throw err;
  }

  const existing = await UserPaymentMethod.findOne({
    verificationPaymentId: razorpay_payment_id,
    deletedAt: null
  });
  if (existing) {
    return { method: toPublicMethod(existing), idempotent: true };
  }

  const details = await razorpayService.getPaymentDetails(razorpay_payment_id);
  if (!details.success || !details.payment) {
    const err = new Error(details.error || 'Unable to fetch payment');
    err.status = 502;
    throw err;
  }

  const payment = details.payment;
  if (!['captured', 'authorized'].includes(payment.status)) {
    const err = new Error(`Payment status is ${payment.status}`);
    err.status = 400;
    throw err;
  }

  const mapped = mapMethodFromPayment(payment);
  const type = methodType && ['upi', 'card', 'netbanking', 'wallet'].includes(methodType)
    ? methodType
    : mapped.type;

  let tokenId = payment.token_id || payment.token || null;
  const customerId = payment.customer_id || null;

  if (!tokenId && customerId) {
    const tokens = await razorpayService.fetchCustomerTokens(customerId);
    const match = (tokens.tokens || []).find((t) => {
      if (type === 'card' && t.card) {
        return String(t.card.last4 || t.card.last_4) === String(mapped.last4);
      }
      if (type === 'upi' && (t.vpa || t.upi)) {
        return true;
      }
      return t.method === type;
    });
    if (match) tokenId = match.id;
    else if (tokens.tokens?.length === 1) tokenId = tokens.tokens[0].id;
  }

  const count = await UserPaymentMethod.countDocuments({ userId, deletedAt: null, status: 'active' });

  const doc = await UserPaymentMethod.create({
    userId,
    type,
    razorpayCustomerId: customerId,
    razorpayTokenId: tokenId ? encryptToken(tokenId) : null,
    vpaHash: mapped.vpa ? hashVpa(mapped.vpa) : null,
    maskedDisplay: mapped.maskedDisplay,
    network: mapped.network || null,
    bank: mapped.bank || null,
    walletProvider: mapped.walletProvider || null,
    last4: mapped.last4 || null,
    expiryMonth: mapped.expiryMonth || null,
    expiryYear: mapped.expiryYear || null,
    isDefault: count === 0,
    isVerified: true,
    status: 'active',
    verificationPaymentId: razorpay_payment_id,
    verificationOrderId: razorpay_order_id,
    metadata: {
      method: payment.method,
      amount: payment.amount
    }
  });

  // Auto-refund verification charge
  let refundId = null;
  try {
    const refund = await razorpayService.refundPayment(razorpay_payment_id, null, {
      purpose: 'instrument_verify_refund',
      userId: String(userId)
    });
    if (refund.success) {
      refundId = refund.refund?.id || null;
      doc.verificationRefundId = refundId;
      await doc.save();
    }
  } catch (e) {
    console.warn('[payment.instrument] refund failed:', e.message);
  }

  await writeAudit({
    actorRole: 'user',
    actorId: userId,
    userId,
    action: 'instrument_confirm',
    targetType: 'UserPaymentMethod',
    targetId: doc._id,
    meta: { type, paymentId: razorpay_payment_id, refundId },
    req
  });
  logMetric('instrument_confirm', { userId: String(userId), type, methodId: String(doc._id) });

  emitUserPayment(userId, { type: 'instrument_added', method: toPublicMethod(doc) });

  return { method: toPublicMethod(doc), refundId, idempotent: false };
}

async function verifyUpi(userId, { vpa }, req) {
  const cleaned = String(vpa || '').trim().toLowerCase();
  if (!VPA_REGEX.test(cleaned)) {
    const err = new Error('Invalid UPI ID format');
    err.status = 400;
    throw err;
  }

  const cfg = await getPublicConfig();
  if (!cfg.methods.some((m) => m.key === 'upi')) {
    const err = new Error('UPI is disabled');
    err.status = 400;
    throw err;
  }

  const vpaH = hashVpa(cleaned);
  const existing = await UserPaymentMethod.findOne({ userId, vpaHash: vpaH, deletedAt: null });
  if (existing) return { method: toPublicMethod(existing), idempotent: true };

  const count = await UserPaymentMethod.countDocuments({ userId, deletedAt: null, status: 'active' });
  const doc = await UserPaymentMethod.create({
    userId,
    type: 'upi',
    vpaHash: vpaH,
    maskedDisplay: maskVpa(cleaned),
    isDefault: count === 0,
    isVerified: true,
    status: 'active',
    metadata: { source: 'manual_vpa' }
  });

  await writeAudit({
    actorRole: 'user',
    actorId: userId,
    userId,
    action: 'upi_verify',
    targetType: 'UserPaymentMethod',
    targetId: doc._id,
    meta: { masked: maskVpa(cleaned) },
    req
  });

  emitUserPayment(userId, { type: 'instrument_added', method: toPublicMethod(doc) });
  return { method: toPublicMethod(doc), idempotent: false };
}

async function setDefault(userId, methodId, { otp } = {}, req) {
  await assertSensitiveOtp(userId, otp);
  const method = await UserPaymentMethod.findOne({
    _id: methodId,
    userId,
    deletedAt: null,
    status: 'active'
  });
  if (!method) {
    const err = new Error('Payment method not found');
    err.status = 404;
    throw err;
  }

  await UserPaymentMethod.updateMany({ userId, deletedAt: null }, { $set: { isDefault: false } });
  method.isDefault = true;
  await method.save();

  await writeAudit({
    actorRole: 'user',
    actorId: userId,
    userId,
    action: 'instrument_default',
    targetType: 'UserPaymentMethod',
    targetId: method._id,
    req
  });

  emitUserPayment(userId, { type: 'instrument_default', methodId: String(method._id) });
  return toPublicMethod(method);
}

async function deleteMethod(userId, methodId, { otp } = {}, req) {
  await assertSensitiveOtp(userId, otp);
  const method = await UserPaymentMethod.findOne({ _id: methodId, userId, deletedAt: null }).select(
    '+razorpayTokenId'
  );
  if (!method) {
    const err = new Error('Payment method not found');
    err.status = 404;
    throw err;
  }

  if (method.razorpayTokenId && method.razorpayCustomerId) {
    try {
      const token = decryptToken(method.razorpayTokenId);
      await razorpayService.deleteToken(method.razorpayCustomerId, token);
    } catch (e) {
      console.warn('[payment.delete] token delete:', e.message);
    }
  }

  const wasDefault = method.isDefault;
  method.deletedAt = new Date();
  method.status = 'disabled';
  method.isDefault = false;
  await method.save();

  if (wasDefault) {
    const next = await UserPaymentMethod.findOne({ userId, deletedAt: null, status: 'active' }).sort({
      createdAt: -1
    });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }

  await writeAudit({
    actorRole: 'user',
    actorId: userId,
    userId,
    action: 'instrument_delete',
    targetType: 'UserPaymentMethod',
    targetId: method._id,
    req
  });

  emitUserPayment(userId, { type: 'instrument_deleted', methodId: String(method._id) });
  return { success: true };
}

async function setCodPreference(userId, { enabled }, req) {
  const cfg = await getPublicConfig();
  if (enabled && !cfg.cod.enabled) {
    const err = new Error('Cash on Delivery is not available');
    err.status = 400;
    throw err;
  }

  let doc = await UserPaymentMethod.findOne({
    userId,
    type: 'cod_preference',
    deletedAt: null
  });

  if (!doc) {
    doc = await UserPaymentMethod.create({
      userId,
      type: 'cod_preference',
      maskedDisplay: 'Cash / UPI on Delivery',
      isVerified: true,
      status: enabled ? 'active' : 'disabled',
      isDefault: false,
      metadata: { preferred: !!enabled }
    });
  } else {
    doc.status = enabled ? 'active' : 'disabled';
    doc.metadata = { ...(doc.metadata || {}), preferred: !!enabled };
    await doc.save();
  }

  await writeAudit({
    actorRole: 'user',
    actorId: userId,
    userId,
    action: 'cod_preference',
    targetType: 'UserPaymentMethod',
    targetId: doc._id,
    meta: { enabled: !!enabled },
    req
  });

  return toPublicMethod(doc);
}

async function sendSensitiveOtp(userId) {
  const user = await User.findById(userId).select('phone');
  if (!user?.phone) {
    const err = new Error('Phone number required for verification');
    err.status = 400;
    throw err;
  }
  const phone = String(user.phone).replace(/\D/g, '').slice(-10);
  if (!(await checkRateLimit(`pay:${phone}`))) {
    const err = new Error('OTP rate limit exceeded');
    err.status = 429;
    throw err;
  }
  const otp = generateOTP(phone);
  await storeOTP(`paymeth:${userId}`, hashOTP(otp));
  await sendOtpSms(phone, otp);
  logMetric('sensitive_otp_sent', { userId: String(userId) });
  return { success: true, message: 'OTP sent', expiresIn: 300 };
}

async function assertSensitiveOtp(userId, otp) {
  if (process.env.PAYMENT_SENSITIVE_OTP === 'false') return true;
  if (!otp) {
    const err = new Error('OTP required for this action');
    err.status = 403;
    err.code = 'OTP_REQUIRED';
    throw err;
  }
  const result = await verifyOTP(`paymeth:${userId}`, otp);
  if (!result?.success) {
    const err = new Error(result?.message || 'Invalid OTP');
    err.status = 403;
    throw err;
  }
  return true;
}

async function getHistory(userId, { page = 1, limit = 20 } = {}) {
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [bookings, total] = await Promise.all([
    Booking.find({ userId })
      .select(
        'bookingNumber finalAmount paymentMethod paymentStatus razorpayPaymentId razorpayOrderId createdAt status serviceName'
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    Booking.countDocuments({ userId })
  ]);

  const items = bookings.map((b) => ({
    id: String(b._id),
    source: 'booking',
    title: b.serviceName || b.bookingNumber,
    bookingNumber: b.bookingNumber,
    amount: b.finalAmount,
    paymentMethod: b.paymentMethod,
    paymentStatus: b.paymentStatus,
    razorpayPaymentId: b.razorpayPaymentId || null,
    createdAt: b.createdAt,
    canRetry: ['failed', 'pending', 'Pending'].includes(b.paymentStatus) && b.status !== 'cancelled',
    canReceipt: ['success', 'Success', 'paid', 'Paid', 'captured'].includes(
      String(b.paymentStatus || '').toLowerCase()
    ) || !!b.razorpayPaymentId
  }));

  return {
    items,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / parseInt(limit, 10)) || 1
    }
  };
}

async function getReceipt(userId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!booking) {
    const err = new Error('Transaction not found');
    err.status = 404;
    throw err;
  }

  let gateway = null;
  if (booking.razorpayPaymentId) {
    const det = await razorpayService.getPaymentDetails(booking.razorpayPaymentId);
    if (det.success) gateway = {
      id: det.payment.id,
      method: det.payment.method,
      status: det.payment.status,
      amount: det.payment.amount / 100,
      created_at: det.payment.created_at
    };
  }

  return {
    receiptNumber: `RCP-${booking.bookingNumber || booking._id}`,
    bookingNumber: booking.bookingNumber,
    amount: booking.finalAmount,
    paymentMethod: booking.paymentMethod,
    paymentStatus: booking.paymentStatus,
    paidAt: booking.updatedAt || booking.createdAt,
    gateway,
    html: buildReceiptHtml(booking, gateway)
  };
}

function buildReceiptHtml(booking, gateway) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${booking.bookingNumber}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px;border-bottom:1px solid #eee}</style>
</head><body>
<h1>Payment Receipt</h1>
<p>WBI Services</p>
<table>
<tr><td>Receipt</td><td>RCP-${booking.bookingNumber || booking._id}</td></tr>
<tr><td>Booking</td><td>${booking.bookingNumber || '—'}</td></tr>
<tr><td>Amount</td><td>₹${Number(booking.finalAmount || 0).toLocaleString('en-IN')}</td></tr>
<tr><td>Method</td><td>${booking.paymentMethod || gateway?.method || '—'}</td></tr>
<tr><td>Status</td><td>${booking.paymentStatus || gateway?.status || '—'}</td></tr>
<tr><td>Payment ID</td><td>${booking.razorpayPaymentId || gateway?.id || '—'}</td></tr>
</table>
</body></html>`;
}

async function retryFailedPayment(userId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, userId });
  if (!booking) {
    const err = new Error('Booking not found');
    err.status = 404;
    throw err;
  }
  const status = String(booking.paymentStatus || '').toLowerCase();
  if (['success', 'paid', 'captured'].includes(status)) {
    const err = new Error('Payment already completed');
    err.status = 400;
    throw err;
  }

  const user = await User.findById(userId);
  const customerId = user ? await ensureUserCustomer(user).catch(() => null) : null;
  const order = await razorpayService.createOrder(
    booking.finalAmount,
    'INR',
    booking.bookingNumber,
    {
      bookingId: String(booking._id),
      userId: String(userId),
      purpose: 'booking_retry'
    },
    customerId ? { customer_id: customerId } : {}
  );
  if (!order.success) {
    const err = new Error(order.error || 'Failed to create retry order');
    err.status = 502;
    throw err;
  }
  booking.razorpayOrderId = order.orderId;
  booking.paymentStatus = 'pending';
  await booking.save();

  const def = await UserPaymentMethod.findOne({
    userId,
    isDefault: true,
    deletedAt: null,
    status: 'active'
  }).select('+razorpayTokenId');

  return {
    orderId: order.orderId,
    amount: order.amount / 100,
    currency: order.currency,
    keyId: razorpayService.getPublicKeyId(),
    customerId,
    defaultMethodId: def ? String(def._id) : null,
    bookingId: String(booking._id)
  };
}

/**
 * Resolve a saved method for checkout charge (token path when available).
 */
async function getMethodForCharge(userId, paymentMethodId) {
  if (!paymentMethodId) return null;
  const method = await UserPaymentMethod.findOne({
    _id: paymentMethodId,
    userId,
    deletedAt: null,
    status: 'active'
  }).select('+razorpayTokenId');
  if (!method) return null;
  let tokenId = null;
  try {
    tokenId = method.razorpayTokenId ? decryptToken(method.razorpayTokenId) : null;
  } catch (_) {
    tokenId = null;
  }
  return {
    id: String(method._id),
    type: method.type,
    customerId: method.razorpayCustomerId,
    tokenId,
    maskedDisplay: method.maskedDisplay
  };
}

function emitUserPayment(userId, payload) {
  try {
    if (global.io) {
      global.io.to(`user:${userId}`).emit('payment:update', payload);
      global.io.to(`user-${userId}`).emit('payment:update', payload);
    }
  } catch (_) { /* ignore */ }
}

module.exports = {
  getPublicConfig,
  listMethods,
  startInstrument,
  confirmInstrument,
  verifyUpi,
  setDefault,
  deleteMethod,
  setCodPreference,
  sendSensitiveOtp,
  getHistory,
  getReceipt,
  retryFailedPayment,
  getMethodForCharge,
  ensureUserCustomer,
  writeAudit,
  toPublicMethod
};
