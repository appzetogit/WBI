const B2BOnboardingConfig = require('../../models/B2BOnboardingConfig');
const B2BEnterpriseOnboarding = require('../../models/B2BEnterpriseOnboarding');
const B2BDocument = require('../../models/B2BDocument');
const B2BBranch = require('../../models/B2BBranch');
const B2BOrganizationContact = require('../../models/B2BOrganizationContact');
const B2BVerificationLog = require('../../models/B2BVerificationLog');
const AuditLog = require('../../models/AuditLog');
const {
  getOnboardingState,
  saveOnboardingStep,
  getOrCreateActiveConfig,
  syncServiceCatalogFromPlatform,
  stepFieldMap
} = require('../../services/b2bEnterpriseOnboarding.service');
const {
  verifyGstForCompany,
  verifyPanForCompany,
  verifyCinForCompany,
  verifyBankForCompany,
  getVerificationHistory
} = require('../../services/b2bOnboardingVerification.service');
const {
  evaluateActivation,
  submitOnboarding,
  signSla
} = require('../../services/b2bOnboardingActivation.service');
const { createOTPToken, verifyOTPToken } = require('../../services/otpService');
const { sendOtpEmail } = require('../../utils/emailService');
const { sendOTP: sendOtpSms } = require('../../services/smsService');
const { getOrCreateOnboardingForCompany, pushTimeline } = require('../../services/b2bEnterpriseOnboarding.service');

