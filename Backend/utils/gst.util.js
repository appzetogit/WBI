/**
 * GST utilities — format, PAN extract, state map, active-status checks.
 * No hardcoded business data; only GSTIN structural rules + IN state codes.
 */

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** First two digits of GSTIN = State code (GST portal standard) */
const STATE_CODE_MAP = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh (new)',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction'
};

const ACTIVE_STATUS_RE = /^(active|act|valid|registered)$/i;
const CANCELLED_STATUS_RE = /^(cancel|cancelled|canceled|cncl)$/i;
const SUSPENDED_STATUS_RE = /^(suspend|suspended|provisional|inactive)$/i;

function normalizeGstin(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function isValidGstinFormat(gstin) {
  return GSTIN_REGEX.test(normalizeGstin(gstin));
}

/** PAN embedded in GSTIN positions 3–12 (1-indexed) */
function extractPanFromGstin(gstin) {
  const g = normalizeGstin(gstin);
  if (g.length !== 15) return null;
  return g.slice(2, 12);
}

function getStateFromGstin(gstin) {
  const g = normalizeGstin(gstin);
  const code = g.slice(0, 2);
  return {
    stateCode: code,
    state: STATE_CODE_MAP[code] || null
  };
}

/**
 * Normalize provider registration status → ACTIVE | CANCELLED | SUSPENDED | UNKNOWN
 */
function normalizeRegistrationStatus(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'UNKNOWN';
  if (ACTIVE_STATUS_RE.test(s)) return 'ACTIVE';
  if (CANCELLED_STATUS_RE.test(s)) return 'CANCELLED';
  if (SUSPENDED_STATUS_RE.test(s)) return 'SUSPENDED';
  // Common GST portal values
  if (/^active$/i.test(s) || s.toUpperCase() === 'ACT') return 'ACTIVE';
  return s.toUpperCase();
}

function assertGstActive(statusNormalized, { hasLegalName = false } = {}) {
  if (statusNormalized === 'CANCELLED') {
    const err = new Error('This GSTIN is cancelled and cannot be used for registration.');
    err.code = 'GST_CANCELLED';
    err.statusCode = 422;
    throw err;
  }
  if (statusNormalized === 'SUSPENDED') {
    const err = new Error('This GSTIN is suspended and cannot be used for registration.');
    err.code = 'GST_SUSPENDED';
    err.statusCode = 422;
    throw err;
  }
  if (statusNormalized === 'UNKNOWN') {
    // Thin provider payloads may omit status — accept when legal name present
    if (hasLegalName) return;
    if (process.env.GST_REQUIRE_ACTIVE_STATUS === 'true') {
      const err = new Error('Could not confirm GSTIN registration status. Please try again or contact support.');
      err.code = 'GST_STATUS_UNKNOWN';
      err.statusCode = 422;
      throw err;
    }
    return;
  }
  if (statusNormalized !== 'ACTIVE') {
    const err = new Error(`GSTIN status is ${statusNormalized}. Only Active GSTINs are accepted.`);
    err.code = 'GST_INACTIVE';
    err.statusCode = 422;
    throw err;
  }
}

/**
 * Pull address fields from heterogeneous CGPE/GSP payloads.
 */
function pickAddress(raw = {}) {
  const pradr = raw.pradr || raw.principalPlaceOfBusiness || raw.principalAddress || raw.addr || {};
  const addr =
    typeof pradr === 'string'
      ? { raw: pradr }
      : pradr.addr || pradr.address || pradr || {};

  const line =
    typeof addr === 'string'
      ? addr
      : [
          addr.bno || addr.buildingNumber,
          addr.bnm || addr.buildingName,
          addr.st || addr.street,
          addr.loc || addr.location,
          addr.locality,
          addr.landMark || addr.landmark,
          addr.dst || addr.district,
          addr.city
        ]
          .filter(Boolean)
          .join(', ') ||
        addr.fullAddress ||
        addr.address ||
        raw.address ||
        raw.businessAddress ||
        null;

  const pincode =
    addr.pncd ||
    addr.pincode ||
    addr.pin ||
    raw.pincode ||
    raw.pinCode ||
    null;

  const state =
    addr.stcd ||
    addr.state ||
    raw.state ||
    null;

  return {
    businessAddress: line ? String(line).trim() : null,
    pincode: pincode ? String(pincode).trim() : null,
    stateFromAddress: state ? String(state).trim() : null
  };
}

/**
 * Map CGPE / GSP / mock response into a stable internal profile.
 */
function mapProviderGstResponse(providerPayload, gstinInput) {
  const gstin = normalizeGstin(gstinInput);
  const root = providerPayload?.data || providerPayload?.result || providerPayload || {};
  // Nested result shapes
  const d = root.result || root.data || root.gstinResponse || root;

  const legalName =
    d.legalName ||
    d.legal_name ||
    d.lgnm ||
    d.tradeNameLegal ||
    d.companyName ||
    null;

  const tradeName =
    d.tradeName ||
    d.trade_name ||
    d.tradeNam ||
    d.tn ||
    legalName;

  const statusRaw =
    d.registrationStatus ||
    d.gstinStatus ||
    d.status ||
    d.sts ||
    d.registration_status ||
    null;

  const registrationStatus = normalizeRegistrationStatus(statusRaw);
  const { stateCode, state: stateFromCode } = getStateFromGstin(gstin);
  const addr = pickAddress(d);

  const constitutionOfBusiness =
    d.constitutionOfBusiness ||
    d.ctb ||
    d.constitution ||
    d.companyType ||
    null;

  const taxpayerType =
    d.taxpayerType ||
    d.dty ||
    d.taxPayerType ||
    d.type ||
    null;

  const registrationDate =
    d.registrationDate ||
    d.rgdt ||
    d.regDate ||
    d.dateOfRegistration ||
    null;

  const natureOfBusiness = Array.isArray(d.nba)
    ? d.nba.join(', ')
    : d.natureOfBusiness ||
      d.nba ||
      d.businessNature ||
      d.ntr ||
      null;

  const lastUpdated =
    d.lastUpdated ||
    d.lstupdt ||
    d.lastUpdateDate ||
    d.updatedAt ||
    null;

  const pan =
    d.pan ||
    d.panNumber ||
    extractPanFromGstin(gstin);

  return {
    gstin,
    legalName: legalName ? String(legalName).trim() : null,
    tradeName: tradeName ? String(tradeName).trim() : null,
    pan: pan ? String(pan).toUpperCase() : null,
    constitutionOfBusiness: constitutionOfBusiness ? String(constitutionOfBusiness).trim() : null,
    taxpayerType: taxpayerType ? String(taxpayerType).trim() : null,
    registrationStatus,
    registrationStatusRaw: statusRaw ? String(statusRaw) : null,
    registrationDate: registrationDate ? String(registrationDate) : null,
    businessAddress: addr.businessAddress,
    state: addr.stateFromAddress || stateFromCode,
    stateCode,
    pincode: addr.pincode,
    natureOfBusiness: natureOfBusiness ? String(natureOfBusiness).trim() : null,
    lastUpdated: lastUpdated ? String(lastUpdated) : null,
    provider: 'cgpe',
    apiReferenceId:
      providerPayload?.transactionId ||
      providerPayload?.requestId ||
      providerPayload?.data?.transactionId ||
      d.transactionId ||
      null
  };
}

function maskGstin(gstin) {
  const g = normalizeGstin(gstin);
  if (g.length < 6) return '****';
  return `${g.slice(0, 2)}****${g.slice(-4)}`;
}

module.exports = {
  GSTIN_REGEX,
  STATE_CODE_MAP,
  normalizeGstin,
  isValidGstinFormat,
  extractPanFromGstin,
  getStateFromGstin,
  normalizeRegistrationStatus,
  assertGstActive,
  mapProviderGstResponse,
  maskGstin
};
