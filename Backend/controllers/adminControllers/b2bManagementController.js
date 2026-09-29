const B2BCompany = require('../../models/B2BCompany');
const B2BDocument = require('../../models/B2BDocument');
const B2BBranch = require('../../models/B2BBranch');
const B2BBankAccount = require('../../models/B2BBankAccount');
const B2BCreditProfile = require('../../models/B2BCreditProfile');
const B2BEnterpriseOnboarding = require('../../models/B2BEnterpriseOnboarding');
const { createNotification } = require('../notificationControllers/notificationController');
const { logAudit } = require('../../utils/auditLogger');

/** The signed-in actor, whatever the auth middleware called the field. */
const actorId = (req) => req.user?._id || req.user?.id || null;

/**
 * Get all B2B Companies with filters and pagination
 */
const getAllCompanies = async (req, res) => {
  try {
    const {
      search,
      verificationStatus,
      isActive,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    if (verificationStatus) {
      query.verificationStatus = verificationStatus;
    }
    // Operational status (ACTIVE / SUSPENDED / INACTIVE …), independent of verification.
    if (req.query.accountStatus) {
      query.accountStatus = String(req.query.accountStatus).toUpperCase();
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (search && String(search).trim()) {
      const rx = { $regex: String(search).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      query.$or = [
        { companyName: rx },
        { email: rx },
        { phone: rx },
        { gstNumber: rx },
        { panNumber: rx }
      ];
    }

    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limitNum;

    const companies = await B2BCompany.find(query)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await B2BCompany.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: companies,
      pagination: {
        page: Math.max(parseInt(page, 10) || 1, 1),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Admin B2B Get All Companies Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve B2B companies list',
      error: error.message
    });
  }
};

/**
 * Approve a B2B Company
 */
const approveCompany = async (req, res) => {
  try {
    const { id } = req.params;

    const company = await B2BCompany.findById(id);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'B2B Company not found'
      });
    }

    const before = { verificationStatus: company.verificationStatus, accountStatus: company.accountStatus };

    // Update company verification status
    company.verificationStatus = 'approved';
    company.rejectionReason = null;
    // Keep the operational status in step: an approved company is active,
    // unless an admin has deliberately suspended or deactivated it.
    if (!['SUSPENDED', 'INACTIVE'].includes(company.accountStatus)) {
      company.accountStatus = 'ACTIVE';
      company.statusChangedAt = new Date();
      company.isActive = true;
    }
    
    // Set all documents to verified
    company.documents.forEach(doc => {
      doc.status = 'verified';
      doc.verifiedAt = new Date();
      doc.rejectionReason = null;
    });

    await company.save();

    // Update B2BDocument collection records
    await B2BDocument.updateMany(
      { companyId: company._id },
      { 
        $set: { 
          status: 'verified',
          rejectionReason: null,
          verifiedAt: new Date()
        } 
      }
    );

    await logAudit({
      actionType: 'B2B_COMPANY_APPROVED',
      actorId: actorId(req),
      actorRole: 'admin',
      targetType: 'B2BCompany',
      targetId: company._id,
      oldValue: before,
      newValue: { verificationStatus: company.verificationStatus, accountStatus: company.accountStatus },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'B2B company approved successfully',
      company: {
        id: company._id,
        companyName: company.companyName,
        verificationStatus: company.verificationStatus
      }
    });
  } catch (error) {
    console.error('Admin Approve B2B Company Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve company',
      error: error.message
    });
  }
};

/**
 * Reject a B2B Company
 */
const rejectCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason, rejectedDocuments } = req.body; // rejectedDocuments is array of documentTypes

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const company = await B2BCompany.findById(id);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'B2B Company not found'
      });
    }

    const before = { verificationStatus: company.verificationStatus, accountStatus: company.accountStatus };
    company.verificationStatus = 'rejected';
    company.rejectionReason = rejectionReason;
    company.accountStatus = 'REJECTED';
    company.statusReason = rejectionReason;
    company.statusChangedAt = new Date();

    // Mark documents as rejected
    if (rejectedDocuments && rejectedDocuments.length > 0) {
      company.documents.forEach(doc => {
        if (rejectedDocuments.includes(doc.documentType)) {
          doc.status = 'rejected';
          doc.rejectionReason = rejectionReason;
        } else {
          doc.status = 'verified'; // Assume others are verified
        }
      });
    } else {
      // Reject all documents if none specified
      company.documents.forEach(doc => {
        doc.status = 'rejected';
        doc.rejectionReason = rejectionReason;
      });
    }

    await company.save();

    // Update B2BDocument collection records
    if (rejectedDocuments && rejectedDocuments.length > 0) {
      await B2BDocument.updateMany(
        { companyId: company._id, documentType: { $in: rejectedDocuments } },
        { $set: { status: 'rejected', rejectionReason } }
      );
      await B2BDocument.updateMany(
        { companyId: company._id, documentType: { $nin: rejectedDocuments } },
        { $set: { status: 'verified', rejectionReason: null } }
      );
    } else {
      await B2BDocument.updateMany(
        { companyId: company._id },
        { $set: { status: 'rejected', rejectionReason } }
      );
    }

    await logAudit({
      actionType: 'B2B_COMPANY_REJECTED',
      actorId: actorId(req),
      actorRole: 'admin',
      targetType: 'B2BCompany',
      targetId: company._id,
      oldValue: before,
      newValue: { verificationStatus: 'rejected', accountStatus: 'REJECTED', rejectedDocuments: rejectedDocuments || [] },
      reason: rejectionReason,
      req
    });

    return res.status(200).json({
      success: true,
      message: 'B2B company rejected successfully',
      company: {
        id: company._id,
        companyName: company.companyName,
        verificationStatus: company.verificationStatus,
        rejectionReason: company.rejectionReason
      }
    });
  } catch (error) {
    console.error('Admin Reject B2B Company Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject company',
      error: error.message
    });
  }
};

/**
 * Get B2B Company Details by ID
 */
const getCompanyById = async (req, res) => {
  try {
    const { companyId } = req.params;

    const company = await B2BCompany.findById(companyId).select('-passwordHash');
    if (!company) {
      return res.status(404).json({ success: false, message: 'B2B Company not found' });
    }

    const branches = await B2BBranch.find({ companyId });
    const documents = await B2BDocument.find({ companyId });
    const bankAccount = await B2BBankAccount.findOne({ companyId });
    const creditProfile = await B2BCreditProfile.findOne({ companyId, deletedAt: null });
    const onboarding = await B2BEnterpriseOnboarding.findOne({ companyId, deletedAt: null }).lean();

    return res.status(200).json({
      success: true,
      data: {
        ...company.toObject(),
        branches,
        documents,
        bankAccount,
        creditProfile,
        onboarding
      }
    });
  } catch (error) {
    console.error('getCompanyById error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve company details', error: error.message });
  }
};

/**
 * Verify / Approve a B2B Company
 */
const verifyCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    const company = await B2BCompany.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'B2B Company not found' });
    }

    // Same end state as approveCompany: panels and tabs only understand 'approved'
    company.verificationStatus = 'approved';
    if (!['SUSPENDED', 'INACTIVE'].includes(company.accountStatus)) {
      company.accountStatus = 'ACTIVE';
      company.isActive = true;
    }
    company.rejectionReason = null;
    company.verifiedOn = new Date();
    company.verifiedBy = req.user?.email || 'Admin Team';

    // Verify all documents
    company.documents.forEach(doc => {
      doc.status = 'verified';
      doc.verifiedAt = new Date();
      doc.rejectionReason = null;
    });

    await company.save();

    await B2BDocument.updateMany(
      { companyId: company._id },
      { 
        $set: { 
          status: 'verified',
          rejectionReason: null,
          verifiedAt: new Date()
        } 
      }
    );

    return res.status(200).json({
      success: true,
      message: 'B2B Company verified successfully',
      company
    });
  } catch (error) {
    console.error('verifyCompany error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify company', error: error.message });
  }
};

