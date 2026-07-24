/**
 * Razorpay integrity self-check (no live charges).
 * Verifies env + signature algorithm + forge rejection (regression for C1).
 *
 *   node scripts/verify-razorpay-integrity.js
 *   node Backend/scripts/verify-razorpay-integrity.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');
const path = require('path');

// Allow run from repo root or Backend/
const servicePath = path.join(__dirname, '../services/razorpayService.js');
let verifyPayment;
try {
  ({ verifyPayment } = require(servicePath));
} catch {
  ({ verifyPayment } = require(path.join(__dirname, '../../Backend/services/razorpayService.js')));
}

const results = [];

function assert(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const webhook = process.env.RAZORPAY_WEBHOOK_SECRET;

  assert('RAZORPAY_KEY_ID set', Boolean(keyId));
  assert('RAZORPAY_KEY_SECRET set', Boolean(secret));
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    assert('RAZORPAY_WEBHOOK_SECRET set (prod)', Boolean(webhook), 'REQUIRED for production');
  } else {
    assert(
      'RAZORPAY_WEBHOOK_SECRET set (recommended)',
      true,
      webhook ? 'configured' : 'WARN: set before staging/prod — webhooks will 503 without it'
    );
    if (!webhook) console.warn('[verify] RAZORPAY_WEBHOOK_SECRET missing — set before soft launch');
  }
  assert('No mock_secret fallback in use', secret !== 'mock_secret' && secret !== 'mock');
  assert('Key looks like Razorpay', !keyId || keyId.startsWith('rzp_'));

  if (secret) {
    const orderId = 'order_TestIntegrity123';
    const paymentId = 'pay_TestIntegrity456';
    const validSig = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

    assert('Valid HMAC accepted', verifyPayment(orderId, paymentId, validSig) === true);
    assert(
      'Forged signature rejected (C1 regression)',
      verifyPayment(orderId, paymentId, '0'.repeat(64)) === false
    );
    assert(
      'order_ prefix alone does not bypass (C1)',
      verifyPayment(orderId, paymentId, 'deadbeef') === false
    );
    assert('Missing fields rejected', verifyPayment(null, paymentId, validSig) === false);
  } else {
    assert('Skip HMAC tests (no secret)', false, 'set RAZORPAY_KEY_SECRET');
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n' + JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