const getConfig = async (req, res) => {
  try {
    const config = await syncServiceCatalogFromPlatform(await getOrCreateActiveConfig());
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMyOnboarding = async (req, res) => {
  try {
    const companyId = req.companyId;
    const state = await getOnboardingState(companyId);
    res.json({ success: true, data: state });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const saveStep = async (req, res) => {
  try {
    const step = Number(req.params.step);
    const companyId = req.companyId;
    const result = await saveOnboardingStep({
      companyId,
      step,
      payload: req.body,
      actorType: 'b2b',
      actorId: req.user?.id
    });
    const onboarding = result?.onboarding || result;
    const validationErrors = result?.validationErrors || [];
    res.json({ success: true, data: onboarding, validationErrors });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const uploadDocumentMeta = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { documentKey, documentLabel, fileUrl, fileKey, expiresAt } = req.body;
    if (!documentKey || !fileUrl) {
      return res.status(400).json({ success: false, message: 'documentKey and fileUrl are required' });
    }
    const key = String(documentKey).toLowerCase();
    const doc = await B2BDocument.findOneAndUpdate(
      { companyId, documentType: key },
      {
        companyId,
        documentType: key,
        documentLabel: documentLabel || key,
        fileUrl,
        fileKey: fileKey || null,
        status: 'uploaded',
        uploadedAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const submit = async (req, res) => {
  try {
    const onboarding = await submitOnboarding(req.companyId, req.user?.id);
    res.json({ success: true, data: onboarding });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const activationStatus = async (req, res) => {
  try {
    const data = await evaluateActivation(req.companyId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyGst = async (req, res) => {
  try {
    const data = await verifyGstForCompany({
      companyId: req.companyId,
      gstNumber: req.body.gstNumber,
      actorId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    res.json({
      success: true,
      message: 'GST verification completed',
      data: {
        ...data,
        fields: data.raw || data,
        profile: data.raw || data
      }
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
};

const verifyPan = async (req, res) => {
  try {
    const data = await verifyPanForCompany({ companyId: req.companyId, panNumber: req.body.panNumber, actorId: req.user?.id });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const verifyCin = async (req, res) => {
  try {
    const data = await verifyCinForCompany({
      companyId: req.companyId,
      cinNumber: req.body.cinNumber,
      actorId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    res.json({
      success: true,
      data: {
        ...data,
        fields: data.raw || data,
        profile: data.raw || data
      }
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
};

const verifyBank = async (req, res) => {
  try {
    const { accountNumber, ifsc } = req.body;
    const data = await verifyBankForCompany({ companyId: req.companyId, accountNumber, ifsc, actorId: req.user?.id });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const sendContactOtp = async (req, res) => {
  try {
    const { channel, email, phone } = req.body;
    const companyId = req.companyId;
    if (channel === 'email') {
      const { otp } = await createOTPToken({ email, type: 'b2b_onboarding_email' });
      await sendOtpEmail(email, otp, 'b2b');
      return res.json({ success: true, message: 'OTP sent to email' });
    }
    if (channel === 'mobile') {
      const { otp } = await createOTPToken({ phone, type: 'b2b_onboarding_mobile' });
      await sendOtpSms(phone, otp);
      return res.json({ success: true, message: 'OTP sent to mobile' });
    }
    return res.status(400).json({ success: false, message: 'channel must be email or mobile' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyContactOtp = async (req, res) => {
  try {
    const { channel, email, phone, otp } = req.body;
    const type = channel === 'email' ? 'b2b_onboarding_email' : 'b2b_onboarding_mobile';
    const result = await verifyOTPToken({ email, phone, otp, type });
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    const onboarding = await getOrCreateOnboardingForCompany(req.companyId);
    const flagKey = channel === 'email' ? 'contactEmail' : 'contactMobile';
    onboarding.kycFlags[flagKey] = {
      status: 'verified',
      verifiedAt: new Date(),
      provider: 'otp',
      maskedValue: channel === 'email' ? email : phone
    };
    pushTimeline(onboarding, `${flagKey}_verified`, 'b2b', req.user?.id);
    await onboarding.save();
    res.json({ success: true, data: onboarding.kycFlags[flagKey] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verificationHistory = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const data = await getVerificationHistory(req.companyId, { page, limit, type: req.query.type });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const signSlaHandler = async (req, res) => {
  try {
    const data = await signSla(req.companyId, { signaturePayload: req.body, actorId: req.user?.id });
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const getStepsMeta = async (req, res) => {
  res.json({ success: true, data: { steps: stepFieldMap(), totalSteps: 16 } });
};

const listBranches = async (req, res) => {
  try {
    const branches = await B2BBranch.find({ companyId: req.companyId, isActive: true }).lean();
    res.json({ success: true, data: branches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createBranch = async (req, res) => {
  try {
    const branch = await B2BBranch.create({ ...req.body, companyId: req.companyId });
    const onboarding = await getOrCreateOnboardingForCompany(req.companyId);
    const list = onboarding.operationalCoverage?.branches || [];
    list.push({
      _id: branch._id,
      branchName: branch.branchName,
      address: branch.address,
      city: branch.city,
      state: branch.state,
      pincode: branch.pincode,
      contactPerson: branch.contactPerson,
      contactPhone: branch.contactPhone
    });
    onboarding.operationalCoverage = { ...(onboarding.operationalCoverage || {}), branches: list };
    await onboarding.save();
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateBranch = async (req, res) => {
  try {
    const branch = await B2BBranch.findOneAndUpdate(
      { _id: req.params.branchId, companyId: req.companyId },
      req.body,
      { new: true }
    );
    if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
    res.json({ success: true, data: branch });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteBranch = async (req, res) => {
  try {
    const branch = await B2BBranch.findOneAndUpdate(
      { _id: req.params.branchId, companyId: req.companyId },
      { isActive: false },
      { new: true }
    );
    if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
    res.json({ success: true, data: branch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const listContacts = async (req, res) => {
  try {
    const contacts = await B2BOrganizationContact.find({ companyId: req.companyId, deletedAt: null }).lean();
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createOrUpdateContact = async (req, res) => {
  try {
    const { contactId, contactType, name, designation, email, mobile, altPhone, isPrimary } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    let contact;
    if (contactId) {
      contact = await B2BOrganizationContact.findOneAndUpdate(
        { _id: contactId, companyId: req.companyId, deletedAt: null },
        { contactType, name: name.trim(), designation, email: email?.trim(), mobile: mobile?.trim(), altPhone: altPhone?.trim(), isPrimary: !!isPrimary },
        { new: true }
      );
      if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    } else {
      contact = await B2BOrganizationContact.create({
        companyId: req.companyId,
        contactType: contactType || 'other',
        name: name.trim(),
        designation,
        email: email?.trim(),
        mobile: mobile?.trim(),
        altPhone: altPhone?.trim(),
        isPrimary: !!isPrimary
      });
    }
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteContact = async (req, res) => {
  try {
    const contact = await B2BOrganizationContact.findOneAndUpdate(
      { _id: req.params.contactId, companyId: req.companyId, deletedAt: null },
      { deletedAt: new Date() },
      { new: true }
    );
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getActivityTimeline = async (req, res) => {
  try {
    const companyId = req.companyId;
    const onboarding = await B2BEnterpriseOnboarding.findOne({ companyId, deletedAt: null }).lean();
    const verifications = await B2BVerificationLog.find({ companyId }).sort({ createdAt: -1 }).limit(50).lean();
    const audits = await AuditLog.find({
      $or: [
        { targetId: companyId, targetType: 'B2BCompany' },
        { actionType: /^B2B_/ }
      ]
    }).sort({ createdAt: -1 }).limit(50).lean();

    res.json({
      success: true,
      data: {
        onboardingTimeline: onboarding?.timeline || [],
        verifications,
        audits
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getConfig,
  getMyOnboarding,
  saveStep,
  uploadDocumentMeta,
  submit,
  activationStatus,
  verifyGst,
  verifyPan,
  verifyCin,
  verifyBank,
  sendContactOtp,
  verifyContactOtp,
  verificationHistory,
  signSlaHandler,
  getStepsMeta,
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  listContacts,
  createOrUpdateContact,
  deleteContact,
  getActivityTimeline
};