/**
 * Verify B2B Company Document
 */
const verifyCompanyDocument = async (req, res) => {
  try {
    const { companyId, documentId } = req.params;

    const doc = await B2BDocument.findOne({ _id: documentId, companyId });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    doc.status = 'verified';
    doc.verifiedAt = new Date();
    doc.rejectionReason = null;
    await doc.save();

    // Sync with company embedded documents list
    const company = await B2BCompany.findById(companyId);
    if (company) {
      const companyDoc = company.documents.find(d => d.documentType === doc.documentType);
      if (companyDoc) {
        companyDoc.status = 'verified';
        companyDoc.verifiedAt = new Date();
        companyDoc.rejectionReason = null;
        await company.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Document verified successfully',
      document: doc
    });
  } catch (error) {
    console.error('verifyCompanyDocument error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify document', error: error.message });
  }
};

/**
 * Reject B2B Company Document
 */
const rejectCompanyDocument = async (req, res) => {
  try {
    const { companyId, documentId } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const doc = await B2BDocument.findOne({ _id: documentId, companyId });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    doc.status = 'rejected';
    doc.rejectionReason = rejectionReason;
    await doc.save();

    // Sync with company embedded documents list
    const company = await B2BCompany.findById(companyId);
    if (company) {
      const companyDoc = company.documents.find(d => d.documentType === doc.documentType);
      if (companyDoc) {
        companyDoc.status = 'rejected';
        companyDoc.rejectionReason = rejectionReason;
        await company.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Document rejected successfully',
      document: doc
    });
  } catch (error) {
    console.error('rejectCompanyDocument error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reject document', error: error.message });
  }
};

/**
 * Verify B2B Company Bank Details
 */
const verifyCompanyBank = async (req, res) => {
  try {
    const { companyId } = req.params;

    const bankAccount = await B2BBankAccount.findOne({ companyId });
    if (!bankAccount) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }

    bankAccount.verificationStatus = 'verified';
    bankAccount.verifiedAt = new Date();
    await bankAccount.save();

    return res.status(200).json({
      success: true,
      message: 'Bank account verified successfully',
      bankAccount
    });
  } catch (error) {
    console.error('verifyCompanyBank error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify bank details', error: error.message });
  }
};

const getCompanyUsers = async (req, res) => {
  try {
    const { companyId } = req.params;
    const B2BUser = require('../../models/B2BUser');
    const users = await B2BUser.find({ companyId }).select('-passwordHash -inviteTokenHash');
    return res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('getCompanyUsers error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve company users', error: error.message });
  }
};

const updateCompanyUserStatus = async (req, res) => {
  try {
    const { companyId, userId } = req.params;
    const { status } = req.body;
    const B2BUser = require('../../models/B2BUser');

    if (!['blocked', 'active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Choose active, inactive, or blocked.' });
    }

    const user = await B2BUser.findOne({ _id: userId, companyId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'B2B User not found for this company.' });
    }

    const from = user.status;
    user.status = status;
    await user.save();

    await logAudit({
      actionType: 'B2B_USER_STATUS_CHANGED',
      actorId: actorId(req),
      actorRole: 'admin',
      targetType: 'B2BUser',
      targetId: user._id,
      oldValue: { status: from, companyId },
      newValue: { status },
      reason: String(req.body?.reason || ''),
      req
    });

    // Never send credential hashes to the client.
    const safe = user.toObject();
    delete safe.passwordHash;
    delete safe.inviteTokenHash;
    delete safe.resetPasswordToken;

    return res.status(200).json({
      success: true,
      message: `User status updated to ${status} successfully`,
      data: safe
    });
  } catch (error) {
    console.error('updateCompanyUserStatus error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update company user status', error: error.message });
  }
};

/**
 * PATCH /api/admin/b2b-companies/:companyId/status
 * The operational account status every API gate reads. Suspending or
 * rejecting a company requires a reason, and the change is audited.
 */
