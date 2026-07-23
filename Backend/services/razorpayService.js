const Razorpay = require('razorpay');

// Initialize Razorpay with validation
let razorpay;
let isTestMode = true;

try {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('⚠️  Razorpay credentials missing in .env file');
  } else {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    // Check if we are in test or live mode
    isTestMode = process.env.RAZORPAY_KEY_ID.startsWith('rzp_test');
    console.log(`✅ Razorpay initialized in ${isTestMode ? 'TEST' : 'LIVE'} mode`);

    // MERCHANT_UPI_ID check removed as requested
  }
} catch (error) {
  console.error('❌ Failed to initialize Razorpay:', error.message);
}

/**
 * Create Razorpay order
 */
const createOrder = async (amount, currency = 'INR', receipt = null, notes = {}, extra = {}) => {
  try {
    if (!razorpay) {
      return {
        success: false,
        error: 'Razorpay not initialized. Please check credentials in .env file.'
      };
    }

    const options = {
      amount: Math.round(amount * 100),
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes: notes || {}
    };

    if (extra.customer_id) options.customer_id = extra.customer_id;
    if (extra.payment_capture !== undefined) options.payment_capture = extra.payment_capture;
    if (extra.method) options.method = extra.method;

    console.log('Creating Razorpay order with options:', {
      amount: options.amount,
      currency: options.currency,
      receipt: options.receipt,
      customer_id: options.customer_id || null
    });

    const order = await razorpay.orders.create(options);

    console.log('✅ Razorpay order created successfully:', order.id);

    return {
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      customerId: options.customer_id || null
    };
  } catch (error) {
    console.error('❌ Razorpay create order error:', {
      message: error.message,
      description: error.description,
      code: error.code,
      statusCode: error.statusCode,
      error: error.error
    });

    return {
      success: false,
      error: error.description || error.message || 'Failed to create Razorpay order'
    };
  }
};

/**
 * Verify payment signature (timing-safe)
 */
