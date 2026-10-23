/**
 * "Your profile was updated" security notice.
 *
 * Only identity, contact, KYC and payout fields count: a save that changes
 * status, location or preferences sends nothing. Call `profileChanges(doc)`
 * before `doc.save()` (it reads Mongoose's modified paths), then
 * `notifyProfileChange(...)` after the save succeeds.
 */

const FIELD_LABELS = {
  name: 'Name',
  fullName: 'Name',
  businessName: 'Business name',
  companyName: 'Company name',
  email: 'Email address',
  phone: 'Mobile number',
  mobile: 'Mobile number',
  address: 'Address',
  companyAddress: 'Registered address',
  billingAddress: 'Billing address',
  authorizedPerson: 'Authorised contact person',
  aadhar: 'Aadhaar details',
  pan: 'PAN details',
  gstin: 'GSTIN',
  documents: 'Documents',
  uploadedDocuments: 'Documents',
  bankDetails: 'Bank details',
  dob: 'Date of birth',
  gender: 'Gender',
  profilePhoto: 'Profile photo',
  logoUrl: 'Company logo'
};

/** Labels of the watched fields modified on a Mongoose document. */
function profileChanges(doc, fields = Object.keys(FIELD_LABELS)) {
  if (!doc || typeof doc.modifiedPaths !== 'function') return [];
  const roots = new Set(doc.modifiedPaths().map((p) => p.split('.')[0]));
  const labels = fields.filter((f) => roots.has(f)).map((f) => FIELD_LABELS[f] || f);
  return [...new Set(labels)];
}

/** Labels for a plain update object (findByIdAndUpdate / $set style). */
function changesFromUpdate(update = {}, fields = Object.keys(FIELD_LABELS)) {
  const roots = new Set(Object.keys(update || {}).map((p) => p.split('.')[0]));
  return [...new Set(fields.filter((f) => roots.has(f)).map((f) => FIELD_LABELS[f] || f))];
}

const TARGET_KEY = { user: 'userId', vendor: 'vendorId', engineer: 'engineerId', worker: 'workerId', b2b: 'b2bUserId' };

/**
 * Queue the notice. `email` sends to that address instead of the account's
 * (used for company-level records and for the previous address when the
 * email itself changed). Never throws.
 */
function notifyProfileChange({ role, id, name, changes, changedBy = 'You', email = null }) {
  if (!changes || !changes.length) return;
  try {
    const { emitAsync } = require('./notificationOrchestrator.service');
    const targets = email ? { emails: [{ role, email }] } : { [TARGET_KEY[role]]: id };
    emitAsync('profile_updated', { targets, data: { name, changes, changedBy } });
  } catch (err) {
    console.warn('[profile_updated] notify failed:', err.message);
  }
}

/** Queue the payout-account notice. `account` is a raw or masked number. */
function notifyBankChange({ role, id, name, holderName, bankName, account, ifsc, email = null }) {
  try {
    const raw = String(account || '').replace(/\s/g, '');
    const accountMasked = raw ? (raw.includes('X') || raw.includes('*') ? raw : `XXXX${raw.slice(-4)}`) : undefined;
    const { emitAsync } = require('./notificationOrchestrator.service');
    const targets = email ? { emails: [{ role, email }] } : { [TARGET_KEY[role]]: id };
    emitAsync('bank_details_updated', {
      targets,
      data: { name, holderName, bankName, accountMasked, ifsc: ifsc ? String(ifsc).toUpperCase() : undefined }
    });
  } catch (err) {
    console.warn('[bank_details_updated] notify failed:', err.message);
  }
}

module.exports = { profileChanges, changesFromUpdate, notifyProfileChange, notifyBankChange, FIELD_LABELS };
