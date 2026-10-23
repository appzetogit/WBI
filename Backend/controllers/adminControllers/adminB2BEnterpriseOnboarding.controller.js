const B2BOnboardingConfig = require('../../models/B2BOnboardingConfig');
const B2BEnterpriseOnboarding = require('../../models/B2BEnterpriseOnboarding');
const B2BDocument = require('../../models/B2BDocument');
const B2BCompany = require('../../models/B2BCompany');
const {
  getOrCreateActiveConfig,
  syncServiceCatalogFromPlatform,
  getOnboardingState
} = require('../../services/b2bEnterpriseOnboarding.service');
const { adminReviewTransition } = require('../../services/b2bOnboardingActivation.service');

const getDashboard = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const q = { deletedAt: null };
    if (status) q.lifecycleStatus = status;

    const skip = (Number(page) - 1) * Number(limit);
    let companyFilter = {};
    if (search) {
      companyFilter = {
        $or: [
          { companyName: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') },
          { gstNumber: new RegExp(search, 'i') }
        ]
      };
    }

    const companies = search
      ? await B2BCompany.find(companyFilter).select('_id').lean()
      : null;
    if (companies) {
      q.companyId = { $in: companies.map((c) => c._id) };
    }

    const [items, total] = await Promise.all([
      B2BEnterpriseOnboarding.find(q)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('companyId', 'companyName email gstNumber panNumber verificationStatus')
        .lean(),
      B2BEnterpriseOnboarding.countDocuments(q)
    ]);

    const summary = await B2BEnterpriseOnboarding.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$lifecycleStatus', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        items,
        total,
        page: Number(page),
        limit: Number(limit),
        statusSummary: summary
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOnboardingDetail = async (req, res) => {
  try {
    const { companyId } = req.params;
    const state = await getOnboardingState(companyId);
    res.json({ success: true, data: state });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** In-app notice to members + one email to the company contact. Never throws. */
const notifyCompany = async (eventKey, companyId, extra = {}) => {
  try {
    const company = await B2BCompany.findById(companyId).select('companyName').lean();
    const { emitAsync } = require('../../services/notification/notificationOrchestrator.service');
    emitAsync(eventKey, {
      targets: { b2bCompanyId: companyId },
      data: { companyId: String(companyId), companyName: company?.companyName, ...extra }
    });
  } catch (err) {
    console.warn(`${eventKey} notify failed:`, err.message);
  }
};

const reviewAction = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { action, note } = req.body;
    const onboarding = await adminReviewTransition({
      companyId,
      action,
      note,
      adminId: req.user?.id
    });
    const decisionLabel = /_reject$/.test(action) ? 'rejected' : action === 'hold' ? 'put on hold' : action === 'admin_approve' ? 'approved' : null;
    if (decisionLabel) notifyCompany('b2b_onboarding_reviewed', companyId, { action, decisionLabel, remarks: note || undefined });
    res.json({ success: true, data: onboarding });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      blockers: error.blockers
    });
  }
};

const verifyDocument = async (req, res) => {
  try {
    const { companyId, documentId } = req.params;
    const doc = await B2BDocument.findOneAndUpdate(
      { _id: documentId, companyId },
      { status: 'verified', verifiedAt: new Date(), rejectionReason: null },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    notifyCompany('b2b_verification_updated', companyId, { subject: String(doc.documentType || 'Document').replace(/_/g, ' '), status: 'verified' });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const rejectDocument = async (req, res) => {
  try {
    const { companyId, documentId } = req.params;
    const doc = await B2BDocument.findOneAndUpdate(
      { _id: documentId, companyId },
      { status: 'rejected', rejectionReason: req.body.reason || 'Rejected', verifiedAt: null },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    notifyCompany('b2b_verification_updated', companyId, { subject: String(doc.documentType || 'Document').replace(/_/g, ' '), status: 'rejected', reason: doc.rejectionReason });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getConfigAdmin = async (req, res) => {
  try {
    const config = await syncServiceCatalogFromPlatform(await getOrCreateActiveConfig());
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateConfig = async (req, res) => {
  try {
    const config = await getOrCreateActiveConfig();
    const allowed = [
      'documentTemplates',
      'serviceCatalog',
      'slaTemplates',
      'projectTemplates',
      'approvalTemplates',
      'paymentRules',
      'activationRules'
    ];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) config[key] = req.body[key];
    });
    config.version = (config.version || 1) + 1;
    await config.save();
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const syncCatalog = async (req, res) => {
  try {
    const config = await syncServiceCatalogFromPlatform(await getOrCreateActiveConfig());
    res.json({ success: true, data: config, message: 'Service catalog synced from platform' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const B2BVerificationLog = require('../../models/B2BVerificationLog');
const AuditLog = require('../../models/AuditLog');
const B2BCreditProfile = require('../../models/B2BCreditProfile');

const getCompanyActivity = async (req, res) => {
  try {
    const { companyId } = req.params;
    const onboarding = await B2BEnterpriseOnboarding.findOne({ companyId, deletedAt: null }).lean();
    const [verifications, audits, credit] = await Promise.all([
      B2BVerificationLog.find({ companyId }).sort({ createdAt: -1 }).limit(100).lean(),
      AuditLog.find({
        $or: [{ targetId: companyId }, { actionType: /^B2B_/ }]
      }).sort({ createdAt: -1 }).limit(100).lean(),
      B2BCreditProfile.findOne({ companyId }).lean()
    ]);
    res.json({
      success: true,
      data: { onboardingTimeline: onboarding?.timeline || [], verifications, audits, creditProfile: credit }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDashboard,
  getOnboardingDetail,
  reviewAction,
  verifyDocument,
  rejectDocument,
  getConfigAdmin,
  updateConfig,
  syncCatalog,
  getCompanyActivity
};
