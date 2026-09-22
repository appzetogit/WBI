/**
 * Vendor company code + engineer join approvals
 */
const mongoose = require('mongoose');
const Vendor = require('../../models/Vendor');
const Engineer = require('../../models/Engineer');
const {
  generateUniqueCompanyCode,
  ensureVendorCompanyCode,
  generateInviteToken
} = require('../../utils/vendorCompanyCode');

const getVendorId = (req) => req.user._id || req.user.id;

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://app.wbinfs.com';

/** GET /api/vendor/company-code — show current code (lazy-generate if approved) */
exports.getCompanyCode = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    if (vendor.approvalStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Company code is available after vendor approval'
      });
    }

    await ensureVendorCompanyCode(vendor);

    res.status(200).json({
      success: true,
      data: {
        uniqueCompanyCode: vendor.uniqueCompanyCode,
        codeStatus: vendor.codeStatus,
        codeGeneratedAt: vendor.codeGeneratedAt,
        codeRegeneratedCount: vendor.codeRegeneratedCount || 0,
        inviteLinkToken: vendor.inviteLinkToken || null,
        inviteLinkExpiresAt: vendor.inviteLinkExpiresAt || null,
        inviteUrl: vendor.inviteLinkToken
          ? `${FRONTEND_URL}/engineer/signup?invite=${vendor.inviteLinkToken}`
          : null,
        companyName: vendor.businessName || vendor.name
      }
    });
  } catch (error) {
    console.error('getCompanyCode:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch company code' });
  }
};

/** POST /api/vendor/regenerate-code — max 3 / 24h */
exports.regenerateCompanyCode = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    if (vendor.approvalStatus !== 'approved') {
      return res.status(403).json({ success: false, message: 'Vendor must be approved' });
    }

    // Rate limit: max 3 regenerations in last 24h (tracked via history timestamps)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = (vendor.companyCodeHistory || []).filter(
      (h) => h.revokedAt && new Date(h.revokedAt) >= since
    ).length;
    if (recent >= 3) {
      return res.status(429).json({
        success: false,
        message: 'Maximum 3 code regenerations per 24 hours. Try again later.'
      });
    }

    if (vendor.uniqueCompanyCode) {
      vendor.companyCodeHistory = vendor.companyCodeHistory || [];
      vendor.companyCodeHistory.push({
        code: vendor.uniqueCompanyCode,
        revokedAt: new Date(),
        reason: 'regenerated'
      });
    }

    const newCode = await generateUniqueCompanyCode();
    vendor.uniqueCompanyCode = newCode;
    vendor.codeStatus = 'active';
    vendor.codeGeneratedAt = new Date();
    vendor.codeRegeneratedCount = (vendor.codeRegeneratedCount || 0) + 1;
    // Invalidate old invite — omit fields (do not set null; unique index collision)
    vendor.set('inviteLinkToken', undefined);
    vendor.set('inviteLinkExpiresAt', undefined);
    if (vendor._doc) {
      delete vendor._doc.inviteLinkToken;
      delete vendor._doc.inviteLinkExpiresAt;
    }
    await vendor.save();
    await Vendor.updateOne(
      { _id: vendor._id },
      { $unset: { inviteLinkToken: '', inviteLinkExpiresAt: '' } }
    );

    res.status(200).json({
      success: true,
      message: 'Company code regenerated. Old code no longer works.',
      newCode,
      data: {
        uniqueCompanyCode: newCode,
        codeGeneratedAt: vendor.codeGeneratedAt,
        codeRegeneratedCount: vendor.codeRegeneratedCount
      }
    });
  } catch (error) {
    console.error('regenerateCompanyCode:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to regenerate code' });
  }
};

