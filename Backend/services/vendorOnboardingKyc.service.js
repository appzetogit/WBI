const KYCVerification = require('../models/KYCVerification');
const VendorKYC = require('../models/VendorKYC');
const RegistrationTemplate = require('../models/RegistrationTemplate');
const VendorDocument = require('../models/VendorDocument');

const CORE_KYC_DOCS = ['aadhaar', 'pan'];

function docStatus(records, type) {
  return records.find((r) => r.documentType === type)?.status || 'pending';
}

function isVerifiedStatus(status) {
  return status === 'verified';
}

function isUploadedOrBetter(status) {
  return ['verified', 'uploaded', 'manual_review'].includes(status);
}

/**
 * Merge registration-template document requirements for selected category codes.
 */
async function resolveDynamicDocumentRequirements({ categoryCodes = [], models = [], incorporationType = 'Proprietorship' }) {
  const base = [
    { key: 'pan', label: 'PAN Card', required: true, verificationMode: 'api' },
    { key: 'gst', label: 'GST Certificate', required: models.includes('PROJECT'), verificationMode: 'upload_only' },
    { key: 'company_registration', label: 'Company / MSME Registration', required: incorporationType !== 'Proprietorship', verificationMode: 'upload_only' },
    { key: 'cancelled_cheque', label: 'Cancelled Cheque', required: true, verificationMode: 'upload_only' },
    { key: 'bank', label: 'Bank Account (API)', required: true, verificationMode: 'api' },
    { key: 'aadhaar', label: 'Aadhaar (Authorized Person)', required: true, verificationMode: 'api' },
    { key: 'selfie', label: 'Live Selfie / Face Match', required: true, verificationMode: 'upload_only' }
  ];

  if (models.includes('PROJECT')) {
    base.push(
      { key: 'pf_registration', label: 'PF Registration', required: true, verificationMode: 'upload_only' },
      { key: 'esi_registration', label: 'ESIC Registration', required: true, verificationMode: 'upload_only' },
      { key: 'past_work_order', label: 'Past Work Order / PO', required: true, verificationMode: 'upload_only' }
    );
  }

  const codes = [...new Set(categoryCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
  const templates = codes.length
    ? await RegistrationTemplate.find({ categoryCode: { $in: codes }, isActive: true }).lean()
    : [];

  const dynamicMap = new Map();
  for (const tpl of templates) {
    const lists = [
      ...(tpl.requiredDocuments || []),
      ...(tpl.requiredCertifications || [])
    ];
    for (const item of lists) {
      const key = String(item.key || item.label || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
      if (!key) continue;
      if (!dynamicMap.has(key)) {
        dynamicMap.set(key, {
          key,
          label: item.label || key,
          required: item.required !== false,
          expiryTracked: !!item.expiryTracked,
          verificationMode: 'upload_only',
          categoryCode: tpl.categoryCode,
          categoryName: tpl.categoryName
        });
      }
    }
  }

  const merged = [...base];
  const baseKeys = new Set(base.map((b) => b.key));
  for (const [key, row] of dynamicMap) {
    if (!baseKeys.has(key)) merged.push(row);
  }

  return merged;
}

async function buildKycSnapshot(vendorId) {
  const records = await KYCVerification.find({ role: 'vendor', entityId: vendorId }).lean();
  const vendorKyc = await VendorKYC.findOne({ vendorId }).lean();

  const timeline = records.map((r) => ({
    documentType: r.documentType,
    status: r.status,
    verificationMode: r.verificationMode,
    provider: r.provider,
    verifiedAt: r.verifiedAt,
    updatedAt: r.updatedAt
  }));

  const aadhaarStatus = docStatus(records, 'aadhaar');
  const panStatus = docStatus(records, 'pan');
  const bankStatus = docStatus(records, 'bank');
  const gstStatus = docStatus(records, 'gst');
  const selfieStatus = docStatus(records, 'selfie');

  const coreKycMet = CORE_KYC_DOCS.every((t) => isVerifiedStatus(docStatus(records, t)));
  const bankMet = isVerifiedStatus(bankStatus);
  const selfieMet = isVerifiedStatus(selfieStatus) || isUploadedOrBetter(selfieStatus);

  const kycScore = Math.round(
    (records.filter((r) => r.status === 'verified').length / Math.max(records.length, 1)) * 100
  );

  return {
    records: timeline,
    vendorKyc,
    flags: {
      aadhaarVerified: isVerifiedStatus(aadhaarStatus),
      panVerified: isVerifiedStatus(panStatus),
      gstVerified: isVerifiedStatus(gstStatus),
      bankVerified: bankMet,
      selfieVerified: selfieMet,
      coreKycMet,
      bankMet
    },
    kycScore,
    companyScore: kycScore
  };
}

async function syncVendorComplianceFromKyc(vendor) {
  const snapshot = await buildKycSnapshot(vendor._id);
  const { flags } = snapshot;

  if (!vendor.compliance) vendor.compliance = {};
  vendor.compliance.panVerified = flags.panVerified;
  vendor.compliance.gstVerified = flags.gstVerified;
  vendor.compliance.kycStatus = flags.coreKycMet ? 'verified' : 'pending';

  if (flags.coreKycMet) {
    vendor.kycStatus = 'verified';
  } else if (vendor.kycStatus === 'verified') {
    vendor.kycStatus = 'pending';
  }

  if (flags.bankMet) {
    vendor.bankStatus = 'verified';
  }

  await vendor.save();
  return snapshot;
}

module.exports = {
  resolveDynamicDocumentRequirements,
  buildKycSnapshot,
  syncVendorComplianceFromKyc
};
