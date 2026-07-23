/**
 * Configurable payout provider adapters.
 * Providers: manual | razorpayx | cashfree
 * No fake success — RazorpayX/Cashfree call real APIs; manual waits for admin UTR.
 */
const crypto = require('crypto');
const axios = require('axios');
const { getPayoutConfig } = require('./vendorPayoutConfig.service');

function authHeader(keyId, keySecret) {
  const token = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
}

async function createRazorpayXContact({ name, email, phone, vendorId }) {
  const config = await getPayoutConfig();
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw Object.assign(new Error('RazorpayX credentials not configured'), { status: 503 });
  }
  const res = await axios.post(
    'https://api.razorpay.com/v1/contacts',
    {
      name: name || 'Vendor',
      email: email || undefined,
      contact: phone || undefined,
      type: 'vendor',
      reference_id: String(vendorId).slice(-20),
      notes: { vendorId: String(vendorId) }
    },
    { headers: authHeader(config.razorpayKeyId, config.razorpayKeySecret), timeout: 30000 }
  );
  return res.data;
}

async function createRazorpayXFundAccount({ contactId, bank, method }) {
  const config = await getPayoutConfig();
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw Object.assign(new Error('RazorpayX credentials not configured'), { status: 503 });
  }

  const body =
    method === 'upi'
      ? {
          contact_id: contactId,
          account_type: 'vpa',
          vpa: { address: bank.upiId }
        }
      : {
          contact_id: contactId,
          account_type: 'bank_account',
          bank_account: {
            name: bank.accountHolderName,
            ifsc: bank.ifscCode,
            account_number: bank.accountNumber
          }
        };

  const res = await axios.post('https://api.razorpay.com/v1/fund_accounts', body, {
    headers: authHeader(config.razorpayKeyId, config.razorpayKeySecret),
    timeout: 30000
  });
  return res.data;
}

async function createRazorpayXPayout({
  fundAccountId,
  amountPaise,
  currency = 'INR',
  purpose = 'payout',
  referenceId,
  narration
}) {
  const config = await getPayoutConfig();
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw Object.assign(new Error('RazorpayX credentials not configured'), { status: 503 });
  }

  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  if (!accountNumber) {
    throw Object.assign(
      new Error('RAZORPAYX_ACCOUNT_NUMBER is required for RazorpayX payouts'),
      { status: 503 }
    );
  }

  const res = await axios.post(
    'https://api.razorpay.com/v1/payouts',
    {
      account_number: accountNumber,
      fund_account_id: fundAccountId,
      amount: amountPaise,
      currency,
      mode: 'NEFT',
      purpose,
      queue_if_low_balance: true,
      reference_id: String(referenceId).slice(0, 40),
      narration: String(narration || 'WBI Vendor Payout').slice(0, 30)
    },
    {
      headers: {
        ...authHeader(config.razorpayKeyId, config.razorpayKeySecret),
        'X-Payout-Idempotency': crypto.createHash('sha256').update(String(referenceId)).digest('hex').slice(0, 64)
      },
      timeout: 45000
    }
  );
  return res.data;
}

async function createCashfreeTransfer({ bank, amount, transferId, remarks }) {
  const config = await getPayoutConfig();
  if (!config.cashfreeClientId || !config.cashfreeClientSecret) {
    throw Object.assign(new Error('Cashfree payout credentials not configured'), { status: 503 });
  }
  const base =
    config.cashfreeEnv === 'production'
      ? 'https://api.cashfree.com/payout'
      : 'https://sandbox.cashfree.com/payout';

  // Auth token
  const authRes = await axios.post(
    `${base}/v1/authorize`,
    {},
    {
      headers: {
        'X-Client-Id': config.cashfreeClientId,
        'X-Client-Secret': config.cashfreeClientSecret
      },
      timeout: 20000
    }
  );
  const token = authRes.data?.data?.token;
  if (!token) {
    throw Object.assign(new Error('Cashfree auth failed'), { status: 502 });
  }

  const res = await axios.post(
    `${base}/v1/requestTransfer`,
    {
      beneId: undefined,
      amount: String(amount),
      transferId,
      transferMode: bank.upiId ? 'upi' : 'banktransfer',
      remarks: remarks || 'WBI Vendor Payout',
      beneDetails: bank.upiId
        ? { name: bank.accountHolderName, vpa: bank.upiId }
        : {
            bankAccount: bank.accountNumber,
            ifsc: bank.ifscCode,
            name: bank.accountHolderName
          }
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 45000
    }
  );
  return res.data;
}

/**
 * Initiate payout for a withdrawal.
 * @returns {{ provider, status, gatewayPayoutId, gatewayResponse, utr? }}
 */
async function initiatePayout(withdrawal, bankPlain) {
  const config = await getPayoutConfig();
  const provider = config.payoutProvider || 'manual';
  const netPaise = Math.round(Number(withdrawal.netAmount || withdrawal.amount) * 100);

  if (provider === 'manual') {
    return {
      provider: 'manual',
      status: 'awaiting_manual_transfer',
      gatewayPayoutId: null,
      gatewayResponse: { message: 'Awaiting admin bank transfer + UTR' },
      mode: withdrawal.method || 'bank'
    };
  }

  if (provider === 'razorpayx') {
    const Vendor = require('../models/Vendor');
    const vendor = await Vendor.findById(withdrawal.vendorId).select('name email phone').lean();
    const contact = await createRazorpayXContact({
      name: bankPlain.accountHolderName || vendor?.name,
      email: vendor?.email,
      phone: vendor?.phone,
      vendorId: withdrawal.vendorId
    });
    const fund = await createRazorpayXFundAccount({
      contactId: contact.id,
      bank: bankPlain,
      method: withdrawal.method === 'upi' ? 'upi' : 'bank'
    });
    const payout = await createRazorpayXPayout({
      fundAccountId: fund.id,
      amountPaise: netPaise,
      referenceId: withdrawal.idempotencyKey || String(withdrawal._id),
      narration: `WBI ${withdrawal._id.toString().slice(-8)}`
    });
    return {
      provider: 'razorpayx',
      status: payout.status || 'processing',
      gatewayPayoutId: payout.id,
      gatewayResponse: payout,
      utr: payout.utr || null,
      mode: payout.mode
    };
  }

  if (provider === 'cashfree') {
    const transfer = await createCashfreeTransfer({
      bank: bankPlain,
      amount: Number(withdrawal.netAmount || withdrawal.amount),
      transferId: withdrawal.idempotencyKey || `wd_${withdrawal._id}`,
      remarks: `WBI withdrawal ${withdrawal._id}`
    });
    return {
      provider: 'cashfree',
      status: transfer.status || transfer.data?.status || 'processing',
      gatewayPayoutId: transfer.data?.referenceId || transfer.referenceId || null,
      gatewayResponse: transfer,
      utr: transfer.data?.utr || null
    };
  }

  throw Object.assign(new Error(`Unsupported payout provider: ${provider}`), { status: 400 });
}

module.exports = {
  initiatePayout,
  createRazorpayXContact,
  createRazorpayXFundAccount,
  createRazorpayXPayout,
  createCashfreeTransfer
};
