const cgpeService = require('./cgpeService');
const B2BVerificationLog = require('../models/B2BVerificationLog');
const {
  getOrCreateOnboardingForCompany,
  pushTimeline,
  computeScores,
  refreshDocumentSummary
} = require('./b2bEnterpriseOnboarding.service');

function maskGst(gst) {
  if (!gst || gst.length < 6) return '****';
  return `${gst.slice(0, 2)}****${gst.slice(-4)}`;
}

function maskPan(pan) {
  if (!pan || pan.length < 5) return '****';
  return `${pan.slice(0, 3)}****${pan.slice(-1)}`;
}

function maskAccount(acct) {
  if (!acct || acct.length < 4) return '****';
  return `****${acct.slice(-4)}`;
}

async function logVerification({
  companyId,
  onboardingId,
  verificationType,
  status,
  requestMasked,
  responseMasked,
  transactionId,
  errorMessage,
  actorId,
  actorType
}) {
  return B2BVerificationLog.create({
    companyId,
    onboardingId,
    verificationType,
    status,
    requestMasked,
    responseMasked,
    transactionId,
    errorMessage,
    actorId,
    actorType
  });
}

async function verifyGstForCompany({ companyId, gstNumber, actorId, ipAddress, userAgent }) {
  const gstVerificationService = require('./gstVerification.service');
  const onboarding = await getOrCreateOnboardingForCompany(companyId);
  onboarding.kycFlags.gst = onboarding.kycFlags.gst || {};
  onboarding.kycFlags.gst.status = 'verifying';
  await onboarding.save();

  try {
    const { profile, verification } = await gstVerificationService.verifyGst({
      gstNumber,
      entityType: 'b2b',
      entityId: companyId,
      actorType: 'b2b',
      actorId,
      ipAddress,
      userAgent
    });

    onboarding.kycFlags.gst = {
      status: 'verified',
      verifiedAt: verification.verifiedAt || new Date(),
      provider: 'cgpe',
      transactionId: profile.apiReferenceId || verification.apiReferenceId || null,
      maskedValue: maskGst(profile.gstin),
      raw: profile
    };
    pushTimeline(onboarding, 'gst_verified', 'b2b', actorId);
    await logVerification({
      companyId,
      onboardingId: onboarding._id,
      verificationType: 'gst',
      status: 'success',
      requestMasked: { gst: maskGst(profile.gstin) },
      responseMasked: {
        legalName: profile.legalName,
        tradeName: profile.tradeName,
        registrationStatus: profile.registrationStatus
      },
      transactionId: onboarding.kycFlags.gst.transactionId,
      actorId,
      actorType: 'b2b'
    });
  } catch (error) {
    onboarding.kycFlags.gst.status = 'failed';
    await logVerification({
      companyId,
      onboardingId: onboarding._id,
      verificationType: 'gst',
      status: 'failed',
      requestMasked: { gst: maskGst(String(gstNumber || '')) },
      errorMessage: error.message,
      actorId,
      actorType: 'b2b'
    });
    await onboarding.save();
    throw error;
  }

  computeScores(onboarding);
  await onboarding.save();
  return onboarding.kycFlags.gst;
}

async function verifyPanForCompany({ companyId, panNumber, actorId }) {
  const onboarding = await getOrCreateOnboardingForCompany(companyId);
  onboarding.kycFlags.pan = onboarding.kycFlags.pan || {};
  onboarding.kycFlags.pan.status = 'verifying';

  const pan = String(panNumber || '').trim().toUpperCase();
  try {
    const result = await cgpeService.verifyPan(pan);
    onboarding.kycFlags.pan = {
      status: 'verified',
      verifiedAt: new Date(),
      provider: 'cgpe',
      transactionId: result.requestId || null,
      maskedValue: maskPan(pan),
      raw: {
        name: result.data?.fullName || result.data?.name || null,
        pan
      }
    };
    pushTimeline(onboarding, 'pan_verified', 'b2b', actorId);
    await logVerification({
      companyId,
      onboardingId: onboarding._id,
      verificationType: 'pan',
      status: 'success',
      requestMasked: { pan: maskPan(pan) },
      responseMasked: { name: onboarding.kycFlags.pan.raw?.name },
      transactionId: onboarding.kycFlags.pan.transactionId,
      actorId,
      actorType: 'b2b'
    });
  } catch (error) {
    onboarding.kycFlags.pan.status = 'failed';
    await logVerification({
      companyId,
      onboardingId: onboarding._id,
      verificationType: 'pan',
      status: 'failed',
      requestMasked: { pan: maskPan(pan) },
      errorMessage: error.message,
      actorId,
      actorType: 'b2b'
    });
    await onboarding.save();
    throw error;
  }

  computeScores(onboarding);
  await onboarding.save();
  return onboarding.kycFlags.pan;
}

