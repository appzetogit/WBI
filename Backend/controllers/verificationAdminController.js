const VerificationConfig = require('../models/VerificationConfig');
const VerificationDocument = require('../models/VerificationDocument');
const VerificationRequest = require('../models/VerificationRequest');
const VerificationLog = require('../models/VerificationLog');
const AdminActivityLog = require('../models/AdminActivityLog');
const BankAccount = require('../models/BankAccount');
const Worker = require('../models/Worker');
const Engineer = require('../models/Engineer');
const cloudinary = require('../config/cloudinary');

// Helper to get Owner profile model
const getOwnerModel = (ownerType) => {
  return ownerType === 'engineer' ? Engineer : Worker;
};

// Generates temporary secure signed Cloudinary URL for private/authenticated assets
const generateSignedUrl = (fileKey) => {
  if (!fileKey) return '';
  try {
    // Cloudinary SDK signed URL builder
    return cloudinary.url(fileKey, {
      resource_type: 'auto',
      type: 'authenticated',
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiration
    });
  } catch (error) {
    console.error('Failed to generate Cloudinary signed URL:', error);
    return '';
  }
};

/**
 * Seed Default Verification Configs if none exist
 */
const ensureDefaultConfigs = async () => {
  try {
    const workerCount = await VerificationConfig.countDocuments({ roleType: 'worker' });
    if (workerCount === 0) {
      await VerificationConfig.create({
        roleType: 'worker',
        requiredDocuments: ['aadhaar', 'pan', 'selfie', 'bank_details', 'address_proof'],
        optionalDocuments: ['skill_certificate', 'experience_proof', 'police_verification'],
        autoVerificationEnabled: true,
        manualReviewRequired: true,
        minMatchScore: 70
      });
    }

    const engineerCount = await VerificationConfig.countDocuments({ roleType: 'engineer' });
    if (engineerCount === 0) {
      await VerificationConfig.create({
        roleType: 'engineer',
        requiredDocuments: ['aadhaar', 'pan', 'selfie', 'education_certificate', 'experience_certificate', 'skill_certificate', 'bank_details'],
        optionalDocuments: ['resume'],
        autoVerificationEnabled: true,
        manualReviewRequired: true,
        minMatchScore: 70
      });
    }
  } catch (err) {
    console.error('Error seeding default configs:', err);
  }
};

// Initialize configuration seeding only after DB connects
const mongoose = require('mongoose');
if (mongoose.connection.readyState === 1) {
  ensureDefaultConfigs();
} else {
  mongoose.connection.once('open', ensureDefaultConfigs);
}

/**
 * List all verification requests
 */
exports.getVerifications = async (req, res) => {
  try {
    const { roleType, status, search, ownerId, page = 1, limit = 20 } = req.query;
    const query = {};

    if (roleType) query.ownerType = roleType;
    if (status) query.overallStatus = status;
    if (ownerId && mongoose.Types.ObjectId.isValid(ownerId)) {
      query.ownerId = ownerId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get requests
    let requests = await VerificationRequest.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    let total = await VerificationRequest.countDocuments(query);

    // Populate user profile details for each request
    let enrichedRequests = [];
    for (const r of requests) {
      const ProfileModel = getOwnerModel(r.ownerType);
      const profile = await ProfileModel.findById(r.ownerId).select('name phone email approvalStatus').lean();
      
      enrichedRequests.push({
        ...r,
        profile: profile || { name: 'Unknown User', phone: '', email: '' }
      });
    }

    // Optional search by name / phone / email (in-memory filter after enrich)
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      enrichedRequests = enrichedRequests.filter((r) => {
        const p = r.profile || {};
        return (
          String(p.name || '').toLowerCase().includes(q) ||
          String(p.phone || '').includes(q) ||
          String(p.email || '').toLowerCase().includes(q) ||
          String(r.ownerId || '').toLowerCase().includes(q)
        );
      });
      // When searching without ownerId, scan more broadly
      if (!ownerId) {
        const all = await VerificationRequest.find(roleType ? { ownerType: roleType } : {})
          .sort({ updatedAt: -1 })
          .limit(200)
          .lean();
        enrichedRequests = [];
        for (const r of all) {
          const ProfileModel = getOwnerModel(r.ownerType);
          const profile = await ProfileModel.findById(r.ownerId).select('name phone email approvalStatus').lean();
          const row = { ...r, profile: profile || { name: 'Unknown User', phone: '', email: '' } };
          const p = row.profile;
          if (
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.phone || '').includes(q) ||
            String(p.email || '').toLowerCase().includes(q) ||
            String(r.ownerId || '').toLowerCase().includes(q)
          ) {
            if (!status || r.overallStatus === status) enrichedRequests.push(row);
          }
        }
        total = enrichedRequests.length;
        enrichedRequests = enrichedRequests.slice(skip, skip + parseInt(limit));
      } else {
        total = enrichedRequests.length;
      }
    }

    res.status(200).json({
      success: true,
      data: enrichedRequests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / Math.max(parseInt(limit), 1))
      }
    });

  } catch (error) {
    console.error('Get verifications list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch verification list' });
  }
};