/** POST /api/vendor/generate-invite-link */
exports.generateInviteLink = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    if (vendor.approvalStatus !== 'approved') {
      return res.status(403).json({ success: false, message: 'Vendor must be approved' });
    }

    await ensureVendorCompanyCode(vendor);

    let token = generateInviteToken();
    // Ensure uniqueness
    for (let i = 0; i < 5; i++) {
      const clash = await Vendor.exists({ inviteLinkToken: token, _id: { $ne: vendor._id } });
      if (!clash) break;
      token = generateInviteToken();
    }

    vendor.inviteLinkToken = token;
    vendor.inviteLinkExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await vendor.save();

    const inviteUrl = `${FRONTEND_URL}/engineer/signup?invite=${token}`;

    res.status(200).json({
      success: true,
      data: {
        inviteUrl,
        inviteLinkToken: token,
        inviteLinkExpiresAt: vendor.inviteLinkExpiresAt,
        uniqueCompanyCode: vendor.uniqueCompanyCode
      }
    });
  } catch (error) {
    console.error('generateInviteLink:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to generate invite link' });
  }
};

/** GET /api/vendor/engineers/pending-approvals */
exports.listPendingEngineerApprovals = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const engineers = await Engineer.find({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      engineerType: 'vendor_engineer',
      vendorApprovalStatus: 'pending_approval'
    })
      .select('name phone email linkedViaCode vendorApprovalStatus approvalStatus documents createdAt kycStatus')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, data: engineers });
  } catch (error) {
    console.error('listPendingEngineerApprovals:', error);
    res.status(500).json({ success: false, message: 'Failed to list pending engineers' });
  }
};

/** GET /api/vendor/engineers/linked — active linked engineers */
exports.listLinkedEngineers = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const engineers = await Engineer.find({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      engineerType: 'vendor_engineer',
      vendorApprovalStatus: 'approved'
    })
      .select('name phone email linkedViaCode status availability status approvalStatus overallRating city createdAt')
      .sort({ name: 1 })
      .lean();

    res.status(200).json({ success: true, data: engineers });
  } catch (error) {
    console.error('listLinkedEngineers:', error);
    res.status(500).json({ success: false, message: 'Failed to list engineers' });
  }
};

/**
 * POST /api/vendor/engineers/:id/approve
 * Accepts the engineer into the vendor's team. WBI document verification is a
 * separate step that a vendor cannot grant (see vendorEngineers.service).
 */
exports.approveLinkedEngineer = async (req, res) => {
  try {
    const { decideJoinRequest } = require('../../services/vendorEngineers.service');
    const data = await decideJoinRequest({
      vid: getVendorId(req),
      engineerId: req.params.id,
      approve: true,
      actor: { id: getVendorId(req), role: 'vendor' }
    });
    res.status(200).json({ success: true, message: `${data.name} approved`, data });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error('approveLinkedEngineer:', error);
    res.status(status).json({ success: false, message: status >= 500 ? 'Failed to approve engineer' : error.message });
  }
};

/** POST /api/vendor/engineers/:id/reject  { reason? } */
exports.rejectLinkedEngineer = async (req, res) => {
  try {
    const { decideJoinRequest } = require('../../services/vendorEngineers.service');
    const data = await decideJoinRequest({
      vid: getVendorId(req),
      engineerId: req.params.id,
      approve: false,
      reason: req.body?.reason,
      actor: { id: getVendorId(req), role: 'vendor' }
    });
    res.status(200).json({ success: true, message: `${data.name} rejected`, data: { _id: data.id, vendorApprovalStatus: 'rejected' } });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error('rejectLinkedEngineer:', error);
    res.status(status).json({ success: false, message: status >= 500 ? 'Failed to reject engineer' : error.message });
  }
};

/** Internal helper used by admin approve / activate */
exports.ensureCodeOnVendorApproval = async (vendorDoc) => {
  try {
    if (!vendorDoc || vendorDoc.approvalStatus !== 'approved') return;
    await ensureVendorCompanyCode(vendorDoc);
  } catch (e) {
    console.error('ensureCodeOnVendorApproval:', e.message);
  }
};