async function verifyCinForCompany({ companyId, cinNumber, actorId, ipAddress, userAgent }) {
  const cinVerificationService = require('./cinVerification.service');
  const onboarding = await getOrCreateOnboardingForCompany(companyId);
  onboarding.kycFlags.cin = onboarding.kycFlags.cin || {};
  onboarding.kycFlags.cin.status = 'verifying';
  await onboarding.save();

  try {
    const { profile, verification } = await cinVerificationService.verifyCin({
      cinNumber,
      entityType: 'b2b',
      entityId: companyId,
      actorType: 'b2b',
      actorId,
      ipAddress,
      userAgent
    });

    onboarding.kycFlags.cin = {
      status: 'verified',
      verifiedAt: verification.verifiedAt || new Date(),
      provider: 'cgpe',
      transactionId: profile.transactionId || verification.transactionId || null,
      maskedValue: profile.cin,
      raw: profile
    };
    pushTimeline(onboarding, 'cin_verified', 'b2b', actorId);
    await logVerification({
      companyId,
      onboardingId: onboarding._id,
      verificationType: 'cin',
      status: 'success',
      requestMasked: { cin: profile.cin },
      responseMasked: {
        companyName: profile.companyName,
        companyStatus: profile.companyStatus
      },
      transactionId: onboarding.kycFlags.cin.transactionId,
      actorId,
      actorType: 'b2b'
    });
  } catch (error) {
    onboarding.kycFlags.cin.status = 'failed';
    await logVerification({
      companyId,
      onboardingId: onboarding._id,
      verificationType: 'cin',
      status: 'failed',
      requestMasked: { cin: String(cinNumber || '') },
      errorMessage: error.message,
      actorId,
      actorType: 'b2b'
    });
    await onboarding.save();
    throw error;
  }

  await onboarding.save();
  return onboarding.kycFlags.cin;
}

async function verifyBankForCompany({ companyId, accountNumber, ifsc, actorId }) {
  const onboarding = await getOrCreateOnboardingForCompany(companyId);
  onboarding.kycFlags.bank = onboarding.kycFlags.bank || {};
  onboarding.kycFlags.bank.status = 'verifying';

  try {
    const result = await cgpeService.verifyBank(accountNumber, ifsc);
    onboarding.kycFlags.bank = {
      status: 'verified',
      verifiedAt: new Date(),
      provider: 'cgpe',
      transactionId: result.transactionId || null,
      maskedValue: maskAccount(String(accountNumber)),
      raw: result.data || result
    };
    onboarding.banking = {
      ...(onboarding.banking || {}),
      accountNumber,
      ifsc,
      accountHolderName: result.data?.accountHolderName || onboarding.banking?.accountHolderName
    };
    pushTimeline(onboarding, 'bank_verified', 'b2b', actorId);
    await logVerification({
      companyId,
      onboardingId: onboarding._id,
      verificationType: 'bank',
      status: 'success',
      requestMasked: { account: maskAccount(String(accountNumber)), ifsc },
      responseMasked: { holder: onboarding.banking.accountHolderName },
      actorId,
      actorType: 'b2b'
    });
  } catch (error) {
    onboarding.kycFlags.bank.status = 'failed';
    await logVerification({
      companyId,
      onboardingId: onboarding._id,
      verificationType: 'bank',
      status: 'failed',
      requestMasked: { account: maskAccount(String(accountNumber)), ifsc },
      errorMessage: error.message,
      actorId,
      actorType: 'b2b'
    });
    await onboarding.save();
    throw error;
  }

  computeScores(onboarding);
  await onboarding.save();
  return onboarding.kycFlags.bank;
}

async function getVerificationHistory(companyId, { page = 1, limit = 20, type } = {}) {
  const q = { companyId };
  if (type) q.verificationType = type;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    B2BVerificationLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    B2BVerificationLog.countDocuments(q)
  ]);
  return { items, total, page, limit };
}

module.exports = {
  verifyGstForCompany,
  verifyPanForCompany,
  verifyCinForCompany,
  verifyBankForCompany,
  getVerificationHistory,
  logVerification
};