/**
 * Get individual verification request detail
 */
exports.getVerificationDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await VerificationRequest.findById(id).lean();
    if (!request) {
      return res.status(404).json({ success: false, message: 'Verification request not found' });
    }

    const ProfileModel = getOwnerModel(request.ownerType);
    let profile = await ProfileModel.findById(request.ownerId).select('-password').lean();

    // Relink orphan signup KYC docs under this owner before returning gallery
    try {
      const { ensureProfileKycLinked } = require('../services/kycEntityLinkService');
      if (profile) {
        await ensureProfileKycLinked(request.ownerType, profile);
        profile = await ProfileModel.findById(request.ownerId).select('-password').lean();
      }
    } catch (linkErr) {
      console.warn('[getVerificationDetail] KYC link warning:', linkErr.message);
    }

    const docs = await VerificationDocument.find({ ownerId: request.ownerId }).sort({ documentType: 1, side: 1 }).lean();
    const KYCVerification = require('../models/KYCVerification');
    const kycRecords = await KYCVerification.find({
      role: request.ownerType,
      entityId: request.ownerId
    }).lean();

    const isRealFileUrl = (url) =>
      Boolean(url) &&
      url !== 'digilocker-fetch' &&
      (String(url).startsWith('http') || String(url).startsWith('data:') || String(url).startsWith('/'));

    const buildCgpePayload = (doc, kycRec) => {
      if (doc?.cgpeResponse && typeof doc.cgpeResponse === 'object') return doc.cgpeResponse;
      if (kycRec?.rawResponseEncrypted && typeof kycRec.rawResponseEncrypted === 'object') {
        return kycRec.rawResponseEncrypted;
      }
      if (!kycRec) return null;
      const payload = {};
      if (kycRec.verifiedName || kycRec.extractedName) payload.name = kycRec.verifiedName || kycRec.extractedName;
      if (kycRec.documentNumberMasked) payload.documentNumber = kycRec.documentNumberMasked;
      if (kycRec.verificationMode) payload.verificationMode = kycRec.verificationMode;
      if (kycRec.provider) payload.provider = kycRec.provider;
      if (kycRec.status) payload.status = kycRec.status;
      if (kycRec.providerTransactionId) payload.transactionId = kycRec.providerTransactionId;
      if (kycRec.verifiedAt) payload.verifiedAt = kycRec.verifiedAt;
      return Object.keys(payload).length ? payload : null;
    };

    const kycByType = {};
    for (const rec of kycRecords) kycByType[rec.documentType] = rec;

    const enrichedDocs = [];
    for (const d of docs) {
      const rawUrl = isRealFileUrl(d.fileUrl) ? d.fileUrl : null;
      const signed = rawUrl && d.fileKey && d.fileKey !== 'digilocker-fetch'
        ? (generateSignedUrl(d.fileKey) || rawUrl)
        : rawUrl;
      const hasPhysicalFile = Boolean(signed);
      const kycRec = kycByType[d.documentType];

      enrichedDocs.push({
        ...d,
        fileUrl: hasPhysicalFile ? (signed || d.fileUrl) : null,
        signedPreviewUrl: hasPhysicalFile ? signed : null,
        hasPhysicalFile,
        verificationMode: kycRec?.verificationMode || d.verificationMode || null,
        cgpeResponse: buildCgpePayload(d, kycRec),
        documentNumberMasked: d.documentNumberMasked || kycRec?.documentNumberMasked || null,
        verifiedBy: d.verifiedBy || d.reviewedBy || null
      });
    }

    // Also surface KYC physical uploads that may not be in VerificationDocument yet
    for (const rec of kycRecords) {
      const hasFront = enrichedDocs.some(
        (d) => d.documentType === rec.documentType && (d.side === 'front' || d.side === 'single')
      );
      const hasBack = enrichedDocs.some(
        (d) => d.documentType === rec.documentType && d.side === 'back'
      );
      if (isRealFileUrl(rec.fileUrl) && !hasFront) {
        enrichedDocs.push({
          _id: `kyc-${rec._id}-front`,
          documentType: rec.documentType,
          side: 'front',
          fileUrl: rec.fileUrl,
          signedPreviewUrl: rec.fileUrl,
          hasPhysicalFile: true,
          status: rec.physicalUploadStatus === 'uploaded' ? 'pending' : (rec.status || 'pending'),
          documentNumberMasked: rec.documentNumberMasked,
          cgpeResponse: buildCgpePayload(null, rec),
          source: 'kyc'
        });
      }
      if (isRealFileUrl(rec.backFileUrl) && !hasBack) {
        enrichedDocs.push({
          _id: `kyc-${rec._id}-back`,
          documentType: rec.documentType,
          side: 'back',
          fileUrl: rec.backFileUrl,
          signedPreviewUrl: rec.backFileUrl,
          hasPhysicalFile: true,
          status: rec.physicalUploadStatus === 'uploaded' ? 'pending' : (rec.status || 'pending'),
          cgpeResponse: buildCgpePayload(null, rec),
          source: 'kyc'
        });
      }

      // Digital-only KYC (API/DigiLocker) with no VerificationDocument row
      if (!hasFront && !isRealFileUrl(rec.fileUrl) && ['aadhaar', 'pan', 'bank'].includes(rec.documentType)) {
        enrichedDocs.push({
          _id: `kyc-digital-${rec._id}`,
          documentType: rec.documentType,
          side: 'single',
          fileUrl: null,
          signedPreviewUrl: null,
          hasPhysicalFile: false,
          status: rec.status === 'verified' ? 'verified' : (rec.status || 'pending'),
          documentNumberMasked: rec.documentNumberMasked,
          cgpeResponse: buildCgpePayload(null, rec),
          verificationMode: rec.verificationMode,
          source: 'kyc_digital'
        });
      }
    }

    const cgpeStatus = {};
    for (const rec of kycRecords) {
      cgpeStatus[rec.documentType] = {
        status: rec.status,
        provider: rec.provider,
        verificationMode: rec.verificationMode,
        physicalUploadStatus: rec.physicalUploadStatus,
        documentNumberMasked: rec.documentNumberMasked,
        verifiedAt: rec.verifiedAt,
        fileUrl: isRealFileUrl(rec.fileUrl) ? rec.fileUrl : null,
        backFileUrl: isRealFileUrl(rec.backFileUrl) ? rec.backFileUrl : null
      };
    }

    res.status(200).json({
      success: true,
      data: {
        request,
        profile,
        documents: enrichedDocs,
        cgpeStatus,
        verificationSummary: {
          aadhaar: cgpeStatus.aadhaar?.status || 'pending',
          pan: cgpeStatus.pan?.status || 'pending',
          overall: request.overallStatus,
          adminReview: request.adminReviewStatus
        }
      }
    });

  } catch (error) {
    console.error('Get verification detail error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch verification request details' });
  }
};

