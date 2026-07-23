const crypto = require('crypto');
const { handlePayoutWebhook } = require('../../services/vendorWithdrawal.service');

/**
 * RazorpayX payout webhook.
 * Prefer mounting with express.raw for signature verification when secret is set.
 */
exports.razorpayxPayoutWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAYX_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

    if (secret && signature) {
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const a = Buffer.from(expected);
      const b = Buffer.from(String(signature));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      }
    } else if (process.env.NODE_ENV === 'production' && secret) {
      return res.status(400).json({ success: false, message: 'Missing webhook signature' });
    }

    const payload = Buffer.isBuffer(req.body) ? JSON.parse(rawBody.toString('utf8')) : req.body;
    const result = await handlePayoutWebhook('razorpayx', payload);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[razorpayx webhook]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cashfreePayoutWebhook = async (req, res) => {
  try {
    const result = await handlePayoutWebhook('cashfree', req.body || {});
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[cashfree webhook]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
