/**
 * Vendor payout / withdrawal configuration (from Settings + env).
 */
const Settings = require('../models/Settings');

const DEFAULTS = {
  payoutProvider: 'manual', // manual | razorpayx | cashfree
  withdrawalEnabled: true,
  minWithdrawalAmount: 100,
  maxWithdrawalAmount: 500000,
  dailyWithdrawalLimit: 1000000,
  autoApproveMaxAmount: 5000,
  requireOtp: true,
  requireVerifiedBank: true,
  allowUpi: true,
  allowBankTransfer: true,
  settlementSchedule: 'T+1', // Instant | T+1 | T+2 | Weekly
  tdsPercentage: 1,
  platformFeePercentage: 1,
  gstOnPlatformFee: 18
};

async function getPayoutConfig() {
  const settings = await Settings.findOne({ type: 'global' }).lean();
  return {
    ...DEFAULTS,
    payoutProvider: settings?.payoutProvider || process.env.PAYOUT_PROVIDER || DEFAULTS.payoutProvider,
    withdrawalEnabled: settings?.withdrawalEnabled !== false,
    minWithdrawalAmount: Number(settings?.minWithdrawalAmount ?? DEFAULTS.minWithdrawalAmount),
    maxWithdrawalAmount: Number(settings?.maxWithdrawalAmount ?? DEFAULTS.maxWithdrawalAmount),
    dailyWithdrawalLimit: Number(settings?.dailyWithdrawalLimit ?? DEFAULTS.dailyWithdrawalLimit),
    autoApproveMaxAmount: Number(settings?.autoApproveMaxAmount ?? DEFAULTS.autoApproveMaxAmount),
    requireOtp: settings?.requireWithdrawalOtp !== false,
    requireVerifiedBank: settings?.requireVerifiedBank !== false,
    allowUpi: settings?.allowUpiWithdrawal !== false,
    allowBankTransfer: settings?.allowBankWithdrawal !== false,
    settlementSchedule: settings?.settlementSchedule || DEFAULTS.settlementSchedule,
    tdsPercentage: Number(settings?.tdsPercentage ?? DEFAULTS.tdsPercentage),
    platformFeePercentage: Number(settings?.platformFeePercentage ?? DEFAULTS.platformFeePercentage),
    gstOnPlatformFee: Number(settings?.gstOnPlatformFee ?? DEFAULTS.gstOnPlatformFee),
    razorpayKeyId: settings?.razorpayKeyId || process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: settings?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET,
    cashfreeClientId: process.env.CASHFREE_CLIENT_ID || '',
    cashfreeClientSecret: process.env.CASHFREE_CLIENT_SECRET || '',
    cashfreeEnv: process.env.CASHFREE_ENV || 'sandbox'
  };
}

function calculatePayoutFees(grossAmount, config) {
  const gross = Math.max(0, Number(grossAmount) || 0);
  const tdsRate = Number(config.tdsPercentage) || 0;
  const feeRate = Number(config.platformFeePercentage) || 0;
  const gstRate = Number(config.gstOnPlatformFee) || 0;
  const tdsAmount = Math.round((gross * tdsRate) / 100);
  const platformFeeAmount = Math.round((gross * feeRate) / 100);
  const gstOnFee = Math.round((platformFeeAmount * gstRate) / 100);
  const totalDeductions = tdsAmount + platformFeeAmount + gstOnFee;
  const netAmount = Math.max(0, gross - totalDeductions);
  return {
    grossAmount: gross,
    tdsRate,
    tdsAmount,
    platformFeeRate: feeRate,
    platformFeeAmount,
    gstOnFeeRate: gstRate,
    gstOnFee,
    totalDeductions,
    netAmount
  };
}

module.exports = {
  DEFAULTS,
  getPayoutConfig,
  calculatePayoutFees
};
