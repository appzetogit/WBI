/**
 * CIN / MCA utilities — format validation, status normalization, provider mapping.
 * Structural MCA rules only; no hardcoded company data.
 */

/** Standard 21-character Company CIN (MCA) */
const CIN_REGEX = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

/** LLP Identification Number (optional alternate) */
const LLPIN_REGEX = /^[A-Z]{3}-[0-9]{4}$/;

const ACTIVE_STATUS_RE = /^(active|actve|live)$/i;
const INACTIVE_STATUS_RE =
  /^(inactive|struck\s*off|strike\s*off|under\s*liquidation|under\s*process\s*of\s*striking|dissolved|amalgamated|converted|dormant)$/i;

function normalizeCin(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function isValidCinFormat(cin) {
  const c = normalizeCin(cin);
  return CIN_REGEX.test(c) || LLPIN_REGEX.test(c);
}

function normalizeCompanyStatus(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'UNKNOWN';
  if (ACTIVE_STATUS_RE.test(s)) return 'ACTIVE';
  if (INACTIVE_STATUS_RE.test(s)) {
    if (/struck|strike/i.test(s)) return 'STRUCK_OFF';
    if (/liquidat/i.test(s)) return 'UNDER_LIQUIDATION';
    if (/dissolv/i.test(s)) return 'DISSOLVED';
    if (/dormant/i.test(s)) return 'DORMANT';
    return 'INACTIVE';
  }
  return s.toUpperCase().replace(/\s+/g, '_');
}

function assertCompanyActive(statusNormalized, { hasCompanyName = false } = {}) {
  if (statusNormalized === 'ACTIVE') return;
  if (statusNormalized === 'UNKNOWN') {
    if (hasCompanyName && process.env.CIN_REQUIRE_ACTIVE_STATUS !== 'true') return;
    if (process.env.CIN_REQUIRE_ACTIVE_STATUS === 'true') {
      const err = new Error('Could not confirm MCA company status. Please re-verify or contact support.');
      err.code = 'CIN_STATUS_UNKNOWN';
      err.statusCode = 422;
      throw err;
    }
    return;
  }
  const messages = {
    STRUCK_OFF: 'This company is Struck Off on MCA and cannot be registered.',
    UNDER_LIQUIDATION: 'This company is under liquidation and cannot be registered.',
    DISSOLVED: 'This company is dissolved and cannot be registered.',
    DORMANT: 'This company is dormant on MCA and cannot be registered.',
    INACTIVE: 'This company is inactive on MCA and cannot be registered.'
  };
  const err = new Error(
    messages[statusNormalized] || `MCA company status is ${statusNormalized}. Only Active companies are accepted.`
  );
  err.code = 'CIN_INACTIVE';
  err.statusCode = 422;
  throw err;
}

function mapDirector(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const name = raw.name || raw.director_name || raw.fullName || null;
  const dinPan = raw.din_pan || raw.din || raw.DIN || raw.pan || raw.dinPan || null;
  if (!name && !dinPan) return null;
  return {
    name: name ? String(name).trim() : null,
    dinPan: dinPan ? String(dinPan).trim().toUpperCase() : null,
    dateOfAppointment: raw.date_of_appointment || raw.dateOfAppointment || raw.appointmentDate || null,
    nationality: raw.nationality || null,
    gender: raw.gender || null,
    designation: raw.designation || raw.role || null,
    isPresent: raw.isPresent !== false
  };
}

function mapDirectors(list) {
  if (!Array.isArray(list)) return [];
  return list.map(mapDirector).filter(Boolean);
}

function parseAddress(addressRaw) {
  const address = addressRaw ? String(addressRaw).trim() : null;
  if (!address) return { registeredAddress: null, state: null, pincode: null };
  const pinMatch = address.match(/\b(\d{6})\b/);
  const pincode = pinMatch ? pinMatch[1] : null;
  // Heuristic: state often second-to-last token before/India/pincode
  let state = null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2] || parts[parts.length - 1];
    if (candidate && !/^\d{6}$/.test(candidate) && !/^india$/i.test(candidate)) {
      state = candidate.replace(/\b\d{6}\b/, '').trim() || null;
    }
  }
  return { registeredAddress: address, state, pincode };
}

/**
 * Map CGPE / mock CIN response → stable internal profile.
 */