const setCompanyStatus = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { status, reason } = req.body || {};
    const next = String(status || '').toUpperCase();
    const allowed = ['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'INACTIVE'];
    if (!allowed.includes(next)) {
      return res.status(400).json({ success: false, message: `status must be one of ${allowed.join(', ')}` });
    }
    if (['SUSPENDED', 'REJECTED', 'INACTIVE'].includes(next) && !String(reason || '').trim()) {
      return res.status(400).json({ success: false, message: 'A reason is required to suspend, reject or deactivate a company' });
    }

    const company = await B2BCompany.findById(companyId);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    const from = company.accountStatus;
    company.accountStatus = next;
    company.statusReason = String(reason || '').trim() || null;
    company.statusChangedAt = new Date();
    // The legacy flags stay in step so older screens keep working.
    company.isActive = !['SUSPENDED', 'REJECTED', 'INACTIVE'].includes(next);
    if (next === 'REJECTED') company.verificationStatus = 'rejected';
    if (next === 'ACTIVE' || next === 'APPROVED') company.verificationStatus = 'approved';
    await company.save();

    await logAudit({
      actionType: 'B2B_COMPANY_STATUS_CHANGED',
      actorId: actorId(req),
      actorRole: 'admin',
      targetType: 'B2BCompany',
      targetId: company._id,
      oldValue: { accountStatus: from },
      newValue: { accountStatus: next },
      reason: reason || '',
      req
    });

    return res.status(200).json({
      success: true,
      message: `${company.companyName} is now ${next}`,
      data: {
        id: company._id,
        accountStatus: company.accountStatus,
        statusReason: company.statusReason,
        isActive: company.isActive
      }
    });
  } catch (error) {
    console.error('Admin B2B Company Status Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to change company status' });
  }
};

/**
 * PATCH /api/admin/b2b-companies/:companyId/controls
 * What the company may raise jobs for, and which pricing/SLA profile and
 * billing mode apply to it. Backend-driven — the panel only renders these.
 */