/**
 * Approve a specific document manually
 */
exports.approveDocument = async (req, res) => {
  try {
    const { id } = req.params; // Request ID
    const { documentType } = req.body;
    const adminId = req.user.id;

    if (!documentType) {
      return res.status(400).json({ success: false, message: 'documentType is required' });
    }

    const request = await VerificationRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Verification request not found' });
    }

    const docs = await VerificationDocument.find({ ownerId: request.ownerId, documentType });
    if (!docs.length) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    for (const doc of docs) {
      doc.status = 'verified';
      doc.rejectionReason = undefined;
      doc.verifiedAt = new Date();
      doc.verifiedBy = adminId;
      doc.reviewedBy = adminId;
      await doc.save();
    }

    // Update Request tracking lists
    request.verifiedDocuments = [...new Set([...request.verifiedDocuments, documentType])];
    request.rejectedDocuments = request.rejectedDocuments.filter(d => d !== documentType);

    // Recalculate overall status
    const allRequiredVerified = request.requiredDocuments.every(d => request.verifiedDocuments.includes(d));
    if (allRequiredVerified) {
      request.overallStatus = 'verified';
      request.adminReviewStatus = 'approved';
      request.finalApprovedBy = adminId;
      request.finalApprovedAt = new Date();
      
      // Update profile status to approved
      const ProfileModel = getOwnerModel(request.ownerType);
      await ProfileModel.findByIdAndUpdate(request.ownerId, {
        approvalStatus: 'approved',
        'documents.status': 'Approved'
      });
    } else {
      request.overallStatus = 'partially_verified';
      request.adminReviewStatus = 'pending';
    }
    await request.save();

    try {
      const { createNotification } = require('./notificationControllers/notificationController');
      await createNotification({
        userId: request.ownerId,
        userModel: request.ownerType === 'engineer' ? 'Engineer' : 'Worker',
        type: allRequiredVerified ? 'documents_approved' : 'document_approved',
        title: allRequiredVerified ? 'Documents approved' : 'Document approved',
        message: allRequiredVerified
          ? 'All required documents were approved. Your account verification is complete.'
          : `Your ${documentType.replace(/_/g, ' ')} was approved by admin.`,
        relatedId: request._id,
        relatedType: 'verification_request',
        pushData: { type: 'document_approved', documentType }
      });
    } catch (notifyErr) {
      console.warn('Approve notify skipped:', notifyErr.message);
    }

    // Log admin activity
    await AdminActivityLog.create({
      adminId,
      action: 'DOCUMENT_APPROVE',
      targetId: docs[0]._id,
      targetType: 'VerificationDocument',
      details: { documentType, ownerId: request.ownerId, sides: docs.map((d) => d.side) },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: `Document ${documentType} approved successfully`,
      data: {
        documents: docs,
        request
      }
    });

  } catch (error) {
    console.error('Approve document error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve document' });
  }
};

