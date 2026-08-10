/**
 * UPI / VPA utilities — format validation and provider response mapping.
 */

/** NPCI-style VPA: handle@psp */
const VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;

function normalizeVpa(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function isValidVpaFormat(vpa) {
  return VPA_REGEX.test(normalizeVpa(vpa));
}

function normalizeMobile(input) {
  const digits = String(input || '').replace(/\D/g, '');
  return digits.slice(-10);
}

function isValidMobileFormat(mobile) {
  return MOBILE_REGEX.test(normalizeMobile(mobile));
}

function maskVpa(vpa) {
  const v = normalizeVpa(vpa);
  const at = v.indexOf('@');
  if (at < 2) return '****';
  return `${v.slice(0, 2)}****${v.slice(at)}`;
}

function maskMobile(mobile) {
  const m = normalizeMobile(mobile);
  if (m.length < 4) return '****';
  return `${m.slice(0, 2)}******${m.slice(-2)}`;
}

/**
 * Map CGPE UPI verify response → profile
 */
function mapProviderUpiResponse(providerPayload, vpaInput) {
  const root = providerPayload?.data || providerPayload?.result || providerPayload || {};
  const vpa = normalizeVpa(root.vpa || vpaInput);
  return {
    vpa,
    accountHolderName:
      root.accountHolderName ||
      root.account_holder_name ||
      root.name ||
      root.customerName ||
      null,
    status: root.status || (providerPayload?.success !== false ? 'VERIFIED' : 'FAILED'),
    transactionId:
      root.transactionId ||
      providerPayload?.transactionId ||
      providerPayload?.tranx_id ||
      root.tranx_id ||
      null,
    requestId:
      root.requestId ||
      providerPayload?.requestId ||
      root.clientRefNum ||
      null,
    provider: 'cgpe'
  };
}

/**
 * Map CGPE mobile-to-UPI response → profile
 */
function mapProviderMobileUpiResponse(providerPayload, mobileInput) {
  const root = providerPayload?.data || providerPayload?.result || providerPayload || {};
  const mobile = normalizeMobile(root.mobile || mobileInput);
  const vpa = root.vpa ? normalizeVpa(root.vpa) : null;
  return {
    mobile,
    vpa,
    mobileLinkedName:
      root.mobileLinkedName ||
      root.accountHolderName ||
      root.name ||
      root.linkedName ||
      null,
    status: root.status || (vpa ? 'FOUND' : 'NOT_FOUND'),
    transactionId:
      root.transactionId ||
      providerPayload?.transactionId ||
      providerPayload?.tranx_id ||
      null,
    requestId: root.requestId || providerPayload?.requestId || null,
    provider: 'cgpe'
  };
}

module.exports = {
  VPA_REGEX,
  MOBILE_REGEX,
  normalizeVpa,
  isValidVpaFormat,
  normalizeMobile,
  isValidMobileFormat,
  maskVpa,
  maskMobile,
  mapProviderUpiResponse,
  mapProviderMobileUpiResponse
};
