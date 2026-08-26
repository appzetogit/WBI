const B2BCompany = require('../../models/B2BCompany');
const B2BDocument = require('../../models/B2BDocument');
const B2BBranch = require('../../models/B2BBranch');
const B2BBankAccount = require('../../models/B2BBankAccount');
const B2BCreditProfile = require('../../models/B2BCreditProfile');
const B2BEnterpriseOnboarding = require('../../models/B2BEnterpriseOnboarding');
const { createNotification } = require('../notificationControllers/notificationController');

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
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (search) {
      query.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { gstNumber: { $regex: search, $options: 'i' } },
        { panNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const companies = await B2BCompany.find(query)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await B2BCompany.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: companies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
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

    // Update company verification status
    company.verificationStatus = 'approved';
    company.rejectionReason = null;
    
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

    // Notify the company authorized person (simulation or log)
    console.log(`[B2B_APPROVAL] B2B Company approved: ${company.companyName} (${company.email})`);

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

    company.verificationStatus = 'rejected';
    company.rejectionReason = rejectionReason;

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

    console.log(`[B2B_REJECTION] B2B Company rejected: ${company.companyName} (${company.email}). Reason: ${rejectionReason}`);

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

    company.verificationStatus = 'verified'; // or approved
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

    user.status = status;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User status updated to ${status} successfully`,
      data: user
    });
  } catch (error) {
    console.error('updateCompanyUserStatus error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update company user status', error: error.message });
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
  updateCompanyUserStatus
};