/**
 * Reject a specific document manually
 */
exports.rejectDocument = async (req, res) => {
  try {
    const { id } = req.params; // Request ID
    const { documentType, rejectionReason } = req.body;
    const adminId = req.user.id;

    if (!documentType || !rejectionReason) {
      return res.status(400).json({ success: false, message: 'documentType and rejectionReason are required' });
    }

    const request = await VerificationRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Verification request not found' });
    }

    const docs = await VerificationDocument.find({ ownerId: request.ownerId, documentType });
    if (!docs.length) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    for (const doc of docs) {
      doc.status = 'rejected';
      doc.rejectionReason = rejectionReason;
      doc.verifiedAt = undefined;
      doc.reviewedBy = adminId;
      doc.verifiedBy = adminId;
      doc.rejectionHistory = [
        ...(doc.rejectionHistory || []),
        { reason: rejectionReason, rejectedBy: adminId, rejectedAt: new Date(), action: 'reject' }
      ];
      await doc.save();
    }

    // Update Request tracking
    request.rejectedDocuments = [...new Set([...request.rejectedDocuments, documentType])];
    request.verifiedDocuments = request.verifiedDocuments.filter(d => d !== documentType);
    request.overallStatus = 'rejected';
    request.adminReviewStatus = 'rejected';
    await request.save();

    // Revert profile state
    const ProfileModel = getOwnerModel(request.ownerType);
    await ProfileModel.findByIdAndUpdate(request.ownerId, {
      approvalStatus: 'rejected',
      'documents.status': 'Rejected'
    });

    try {
      const { createNotification } = require('./notificationControllers/notificationController');
      await createNotification({
        userId: request.ownerId,
        userModel: request.ownerType === 'engineer' ? 'Engineer' : 'Worker',
        type: 'document_rejected',
        title: 'Document rejected',
        message: `Your ${documentType.replace(/_/g, ' ')} was rejected. Reason: ${rejectionReason}. Please re-upload.`,
        relatedId: request._id,
        relatedType: 'verification_request',
        pushData: { type: 'document_rejected', documentType, rejectionReason }
      });
    } catch (notifyErr) {
      console.warn('Reject notify skipped:', notifyErr.message);
    }

    // Log admin activity
    await AdminActivityLog.create({
      adminId,
      action: 'DOCUMENT_REJECT',
      targetId: docs[0]._id,
      targetType: 'VerificationDocument',
      details: { documentType, rejectionReason, ownerId: request.ownerId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: `Document ${documentType} rejected successfully`,
      data: {
        documents: docs,
        request
      }
    });

  } catch (error) {
    console.error('Reject document error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject document' });
  }
};

/**
 * Request document re-upload
 */