const verifyPayment = (razorpay_order_id, razorpay_payment_id, razorpay_signature) => {
  const crypto = require('crypto');
  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (!secret || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return false;
  }

  const generated_signature = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  try {
    const expected = Buffer.from(generated_signature);
    const actual = Buffer.from(String(razorpay_signature));
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
};

/**
 * Get payment details
 */
const getPaymentDetails = async (paymentId) => {
  try {
    if (!razorpay) {
      return { success: false, error: 'Razorpay not initialized' };
    }
    const payment = await razorpay.payments.fetch(paymentId);
    return {
      success: true,
      payment
    };
  } catch (error) {
    console.error('Razorpay get payment error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get order details (for reuse / status checks)
 */
const getOrderDetails = async (orderId) => {
  try {
    if (!razorpay) {
      return { success: false, error: 'Razorpay not initialized' };
    }
    const order = await razorpay.orders.fetch(orderId);
    return { success: true, order };
  } catch (error) {
    console.error('Razorpay get order error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Fetch payments for an order
 */
const getOrderPayments = async (orderId) => {
  try {
    if (!razorpay) {
      return { success: false, error: 'Razorpay not initialized' };
    }
    const result = await razorpay.orders.fetchPayments(orderId);
    return { success: true, payments: result.items || [] };
  } catch (error) {
    console.error('Razorpay fetch order payments error:', error);
    return { success: false, error: error.message, payments: [] };
  }
};

/**
 * Refund payment
 */
const refundPayment = async (paymentId, amount = null, notes = {}) => {
  try {
    const refundOptions = {
      payment_id: paymentId,
      notes
    };

    if (amount) {
      refundOptions.amount = Math.round(amount * 100); // Convert to paise
    }

    const refund = await razorpay.payments.refund(paymentId, refundOptions);
    return {
      success: true,
      refund
    };
  } catch (error) {
    console.error('Razorpay refund error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create Razorpay QR Code
 * Tries the modern standalone QR API first, then falls back to Payment Link if needed.
 */
const createQRCode = async (amount, bookingNumber, notes = {}) => {
  try {
    // Manual UPI QR block removed as requested
    
    if (!razorpay) {
      return { success: false, error: 'Razorpay not initialized' };
    }

    const axios = require('axios');
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');

    const payload = {
      type: 'upi_qr',
      name: 'Service Payment',
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: Math.round(amount * 100), // Convert to paise
      description: `Order Payment for ${bookingNumber}`,
      notes
    };

    console.log('[QR Service] Attempting Razorpay QR creation for Booking:', bookingNumber);

    // Razorpay SDK QR API
    try {
      const qrCode = await razorpay.qrCode.create(payload);
      console.log('✅ QR Code created via Razorpay SDK API');
      return {
        success: true,
        qrCodeId: qrCode.id,
        imageUrl: qrCode.image_url,
        qrStatus: qrCode.status
      };
    } catch (e1) {
      console.warn('⚠️ SDK QR API failed, trying REST fallbacks...', e1.description || e1.message);

      // Fallback 1: Manual API call to /v1/payments/qr_codes
      try {
        const response = await axios.post('https://api.razorpay.com/v1/payments/qr_codes', payload, {
          headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
        });
        const qrCode = response.data;
        return {
          success: true,
          qrCodeId: qrCode.id,
          imageUrl: qrCode.image_url,
          qrStatus: qrCode.status
        };
      } catch (e2) {
        // Fallback 2: /v1/qr_codes
        try {
          const response = await axios.post('https://api.razorpay.com/v1/qr_codes', payload, {
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
          });
          const qrCode = response.data;
          return {
            success: true,
            qrCodeId: qrCode.id,
            imageUrl: qrCode.image_url,
            qrStatus: qrCode.status
          };
        } catch (e3) {
          // Final Fallback: Payment Link
          const linkPayload = {
            amount: Math.round(amount * 100),
            currency: 'INR',
            description: `Payment for Booking #${bookingNumber}`,
            notes,
            notify: { sms: false, email: false }
          };

          const linkResponse = await axios.post('https://api.razorpay.com/v1/payment_links', linkPayload, {
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
          });

          const link = linkResponse.data;
          return {
            success: true,
            qrCodeId: link.id,
            imageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link.short_url)}`,
            paymentUrl: link.short_url,
          };
        }
      }
    }
  } catch (error) {
    console.error('Razorpay QR/Link Error:', error.response?.data || error.message);
    const errorMsg = error.response?.data?.error?.description || error.message;
    return { success: false, error: errorMsg };
  }
};

/**
 * Get payments for a QR Code or Payment Link
 */
const getQRCodePayments = async (id) => {
  try {
    if (!razorpay) {
      return { success: false, error: 'Razorpay not initialized' };
    }

    // Manual UPI check removed as requested
    if (id && (id.startsWith('plink_'))) {
      const axios = require('axios');
      const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');

      try {
        const response = await axios.get(`https://api.razorpay.com/v1/payment_links/${id}`, {
          headers: { 'Authorization': `Basic ${auth}` }
        });

        const link = response.data;
        console.log(`[QR Service] Checking Payment Link ${id} status: ${link.status}`);

        // If link is paid, we returned a captured payment object
        if (link.status === 'paid' || link.status === 'partially_paid') {
          return {
            success: true,
            payments: [{
              id: link.razorpay_payment_id || `pay_${Date.now()}`,
              status: 'captured',
              amount: link.amount_paid
            }]
          };
        }
        return { success: true, payments: [] };
      } catch (linkError) {
        console.error('Payment link fetch error:', linkError.response?.data || linkError.message);
        throw linkError;
      }
    }

    // Otherwise, standard QR Code check
    const payments = await razorpay.qrCode.fetchAllPayments(id);
    return {
      success: true,
      payments: payments.items || []
    };
  } catch (error) {
    console.error('Razorpay fetch payments error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

function getPublicKeyId() {
  return process.env.RAZORPAY_KEY_ID || null;
}

/**
 * Ensure Razorpay Customer for a user profile.
 */
const ensureCustomer = async ({ name, email, contact, failExistingId = null }) => {
  try {
    if (!razorpay) return { success: false, error: 'Razorpay not initialized' };
    if (failExistingId) {
      try {
        const existing = await razorpay.customers.fetch(failExistingId);
        if (existing?.id) return { success: true, customerId: existing.id, customer: existing };
      } catch (_) { /* recreate below */ }
    }

    const payload = {
      name: name || 'WBI User',
      contact: contact ? String(contact).replace(/\D/g, '').slice(-10) : undefined,
      email: email || undefined,
      fail_existing: 0
    };

    const customer = await razorpay.customers.create(payload);
    return { success: true, customerId: customer.id, customer };
  } catch (error) {
    // Razorpay returns existing customer id in some conflict cases
    const existingId = error?.error?.metadata?.customer_id || error?.metadata?.customer_id;
    if (existingId) return { success: true, customerId: existingId };
    console.error('[razorpay] ensureCustomer:', error.message || error);
    return { success: false, error: error.description || error.message };
  }
};

const createVerificationOrder = async ({ amount = 1, receipt, notes = {}, customerId }) => {
  return createOrder(
    amount,
    'INR',
    receipt || `verify_${Date.now()}`,
    { purpose: 'instrument_verify', ...notes },
    { customer_id: customerId }
  );
};

const fetchCustomerTokens = async (customerId) => {
  try {
    if (!razorpay) return { success: false, error: 'Razorpay not initialized', tokens: [] };
    const result = await razorpay.customers.fetchTokens(customerId);
    return { success: true, tokens: result.items || result || [] };
  } catch (error) {
    console.error('[razorpay] fetchCustomerTokens:', error.message);
    return { success: false, error: error.message, tokens: [] };
  }
};

const fetchToken = async (customerId, tokenId) => {
  try {
    if (!razorpay) return { success: false, error: 'Razorpay not initialized' };
    const token = await razorpay.customers.fetchToken(customerId, tokenId);
    return { success: true, token };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const deleteToken = async (customerId, tokenId) => {
  try {
    if (!razorpay) return { success: false, error: 'Razorpay not initialized' };
    await razorpay.customers.deleteToken(customerId, tokenId);
    return { success: true };
  } catch (error) {
    console.error('[razorpay] deleteToken:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Create a payment using a saved token (recurring / authorized).
 */
const createTokenPayment = async ({ amount, currency = 'INR', customerId, tokenId, orderId, email, contact, notes = {} }) => {
  try {
    if (!razorpay) return { success: false, error: 'Razorpay not initialized' };
    const axios = require('axios');
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const body = {
      amount: Math.round(Number(amount) * 100),
      currency,
      order_id: orderId,
      customer_id: customerId,
      token: tokenId,
      email: email || undefined,
      contact: contact || undefined,
      notes,
      recurring: '1'
    };
    const response = await axios.post('https://api.razorpay.com/v1/payments/create/recurring', body, {
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }
    });
    return { success: true, payment: response.data };
  } catch (error) {
    const msg = error.response?.data?.error?.description || error.message;
    console.error('[razorpay] createTokenPayment:', msg);
    return { success: false, error: msg };
  }
};

const verifyWebhookSignature = (rawBody, signature) => {
  const crypto = require('crypto');
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !rawBody || !signature) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

const fetchSettlements = async ({ count = 20, skip = 0 } = {}) => {
  try {
    if (!razorpay) return { success: false, error: 'Razorpay not initialized', items: [] };
    const axios = require('axios');
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await axios.get('https://api.razorpay.com/v1/settlements', {
      headers: { Authorization: `Basic ${auth}` },
      params: { count, skip }
    });
    return { success: true, items: response.data?.items || [] };
  } catch (error) {
    const msg = error.response?.data?.error?.description || error.message;
    return { success: false, error: msg, items: [] };
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getPaymentDetails,
  getOrderDetails,
  getOrderPayments,
  refundPayment,
  createQRCode,
  getQRCodePayments,
  ensureCustomer,
  createVerificationOrder,
  fetchCustomerTokens,
  fetchToken,
  deleteToken,
  createTokenPayment,
  verifyWebhookSignature,
  fetchSettlements,
  getPublicKeyId,
  isTestMode: () => isTestMode
};