const updateCompanyControls = async (req, res) => {
  try {
    const { companyId } = req.params;
    const {
      allowedServices, allowedLocations, pricingProfile, slaProfile,
      billingMode, creditLimit, bulkUploadLimit, reason
    } = req.body || {};

    // Validate everything before writing anything, so a bad field never
    // leaves the company half-updated.
    if (creditLimit !== undefined && creditLimit !== null && creditLimit !== '') {
      const n = Number(creditLimit);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ success: false, message: 'creditLimit must be a number >= 0' });
      }
    }

    const company = await B2BCompany.findById(companyId);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    const before = {
      allowedServices: company.allowedServices,
      allowedLocations: company.allowedLocations,
      pricingProfile: company.pricingProfile,
      slaProfile: company.slaProfile,
      billingMode: company.billingMode
    };

    if (Array.isArray(allowedServices)) {
      const codes = allowedServices.map((s) => String(s || '').toUpperCase().trim()).filter(Boolean);
      // Unknown codes would silently lock the company out of every service
      const ServiceConfig = require('../../models/ServiceConfig');
      const known = new Set((await ServiceConfig.find({ categoryCode: { $in: codes } }).select('categoryCode').lean())
        .map((c) => String(c.categoryCode).toUpperCase()));
      const unknown = codes.filter((c) => !known.has(c));
      if (unknown.length) {
        return res.status(400).json({ success: false, message: `Unknown service code(s): ${unknown.join(', ')}` });
      }
      company.allowedServices = codes;
    }
    if (Array.isArray(allowedLocations)) {
      company.allowedLocations = allowedLocations
        .filter((l) => l && l.value)
        .map((l) => ({ type: l.type || 'city', value: String(l.value).trim() }));
    }
    if (bulkUploadLimit !== undefined) {
      const lim = bulkUploadLimit === null || bulkUploadLimit === '' ? null : Number(bulkUploadLimit);
      if (lim !== null && (!Number.isInteger(lim) || lim < 1 || lim > 10000)) {
        return res.status(400).json({ success: false, message: 'bulkUploadLimit must be a whole number between 1 and 10000' });
      }
      company.bulkUploadLimit = lim;
    }
    if (pricingProfile !== undefined) company.pricingProfile = pricingProfile || null;
    if (slaProfile !== undefined) company.slaProfile = slaProfile || null;
    if (billingMode !== undefined) {
      const mode = String(billingMode).toUpperCase();
      if (!['LIVE', 'DEMO'].includes(mode)) {
        return res.status(400).json({ success: false, message: 'billingMode must be LIVE or DEMO' });
      }
      // Moving a company between real and simulated money is a big deal.
      if (mode !== company.billingMode && !String(reason || '').trim()) {
        return res.status(400).json({
          success: false,
          message: 'A reason is required to change how a company is billed'
        });
      }
      company.billingMode = mode;
    }
    await company.save();

    // The credit limit lives on the credit profile; the wallet mirrors it.
    let credit = null;
    if (creditLimit !== undefined) {
      const limit = Number(creditLimit);
      if (!Number.isFinite(limit) || limit < 0) {
        return res.status(400).json({ success: false, message: 'creditLimit must be a number >= 0' });
      }
      credit = await B2BCreditProfile.findOneAndUpdate(
        { companyId: company._id },
        { $set: { approvedLimit: limit } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      const walletLedger = require('../../services/b2bWalletLedger.service');
      await walletLedger.getBalance(company._id);
    }

    await logAudit({
      actionType: 'B2B_COMPANY_CONTROLS_UPDATED',
      actorId: actorId(req),
      actorRole: 'admin',
      targetType: 'B2BCompany',
      targetId: company._id,
      oldValue: before,
      newValue: {
        allowedServices: company.allowedServices,
        allowedLocations: company.allowedLocations,
        bulkUploadLimit: company.bulkUploadLimit,
        pricingProfile: company.pricingProfile,
        slaProfile: company.slaProfile,
        billingMode: company.billingMode,
        creditLimit: credit?.approvedLimit
      },
      reason: reason || '',
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Company controls updated',
      data: {
        id: company._id,
        allowedServices: company.allowedServices,
        allowedLocations: company.allowedLocations,
        bulkUploadLimit: company.bulkUploadLimit,
        pricingProfile: company.pricingProfile,
        slaProfile: company.slaProfile,
        billingMode: company.billingMode,
        creditLimit: credit?.approvedLimit
      }
    });
  } catch (error) {
    console.error('Admin B2B Company Controls Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update company controls' });
  }
};

/** GET /api/admin/b2b-companies/:companyId/activity — the audit trail. */
const getCompanyActivity = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const AuditLog = require('../../models/AuditLog');
    const filter = {
      $or: [
        { targetType: 'B2BCompany', targetId: companyId },
        { targetType: 'B2BContract', 'changes.companyId': String(companyId) }
      ]
    };
    const [rows, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 })
        .skip((pageNum - 1) * perPage).limit(perPage).lean(),
      AuditLog.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: rows.map((r) => ({
        id: r._id,
        action: r.actionType,
        actorRole: r.actorRole,
        actorId: r.actorId,
        oldValue: r.oldValue,
        newValue: r.newValue,
        reason: r.reason || '',
        ip: r.ipAddress || '',
        device: r.deviceId || '',
        at: r.createdAt
      })),
      pagination: { page: pageNum, limit: perPage, total, pages: Math.ceil(total / perPage) }
    });
  } catch (error) {
    console.error('Admin B2B Company Activity Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load the activity log' });
  }
};

module.exports = {
  getAllCompanies,
  approveCompany,
  rejectCompany,
  getCompanyById,
  verifyCompany,
  verifyCompanyDocument,
  rejectCompanyDocument,
  verifyCompanyBank,
  getCompanyUsers,
  updateCompanyUserStatus,
  setCompanyStatus,
  updateCompanyControls,
  getCompanyActivity
};