exports.requestReupload = async (req, res) => {
  try {
    const { id } = req.params; // Request ID
    const { documentType, rejectionReason } = req.body;
    const adminId = req.user.id;

    if (!documentType || !rejectionReason) {
      return res.status(400).json({ success: false, message: 'documentType and rejectionReason are required' });
    }

    const request = await VerificationRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Verification request not found' });
    }

    // Set document status to rejected and require reupload
    const doc = await VerificationDocument.findOne({ ownerId: request.ownerId, documentType });
    if (doc) {
      doc.status = 'rejected';
      doc.rejectionReason = `REUPLOAD_REQUESTED: ${rejectionReason}`;
      doc.verifiedAt = undefined;
      doc.reviewedBy = adminId;
      await doc.save();
    }

    // Update tracking
    request.rejectedDocuments = [...new Set([...request.rejectedDocuments, documentType])];
    request.submittedDocuments = request.submittedDocuments.filter(d => d !== documentType);
    request.verifiedDocuments = request.verifiedDocuments.filter(d => d !== documentType);
    request.overallStatus = 'rejected';
    request.adminReviewStatus = 'rejected';
    await request.save();

    // Trigger Notification to user
    const { createNotification } = require('./notificationControllers/notificationController');
    await createNotification({
      userId: request.ownerId,
      userModel: request.ownerType === 'engineer' ? 'Engineer' : 'Worker',
      type: 'document_reupload_requested',
      title: '⚠️ Document Re-upload Required',
      message: `Your uploaded ${documentType} requires re-upload. Reason: ${rejectionReason}`,
      relatedId: request._id,
      relatedType: 'verification_request',
      pushData: {
        type: 'document_reupload_requested',
        documentType
      }
    });

    // Revert profile state
    const ProfileModel = getOwnerModel(request.ownerType);
    await ProfileModel.findByIdAndUpdate(request.ownerId, {
      approvalStatus: 'pending',
      'documents.status': 'Rejected'
    });

    // Log admin activity
    await AdminActivityLog.create({
      adminId,
      action: 'DOCUMENT_REUPLOAD_REQUEST',
      targetId: request._id,
      targetType: 'VerificationRequest',
      details: { documentType, rejectionReason, ownerId: request.ownerId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: `Re-upload of ${documentType} requested successfully`,
      data: request
    });

  } catch (error) {
    console.error('Request re-upload error:', error);
    res.status(500).json({ success: false, message: 'Failed to request document re-upload' });
  }
};

/**
 * Get dynamic verification configurations
 */
exports.getVerificationConfig = async (req, res) => {
  try {
    const configs = await VerificationConfig.find({});
    res.status(200).json({ success: true, data: configs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Edit verification configurations
 */
exports.updateVerificationConfig = async (req, res) => {
  try {
    const { roleType, requiredDocuments, optionalDocuments, autoVerificationEnabled, manualReviewRequired, minMatchScore, reuploadRules } = req.body;
    const adminId = req.user.id;

    if (!roleType || !['worker', 'engineer'].includes(roleType)) {
      return res.status(400).json({ success: false, message: 'roleType must be worker or engineer' });
    }

    let config = await VerificationConfig.findOne({ roleType });
    if (config) {
      if (requiredDocuments) config.requiredDocuments = requiredDocuments;
      if (optionalDocuments) config.optionalDocuments = optionalDocuments;
      if (autoVerificationEnabled !== undefined) config.autoVerificationEnabled = autoVerificationEnabled;
      if (manualReviewRequired !== undefined) config.manualReviewRequired = manualReviewRequired;
      if (minMatchScore !== undefined) config.minMatchScore = minMatchScore;
      if (reuploadRules) config.reuploadRules = reuploadRules;
      await config.save();
    } else {
      config = await VerificationConfig.create({
        roleType,
        requiredDocuments,
        optionalDocuments,
        autoVerificationEnabled,
        manualReviewRequired,
        minMatchScore,
        reuploadRules
      });
    }

    // Log config updates
    await AdminActivityLog.create({
      adminId,
      action: 'CONFIG_UPDATE',
      targetId: config._id,
      targetType: 'VerificationConfig',
      details: { roleType, changes: req.body },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: 'Verification config updated successfully',
      data: config
    });

  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({ success: false, message: 'Failed to update verification config' });
  }
};

/**
 * View CGPE API verification logs
 */
exports.getVerificationLogs = async (req, res) => {
  try {
    const { ownerId, status, page = 1, limit = 50 } = req.query;
    const query = {};
    
    if (ownerId) query.ownerId = ownerId;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const logs = await VerificationLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await VerificationLog.countDocuments(query);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get verification logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve verification logs' });
  }
};