function mapProviderCinResponse(providerPayload, cinInput) {
  const cin = normalizeCin(cinInput);
  const root = providerPayload?.data || providerPayload?.result || providerPayload || {};
  const master =
    root.companyMasterData ||
    root.company_master_data ||
    root.masterData ||
    root.companyData ||
    root.result ||
    root;

  const companyName =
    root.companyName ||
    master.company_llp_name ||
    master.company_name ||
    master.companyName ||
    root.company_name ||
    null;

  const companyStatusRaw =
    master.company_status ||
    master.companyStatus ||
    root.companyStatus ||
    root.status ||
    null;

  const companyStatus = normalizeCompanyStatus(
    companyStatusRaw === 'SUCCESS' ? master.company_status || null : companyStatusRaw
  );

  const addressRaw =
    master.registered_address ||
    master.registeredAddress ||
    root.registeredAddress ||
    root.registered_address ||
    null;
  const addr = parseAddress(addressRaw);

  const presentDirectors = mapDirectors(
    root.presentDirectors || root.present_directors || master.presentDirectors || []
  ).map((d) => ({ ...d, isPresent: true }));

  const pastDirectors = mapDirectors(
    root.pastDirectors || root.past_directors || master.pastDirectors || []
  ).map((d) => ({ ...d, isPresent: false }));

  const charges = Array.isArray(root.charges || master.charges)
    ? (root.charges || master.charges).map((c) =>
        typeof c === 'object'
          ? {
              chargeId: c.chargeId || c.charge_id || c.srn || null,
              amount: c.amount || c.charge_amount || null,
              date: c.date || c.date_of_creation || null,
              status: c.status || null,
              holder: c.holder || c.charge_holder || null,
              raw: c
            }
          : { raw: c }
      )
    : [];

  const relatedParties = Array.isArray(root.relatedParties || root.related_parties)
    ? root.relatedParties || root.related_parties
    : [];

  const transactionId =
    root.transactionId ||
    providerPayload?.transactionId ||
    providerPayload?.requestId ||
    root.requestId ||
    null;

  const requestId =
    root.clientRefNum ||
    root.requestId ||
    providerPayload?.requestId ||
    transactionId;

  return {
    cin: normalizeCin(root.cin || master.cin || companyIdOrCin(root, master) || cin),
    companyName: companyName ? String(companyName).trim() : null,
    companyType:
      root.companyType ||
      master.class_of_company ||
      master.company_type ||
      master.classOfCompany ||
      null,
    companyCategory: master.company_category || master.companyCategory || null,
    companyClass: master.class_of_company || master.classOfCompany || root.companyType || null,
    rocCode: master.roc_code || master.rocCode || master.roc || null,
    registrationNumber: master.registration_number || master.registrationNumber || null,
    dateOfIncorporation:
      master.date_of_incorporation || master.dateOfIncorporation || master.incorporationDate || null,
    companyStatus,
    companyStatusRaw: companyStatusRaw ? String(companyStatusRaw) : null,
    listedStatus:
      master.whether_listed_or_not ||
      master.listedStatus ||
      root.listedStatus ||
      null,
    registeredAddress: addr.registeredAddress,
    state: addr.state || master.state || root.state || null,
    pincode: addr.pincode || master.pincode || master.pin_code || null,
    authorisedCapital:
      master.authorised_capital || master.authorized_capital || master.authorisedCapital || null,
    paidUpCapital: master.paid_up_capital || master.paidUpCapital || null,
    presentDirectors,
    pastDirectors,
    directors: [...presentDirectors, ...pastDirectors],
    relatedParties,
    charges,
    allDirectorships: Array.isArray(root.allDirectorships) ? root.allDirectorships : [],
    transactionId: transactionId ? String(transactionId) : null,
    requestId: requestId ? String(requestId) : null,
    providerTimestamp: root.timestamp || providerPayload?.timestamp || null,
    provider: 'cgpe'
  };
}

function companyIdOrCin(root, master) {
  return root.companyId || master.company_id || null;
}

function maskCin(cin) {
  const c = normalizeCin(cin);
  if (c.length < 8) return '****';
  return `${c.slice(0, 4)}****${c.slice(-4)}`;
}

module.exports = {
  CIN_REGEX,
  LLPIN_REGEX,
  normalizeCin,
  isValidCinFormat,
  normalizeCompanyStatus,
  assertCompanyActive,
  mapProviderCinResponse,
  maskCin
};
