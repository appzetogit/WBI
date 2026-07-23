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

/** POST /api/vendor/engineers/:id/approve */
exports.approveLinkedEngineer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const vendorId = getVendorId(req);
    const { id } = req.params;

    const engineer = await Engineer.findOne({
      _id: id,
      vendorId: new mongoose.Types.ObjectId(vendorId),
      engineerType: 'vendor_engineer',
      vendorApprovalStatus: 'pending_approval'
    }).session(session);

    if (!engineer) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Pending engineer not found under your company'
      });
    }

    engineer.vendorApprovalStatus = 'approved';
    engineer.approvalStatus = 'approved';
    engineer.vendorRejectedReason = null;
    await engineer.save({ session });

    await session.commitTransaction();

    try {
      const { sendNotificationToEngineer } = require('../../services/firebaseAdmin');
      await sendNotificationToEngineer(engineer._id, {
        title: 'Vendor Approved You',
        body: 'Your vendor approved your join request. You can now receive assigned jobs.',
        data: { type: 'engineer_vendor_approved', engineerId: String(engineer._id) }
      });
    } catch (nErr) {
      console.warn('approveLinkedEngineer notification:', nErr.message);
    }

    res.status(200).json({
      success: true,
      message: `${engineer.name} approved`,
      data: engineer
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('approveLinkedEngineer:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to approve engineer' });
  } finally {
    session.endSession();
  }
};

/** POST /api/vendor/engineers/:id/reject  { reason? } */
exports.rejectLinkedEngineer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const vendorId = getVendorId(req);
    const { id } = req.params;
    const reason = String(req.body?.reason || 'Rejected by vendor').slice(0, 500);

    const engineer = await Engineer.findOne({
      _id: id,
      vendorId: new mongoose.Types.ObjectId(vendorId),
      engineerType: 'vendor_engineer',
      vendorApprovalStatus: 'pending_approval'
    }).session(session);

    if (!engineer) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Pending engineer not found under your company'
      });
    }

    engineer.vendorApprovalStatus = 'rejected';
    engineer.approvalStatus = 'rejected';
    engineer.vendorRejectedReason = reason;
    engineer.vendorId = null;
    await engineer.save({ session });

    await session.commitTransaction();

    try {
      const { sendNotificationToEngineer } = require('../../services/firebaseAdmin');
      await sendNotificationToEngineer(engineer._id, {
        title: 'Join Request Rejected',
        body: reason || 'Your vendor declined the join request.',
        data: { type: 'engineer_vendor_rejected', engineerId: String(engineer._id) }
      });
    } catch (nErr) {
      console.warn('rejectLinkedEngineer notification:', nErr.message);
    }

    res.status(200).json({
      success: true,
      message: `${engineer.name} rejected`,
      data: { _id: engineer._id, vendorApprovalStatus: 'rejected' }
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('rejectLinkedEngineer:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to reject engineer' });
  } finally {
    session.endSession();
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
