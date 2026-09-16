const mongoose = require('mongoose');
const { TXN_OPTS } = require('../utils/txnOptions');
const B2BCompany = require('../models/B2BCompany');
const B2BBranch = require('../models/B2BBranch');
const B2BBankAccount = require('../models/B2BBankAccount');
const B2BCreditProfile = require('../models/B2BCreditProfile');
const B2BOrganizationContact = require('../models/B2BOrganizationContact');
const B2BEnterpriseOnboarding = require('../models/B2BEnterpriseOnboarding');
const AuditLog = require('../models/AuditLog');
const { encrypt, maskAccountNumber } = require('../utils/encryption');

async function syncContactsFromOnboarding(companyId, onboarding, session) {
  const ops = [];
  const primary = onboarding.primaryContact || {};
  const finance = onboarding.financeContact || {};

  const upsert = async (contactType, data, flags = {}) => {
    if (!data?.name && !data?.email && !data?.mobile) return;
    await B2BOrganizationContact.findOneAndUpdate(
      { companyId, contactType, deletedAt: null },
      {
        companyId,
        contactType,
        name: data.name || 'Contact',
        designation: data.designation || null,
        email: data.email || null,
        mobile: data.mobile || data.phone || null,
        isPrimary: contactType === 'primary',
        emailVerified: flags.emailVerified || false,
        mobileVerified: flags.mobileVerified || false
      },
      { upsert: true, new: true, session }
    );
  };

  const k = onboarding.kycFlags || {};
  await upsert('primary', primary, {
    emailVerified: k.contactEmail?.status === 'verified',
    mobileVerified: k.contactMobile?.status === 'verified'
  });
  await upsert('finance', finance);
}

async function syncBranchesFromOnboarding(companyId, onboarding, session) {
  const list = onboarding.operationalCoverage?.branches;
  if (!Array.isArray(list) || !list.length) return;

  for (const b of list) {
    if (!b.branchName || !b.address) continue;
    const filter = b._id
      ? { _id: b._id, companyId }
      : { companyId, branchName: b.branchName };
    await B2BBranch.findOneAndUpdate(
      filter,
      {
        companyId,
        branchName: b.branchName,
        address: b.address || b.branchAddress,
        city: b.city,
        state: b.state,
        pincode: b.pincode,
        contactPerson: b.contactPerson || b.contactName || 'Contact',
        contactPhone: b.contactPhone || b.phone || '',
        isActive: b.isActive !== false
      },
      { upsert: true, new: true, session }
    );
  }
}

async function syncBankFromOnboarding(companyId, onboarding, session) {
  const banking = onboarding.banking || {};
  if (!banking.accountNumber || !banking.ifsc) return;
  if (onboarding.kycFlags?.bank?.status !== 'verified') return;

  const encryptedNumber = encrypt(String(banking.accountNumber));
  const masked = maskAccountNumber(String(banking.accountNumber));
  await B2BBankAccount.findOneAndUpdate(
    { companyId },
    {
      companyId,
      accountHolderName: banking.accountHolderName || 'Account Holder',
      accountNumberEncrypted: encryptedNumber,
      accountNumberMasked: masked,
      ifscCode: banking.ifsc,
      bankName: banking.bankName || 'Bank',
      branchName: banking.branchName || 'Branch',
      verificationStatus: 'verified',
      pennyDropStatus: 'success',
      verifiedAt: new Date()
    },
    { upsert: true, new: true, session }
  );
}

async function syncCreditFromOnboarding(companyId, onboarding, session, { approved = false } = {}) {
  const credit = onboarding.creditProfile || {};
  const escrow = onboarding.escrowPaymentRules || {};
  const requested = Number(credit.requestedLimit) || 0;

  await B2BCreditProfile.findOneAndUpdate(
    { companyId },
    {
      companyId,
      requestedLimit: requested,
      approvedLimit: approved ? (Number(credit.approvedLimit) || requested) : 0,
      paymentTermsDays: Number(credit.paymentTermsDays) || 30,
      billingCycle: escrow.billingCycle || credit.billingCycle || 'monthly',
      gstBillingEnabled: escrow.gstBilling !== false,
      invoicePreferences: escrow.invoicePreferences || {},
      purchaseOrderRules: { poMandatory: escrow.poMandatory },
      escrowRequired: escrow.escrowRequired !== false,
      retentionPercent: Number(escrow.retentionPercent) || 0,
      status: approved ? 'approved' : 'pending_review'
    },
    { upsert: true, new: true, session }
  );
}

async function syncCompanyCoreFromOnboarding(companyId, onboarding, session) {
  const info = onboarding.companyInfo || {};
  const addr = onboarding.addresses || {};
  const company = await B2BCompany.findById(companyId).session(session);
  if (!company) return;

  if (info.legalName) company.companyName = info.legalName;
  if (info.brandName) company.brandName = info.brandName;
  if (info.industryType) company.industryType = info.industryType;
  if (info.gstNumber) company.gstNumber = info.gstNumber;
  if (info.panNumber) company.panNumber = info.panNumber;
  if (info.cinNumber) company.cinNumber = info.cinNumber;
  if (addr.registered) company.companyAddress = addr.registered;
  if (addr.billing) company.billingAddress = addr.billing;
  company.onboardingLifecycleStatus = onboarding.lifecycleStatus;
  await company.save({ session });
}

async function syncOnboardingPartial(companyId, onboarding) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await syncCompanyCoreFromOnboarding(companyId, onboarding, session);
      await syncContactsFromOnboarding(companyId, onboarding, session);
      await syncBranchesFromOnboarding(companyId, onboarding, session);
      await syncCreditFromOnboarding(companyId, onboarding, session, { approved: false });
    }, TXN_OPTS);
  } finally {
    session.endSession();
  }
}

async function materializeOnActivation(companyId, onboarding, adminId) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await syncCompanyCoreFromOnboarding(companyId, onboarding, session);
      await syncContactsFromOnboarding(companyId, onboarding, session);
      await syncBranchesFromOnboarding(companyId, onboarding, session);
      await syncBankFromOnboarding(companyId, onboarding, session);
      await syncCreditFromOnboarding(companyId, onboarding, session, { approved: true });

      const company = await B2BCompany.findById(companyId).session(session);
      company.verificationStatus = 'approved';
      company.isActive = true;
      company.onboardingLifecycleStatus = 'active';
      await company.save({ session });

      await AuditLog.create([{
        actionType: 'B2B_ENTERPRISE_ACTIVATED',
        eventMessage: 'Enterprise B2B customer activated',
        actorId: adminId,
        actorRole: 'admin',
        targetId: companyId,
        targetType: 'B2BCompany',
        changes: { lifecycleStatus: 'active', scores: onboarding.scores }
      }], { session });
    }, TXN_OPTS);
  } finally {
    session.endSession();
  }
}

module.exports = {
  syncOnboardingPartial,
  materializeOnActivation,
  syncBranchesFromOnboarding,
  syncContactsFromOnboarding
};
