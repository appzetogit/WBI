const crypto = require('crypto');
const mongoose = require('mongoose');
const DocumentRule = require('../models/DocumentRule');
const KYCVerification = require('../models/KYCVerification');
const DigiLockerSession = require('../models/DigiLockerSession');
const KYCAuditLog = require('../models/KYCAuditLog');
const cgpeService = require('../services/cgpeService');
const { KYC_AADHAAR_BUILD } = require('../constants/kycAadhaarBuild');
const { setCache, getCache, delCache } = require('../services/redisService');
const VerificationDocument = require('../models/VerificationDocument');
const VendorKYC = require('../models/VendorKYC');

const AADHAAR_OTP_TTL_SEC = 600;
const aadhaarOtpMem = new Map();

function aadhaarOtpCacheKey(entityId) {
  return `kyc:aadhaar:otp:${entityId}`;
}

async function storeAadhaarOtpSession(entityId, aadhaarNumber, clientId, flow = 'doc') {
  if (!entityId || !clientId) return;
  const key = aadhaarOtpCacheKey(entityId);
  const payload = {
    clientId: String(clientId),
    flow: flow || 'doc',
    aadhaarLast4: aadhaarNumber ? String(aadhaarNumber).slice(-4) : null
  };
  aadhaarOtpMem.set(key, { ...payload, exp: Date.now() + AADHAAR_OTP_TTL_SEC * 1000 });
  await setCache(key, payload, AADHAAR_OTP_TTL_SEC);
}

async function resolveAadhaarClientId(entityId, aadhaarNumber, clientIdFromClient) {
  let cached = null;
  if (entityId) {
    const key = aadhaarOtpCacheKey(entityId);
    const mem = aadhaarOtpMem.get(key);
    if (mem && mem.exp > Date.now()) cached = mem.clientId;
    else aadhaarOtpMem.delete(key);
    if (!cached) {
      const fromRedis = await getCache(key);
      if (fromRedis?.clientId) cached = String(fromRedis.clientId);
    }
  }
  const fromClient = clientIdFromClient ? String(clientIdFromClient).trim() : '';
  if (fromClient && cgpeService.isStaleFakeOkycSessionId(fromClient)) {
    return cached || null;
  }
  if (cached) return cached;
  return fromClient || null;
}

// Helper to log audit
const logAudit = async (role, entityId, action, documentType, provider, status, message, req) => {
  try {
    await KYCAuditLog.create({
      role,
      entityId,
      action,
      documentType,
      provider,
      status,
      message,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('User-Agent')
    });
  } catch (err) {
    console.error('[KYC_AUDIT_ERROR] Failed to save audit log:', err);
  }
};

// Helper to sync to legacy schemas
const syncToLegacy = async (role, entityId, documentType, status, fileUrl, fileKey, meta = {}) => {
  try {
    if (role === 'worker' || role === 'engineer') {
      const side = meta.side || 'single';
      // Never persist original filenames as Cloudinary public_id
      let resolvedKey = fileKey;
      if (
        !resolvedKey ||
        resolvedKey === 'digilocker-fetch' ||
        /\s/.test(String(resolvedKey)) ||
        /^Screenshot/i.test(String(resolvedKey)) ||
        /\.(png|jpe?g|webp|gif|pdf)$/i.test(String(resolvedKey))
      ) {
        if (fileUrl && fileUrl !== 'digilocker-fetch' && String(fileUrl).includes('/upload/')) {
          const m = String(fileUrl).match(/\/upload\/(?:.*\/)?v\d+\/(.+)\.[a-zA-Z0-9]+(?:\?|$)/);
          resolvedKey = m?.[1] || fileUrl;
        } else {
          resolvedKey = fileUrl || 'digilocker-fetch';
        }
      }

      const docData = {
        ownerId: entityId,
        ownerType: role,
        documentType,
        side,
        status: status === 'verified' ? 'verified' : (status === 'failed' || status === 'rejected' ? 'rejected' : (status === 'uploaded' ? 'uploaded' : 'under_review')),
        fileUrl: fileUrl || 'digilocker-fetch',
        fileKey: resolvedKey || 'digilocker-fetch',
        documentNumberMasked: meta.documentNumberMasked || null,
        cgpeRequestId: meta.transactionId || null,
        cgpeResponse: meta.rawResponse || null,
        matchScore: meta.matchScore || null,
        mimeType: meta.mimeType || '',
        fileSize: meta.fileSize || 0,
        thumbnailUrl: meta.thumbnailUrl || '',
        uploadedAt: new Date()
      };

      const existing = await VerificationDocument.findOne({ ownerId: entityId, documentType, side });
      if (existing) {
        docData.version = (existing.version || 1) + 1;
      }

      await VerificationDocument.findOneAndUpdate(
        { ownerId: entityId, documentType, side },
        { $set: docData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const ProfileModel = role === 'engineer' ? require('../models/Engineer') : require('../models/Worker');
      const profileUpdate = {};

      if (documentType === 'aadhaar' && fileUrl && fileUrl !== 'digilocker-fetch') {
        if (side === 'back') {
          profileUpdate['aadhar.backDocument'] = fileUrl;
          profileUpdate['documents.aadhaarBackUrl'] = fileUrl;
        } else {
          profileUpdate['aadhar.document'] = fileUrl;
          profileUpdate['documents.aadhaar'] = fileUrl;
          profileUpdate['documents.aadhaarFrontUrl'] = fileUrl;
        }
      }
      if (documentType === 'pan' && fileUrl && fileUrl !== 'digilocker-fetch') {
        profileUpdate['pan.document'] = fileUrl;
        profileUpdate['documents.pan'] = fileUrl;
      }
      if (documentType === 'selfie' && fileUrl && fileUrl !== 'digilocker-fetch' && role === 'engineer') {
        profileUpdate.selfieUrl = fileUrl;
        profileUpdate.selfieStatus = status === 'verified' ? 'approved' : 'pending';
      }
      if (documentType === 'profile_photo' && fileUrl && fileUrl !== 'digilocker-fetch') {
        profileUpdate.profilePhoto = fileUrl;
      }

      if (role === 'engineer') {
        if (documentType === 'license') {
          profileUpdate.licenseVerificationStatus = status === 'verified' ? 'verified' : (status === 'failed' || status === 'rejected' ? 'rejected' : 'uploaded');
          if (fileUrl && fileUrl !== 'digilocker-fetch') profileUpdate.licenseUrl = fileUrl;
        } else if (documentType === 'education_certificate') {
          profileUpdate.educationCertificateStatus = status === 'verified' ? 'verified' : (status === 'failed' || status === 'rejected' ? 'rejected' : 'uploaded');
          if (fileUrl && fileUrl !== 'digilocker-fetch') profileUpdate.educationCertificateUrl = fileUrl;
        }
      }

      if (Object.keys(profileUpdate).length > 0) {
        await ProfileModel.findByIdAndUpdate(entityId, profileUpdate);
      }
    } else if (role === 'vendor') {
      const updateData = {};
      if (documentType === 'aadhaar') {
        updateData.aadhaarStatus = status === 'verified' ? 'verified' : (status === 'failed' || status === 'rejected' ? 'rejected' : 'pending');
        if (fileUrl) updateData.aadhaarUrl = fileUrl;
        if (meta.transactionId) updateData.digilockerReferenceId = meta.transactionId;
        if (status === 'verified') updateData.isDigilockerVerified = true;
      } else if (documentType === 'pan') {
        updateData.panStatus = status === 'verified' ? 'verified' : (status === 'failed' || status === 'rejected' ? 'rejected' : 'pending');
        if (fileUrl) updateData.panUrl = fileUrl;
      } else if (documentType === 'gst') {
        updateData.gstStatus = status === 'verified' ? 'verified' : (status === 'failed' || status === 'rejected' ? 'rejected' : 'pending');
        if (fileUrl) updateData.gstCertificateUrl = fileUrl;
      } else if (documentType === 'selfie') {
        updateData.selfieStatus = status === 'verified' ? 'verified' : (status === 'failed' || status === 'rejected' ? 'rejected' : 'pending');
        if (fileUrl) updateData.ownerSelfieUrl = fileUrl;
      }
      
      if (Object.keys(updateData).length > 0) {
        await VendorKYC.findOneAndUpdate(
          { vendorId: entityId },
          updateData,
          { upsert: true, new: true }
        );
      }
    }
  } catch (err) {
    console.error('[KYC_SYNC_ERROR] Failed to sync to legacy models:', err);
  }
};

exports.getDocumentRules = async (req, res) => {
  try {
    const { role } = req.query;
    if (!role) return res.status(400).json({ success: false, message: 'Role is required' });
    
    let rules = await DocumentRule.find({ role, isActive: true }).sort({ sortOrder: 1 });
    
    // Seed default rules if empty — CGPE modes preserved; physical upload required for ID cards
    if (rules.length === 0) {
      const defaultRules = [
        {
          role,
          documentType: 'aadhaar',
          label: 'Aadhaar Card',
          required: true,
          verificationMode: 'digilocker',
          requirePhysicalUpload: true,
          requiresFrontAndBack: true,
          allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
          maxFileSize: 5 * 1024 * 1024,
          sortOrder: 1
        },
        {
          role,
          documentType: 'pan',
          label: 'PAN Card',
          required: true,
          verificationMode: 'api',
          requirePhysicalUpload: true,
          requiresFrontAndBack: false,
          allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
          maxFileSize: 5 * 1024 * 1024,
          sortOrder: 2
        },
        { role, documentType: 'bank', label: 'Bank Details', required: true, verificationMode: 'api', requirePhysicalUpload: false, sortOrder: 3 },
        {
          role,
          documentType: 'selfie',
          label: 'Selfie / Live Photo',
          required: true,
          verificationMode: 'upload_only',
          requirePhysicalUpload: true,
          allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png'],
          maxFileSize: 5 * 1024 * 1024,
          sortOrder: 4
        },
        {
          role,
          documentType: 'profile_photo',
          label: 'Profile Photo',
          required: true,
          verificationMode: 'upload_only',
          requirePhysicalUpload: true,
          allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png'],
          maxFileSize: 5 * 1024 * 1024,
          sortOrder: 5
        },
        {
          role,
          documentType: 'address_proof',
          label: 'Address Proof',
          required: role === 'worker',
          verificationMode: 'upload_only',
          requirePhysicalUpload: true,
          allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
          maxFileSize: 8 * 1024 * 1024,
          sortOrder: 6
        }
      ];
      if (role === 'engineer') {
        defaultRules.push(
          {
            role: 'engineer',
            documentType: 'education_certificate',
            label: 'Education / Degree Certificate',
            required: true,
            verificationMode: 'upload_only',
            requirePhysicalUpload: true,
            allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
            maxFileSize: 8 * 1024 * 1024,
            sortOrder: 7
          },
          {
            role: 'engineer',
            documentType: 'experience_certificate',
            label: 'Experience Certificate',
            required: false,
            verificationMode: 'upload_only',
            requirePhysicalUpload: true,
            allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
            maxFileSize: 8 * 1024 * 1024,
            sortOrder: 8
          },
          {
            role: 'engineer',
            documentType: 'license',
            label: 'Professional License',
            required: false,
            verificationMode: 'api',
            requirePhysicalUpload: false,
            sortOrder: 9
          }
        );
      }
      if (role === 'worker') {
        defaultRules.push({
          role: 'worker',
          documentType: 'skill_certificate',
          label: 'Skill Certificate',
          required: false,
          verificationMode: 'upload_only',
          requirePhysicalUpload: true,
          allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
          maxFileSize: 8 * 1024 * 1024,
          sortOrder: 7
        });
      }
      await DocumentRule.insertMany(defaultRules);
      rules = await DocumentRule.find({ role, isActive: true }).sort({ sortOrder: 1 });
    } else {
      // Backward-compatible migration: enable physical uploads on existing ID rules without changing CGPE mode
      await DocumentRule.updateMany(
        { role, documentType: 'aadhaar', requirePhysicalUpload: { $ne: true } },
        { $set: { requirePhysicalUpload: true, requiresFrontAndBack: true } }
      );
      await DocumentRule.updateMany(
        { role, documentType: 'pan', requirePhysicalUpload: { $ne: true } },
        { $set: { requirePhysicalUpload: true } }
      );
      rules = await DocumentRule.find({ role, isActive: true }).sort({ sortOrder: 1 });
    }

    // Inject Engineer specific upload rules if missing (do not alter CGPE modes)
    if (role === 'engineer') {
      const needed = [
        {
          documentType: 'education_certificate',
          label: 'Education / Degree Certificate',
          required: true,
          verificationMode: 'upload_only',
          requirePhysicalUpload: true,
          sortOrder: 7
        },
        {
          documentType: 'experience_certificate',
          label: 'Experience Certificate',
          required: false,
          verificationMode: 'upload_only',
          requirePhysicalUpload: true,
          sortOrder: 8
        },
        {
          documentType: 'profile_photo',
          label: 'Profile Photo',
          required: true,
          verificationMode: 'upload_only',
          requirePhysicalUpload: true,
          sortOrder: 5
        }
      ];
      for (const item of needed) {
        const exists = rules.find((r) => r.documentType === item.documentType);
        if (!exists) {
          await DocumentRule.create({
            role: 'engineer',
            ...item,
            allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
            maxFileSize: 8 * 1024 * 1024,
            isActive: true
          });
        }
      }
      rules = await DocumentRule.find({ role, isActive: true }).sort({ sortOrder: 1 });
    }

    if (role === 'worker') {
      const needed = [
        {
          documentType: 'profile_photo',
          label: 'Profile Photo',
          required: true,
          verificationMode: 'upload_only',
          requirePhysicalUpload: true,
          sortOrder: 5
        },
        {
          documentType: 'address_proof',
          label: 'Address Proof',
          required: true,
          verificationMode: 'upload_only',
          requirePhysicalUpload: true,
          sortOrder: 6
        }
      ];
      for (const item of needed) {
        const exists = rules.find((r) => r.documentType === item.documentType);
        if (!exists) {
          await DocumentRule.create({
            role: 'worker',
            ...item,
            allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
            maxFileSize: 8 * 1024 * 1024,
            isActive: true
          });
        }
      }
      rules = await DocumentRule.find({ role, isActive: true }).sort({ sortOrder: 1 });
    }
    
    res.json({ success: true, data: rules });
  } catch (error) {
    console.error('[KYC] getDocumentRules Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching document rules' });
  }
};

/**
 * 6. (Admin) Update/Create Document Rules
 * Allows admin to configure required documents per role dynamically.
 */
exports.updateDocumentRules = async (req, res) => {
  try {
    const { role, documentType, isRequired, verificationMode, requiresFrontAndBack, order } = req.body;
    if (!role || !documentType) {
      return res.status(400).json({ success: false, message: 'Role and documentType are required' });
    }

    let rule = await DocumentRule.findOne({ role, documentType });
    
    if (rule) {
      rule.isRequired = isRequired ?? rule.isRequired;
      rule.verificationMode = verificationMode ?? rule.verificationMode;
      rule.requiresFrontAndBack = requiresFrontAndBack ?? rule.requiresFrontAndBack;
      rule.sortOrder = order ?? rule.sortOrder;
      await rule.save();
    } else {
      rule = await DocumentRule.create({
        role, documentType, isRequired, verificationMode, requiresFrontAndBack, sortOrder: order
      });
    }

    res.json({ success: true, message: 'Document rule updated successfully', data: rule });
  } catch (error) {
    console.error('Update document rule error:', error);
    res.status(500).json({ success: false, message: 'Server error updating rules' });
  }
};

exports.initiateDigiLocker = async (req, res) => {
  try {
    const { role, mobileNumber, redirectUrl, entityId, draftId } = req.body;
    if (!mobileNumber) return res.status(400).json({ success: false, message: 'Mobile number is required' });
    if (!redirectUrl) return res.status(400).json({ success: false, message: 'redirectUrl is required' });
    
    const result = await cgpeService.initiateDigiLocker(mobileNumber, redirectUrl);
    
    const session = await DigiLockerSession.create({
      role: role || 'engineer',
      entityId: entityId || null,
      draftId: draftId || null,
      mobileNumber,
      transactionId: result.data.recordId,
      authorizationUrl: result.data.authUrl,
      status: 'initiated',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    
    await logAudit(role, entityId, 'DIGILOCKER_INITIATE', 'aadhaar', 'cgpe', 'initiated', 'DigiLocker flow initiated', req);
    
    res.json({
      success: true,
      data: {
        authorizationUrl: result.data.authUrl,
        authUrl: result.data.authUrl,
        transactionId: session.transactionId,
        recordId: session.transactionId,
        state: result.data.state || null,
        publicId: result.data.publicId || null
      }
    });
  } catch (error) {
    console.error('[KYC] initiateDigiLocker Error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to initiate DigiLocker' });
  }
};

exports.completeDigiLocker = async (req, res) => {
  try {
    const { transactionId, recordId, code, state, codeVerifier } = req.body;
    const id = transactionId || recordId;
    if (!id) return res.status(400).json({ success: false, message: 'recordId (transactionId) is required' });
    
    let session = await DigiLockerSession.findOne({ transactionId: id });
    
    // CGPE docs step 3: callback with code/state/codeVerifier BEFORE complete
    if (code && state && codeVerifier) {
      await cgpeService.callbackDigiLocker(code, state, codeVerifier, id);
    } else if (!code || !state || !codeVerifier) {
      console.warn('[KYC] DigiLocker complete without full OAuth callback params — attempting complete only');
    }

    const result = await cgpeService.completeDigiLocker(id);
    
    if (session) {
      session.status = 'completed';
      await session.save();
    }
    
    const maskedAadhaar = result.data?.aadhaarNumberMasked || 'XXXX-XXXX-XXXX';
    const entityId = session?.entityId || req.body.entityId;
    const role = session?.role || req.body.role;
    
    if (entityId && role) {
      const kycRec = await KYCVerification.findOneAndUpdate(
        { role, entityId, documentType: 'aadhaar' },
        {
          documentNumberMasked: maskedAadhaar,
          provider: 'digilocker',
          providerTransactionId: id,
          verificationMode: 'digilocker',
          status: 'verified',
          extractedName: result.data?.fullName,
          verifiedName: result.data?.fullName,
          rawResponseEncrypted: result.data,
          verifiedAt: new Date()
        },
        { upsert: true, new: true }
      );
      
      await syncToLegacy(role, entityId, 'aadhaar', 'verified', null, null, {
        documentNumberMasked: maskedAadhaar,
        transactionId: id,
        rawResponse: result.data
      });
      
      await logAudit(role, entityId, 'DIGILOCKER_COMPLETE', 'aadhaar', 'digilocker', 'verified', 'DigiLocker verified', req);
    }
    
    res.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('[KYC] completeDigiLocker Error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to complete DigiLocker' });
  }
};

exports.verifyPan = async (req, res) => {
  try {
    const { role, entityId, panNumber, name } = req.body;
    if (!panNumber) return res.status(400).json({ success: false, message: 'PAN number is required' });
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(panNumber)) {
      return res.status(400).json({ success: false, message: 'Invalid PAN format (e.g., ABCDE1234F)' });
    }
    
    const panHash = crypto.createHash('sha256').update(panNumber.toUpperCase()).digest('hex');
    
    if (entityId) {
      // Check cache to prevent duplicate calls
      const existing = await KYCVerification.findOne({ role, entityId, documentType: 'pan', documentHash: panHash });
      if (existing && existing.status === 'verified') {
        await logAudit(role, entityId, 'PAN_VERIFY_SKIPPED', 'pan', 'cgpe', 'verified', 'Skipped duplicate PAN verification', req);
        return res.json({ success: true, message: 'PAN already verified', data: existing });
      }
    }
    
    const result = await cgpeService.verifyPan(panNumber, name, ''); // Dob might be optional
    
    if (entityId) {
      const kycRec = await KYCVerification.findOneAndUpdate(
        { role, entityId, documentType: 'pan' },
        {
          documentNumberMasked: panNumber.slice(0,2) + 'XXXXX' + panNumber.slice(-3),
          documentHash: panHash,
          provider: 'cgpe',
          providerTransactionId: result.requestId,
          verificationMode: 'api',
          status: 'verified',
          extractedName: result.data?.fullName,
          verifiedName: result.data?.fullName,
          rawResponseEncrypted: result.data,
          verifiedAt: new Date()
        },
        { upsert: true, new: true }
      );
      
      await syncToLegacy(role, entityId, 'pan', 'verified', null, null, {
        documentNumberMasked: kycRec.documentNumberMasked,
        transactionId: result.requestId,
        rawResponse: result.data
      });
      
      await logAudit(role, entityId, 'PAN_VERIFY_SUCCESS', 'pan', 'cgpe', 'verified', 'PAN verified successfully', req);
    }
    
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[KYC] verifyPan Error:', error);
    if (req.body.entityId) {
      await logAudit(req.body.role, req.body.entityId, 'PAN_VERIFY_FAILED', 'pan', 'cgpe', 'failed', error.message, req);
    }
    res.status(400).json({ success: false, message: error.message || 'PAN verification failed' });
  }
};

exports.verifyBank = async (req, res) => {
  try {
    const { role, entityId, accountNumber, ifsc } = req.body;
    if (!accountNumber || !ifsc) return res.status(400).json({ success: false, message: 'Account number and IFSC are required' });
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifsc)) {
      return res.status(400).json({ success: false, message: 'Invalid IFSC format (e.g., HDFC0001234)' });
    }
    
    const bankHash = crypto.createHash('sha256').update(accountNumber + ifsc).digest('hex');
    
    if (entityId) {
      const existing = await KYCVerification.findOne({ role, entityId, documentType: 'bank', documentHash: bankHash });
      if (existing && existing.status === 'verified') {
        return res.json({ success: true, message: 'Bank already verified', data: existing });
      }
    }
    
    const result = await cgpeService.verifyBank(accountNumber, ifsc);
    
    if (entityId) {
      const kycRec = await KYCVerification.findOneAndUpdate(
        { role, entityId, documentType: 'bank' },
        {
          documentNumberMasked: 'XXXX' + accountNumber.slice(-4),
          documentHash: bankHash,
          provider: 'cgpe',
          providerTransactionId: result.requestId,
          verificationMode: 'api',
          status: 'verified',
          extractedName: result.data?.accountHolderName,
          verifiedName: result.data?.accountHolderName,
          rawResponseEncrypted: result.data,
          verifiedAt: new Date()
        },
        { upsert: true, new: true }
      );
      
      await syncToLegacy(role, entityId, 'bank', 'verified', null, null, {
        documentNumberMasked: kycRec.documentNumberMasked,
        transactionId: result.requestId,
        rawResponse: result.data
      });
      await logAudit(role, entityId, 'BANK_VERIFY_SUCCESS', 'bank', 'cgpe', 'verified', 'Bank verified successfully', req);
    }
    
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[KYC] verifyBank Error:', error);
    res.status(400).json({ success: false, message: error.message || 'Bank verification failed' });
  }
};

exports.uploadDocument = async (req, res) => {
  try {
    const {
      role,
      entityId,
      documentType,
      fileUrl,
      fileKey,
      side = 'single',
      mimeType = '',
      fileSize = 0,
      thumbnailUrl = ''
    } = req.body;
    if (!documentType || !fileUrl) {
      return res.status(400).json({ success: false, message: 'documentType and fileUrl are required' });
    }

    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf', ''];
    if (mimeType && !allowedMimes.includes(String(mimeType).toLowerCase()) && !String(mimeType).startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'Invalid file type. Allowed: JPG, JPEG, PNG, PDF' });
    }
    if (fileSize && Number(fileSize) > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File size must be 10MB or less' });
    }

    const normalizedSide = ['front', 'back', 'single'].includes(side) ? side : 'single';
    const rule = await DocumentRule.findOne({ role, documentType, isActive: true });

    if (entityId) {
      const kycPatch = {
        provider: 'manual',
        verificationMode: rule?.verificationMode || 'upload_only',
        mimeType: mimeType || '',
        fileSize: Number(fileSize) || 0,
        physicalUploadStatus: 'uploaded',
        status: rule?.verificationMode === 'upload_only' ? 'pending' : undefined
      };

      if (normalizedSide === 'back') {
        kycPatch.backFileUrl = fileUrl;
        kycPatch.backFileKey = fileKey || fileUrl;
      } else {
        kycPatch.fileUrl = fileUrl;
        kycPatch.fileKey = fileKey || fileUrl;
      }

      // Do not overwrite CGPE verified status with pending when this is a physical add-on upload
      const existing = await KYCVerification.findOne({ role, entityId, documentType });
      if (existing?.status === 'verified') {
        delete kycPatch.status;
      } else if (kycPatch.status === undefined) {
        kycPatch.status = 'pending';
      }

      await KYCVerification.findOneAndUpdate(
        { role, entityId, documentType },
        { $set: kycPatch },
        { upsert: true, new: true }
      );

      await syncToLegacy(role, entityId, documentType, 'uploaded', fileUrl, fileKey || fileUrl, {
        side: normalizedSide,
        mimeType,
        fileSize: Number(fileSize) || 0,
        thumbnailUrl
      });
      await logAudit(role, entityId, 'DOCUMENT_UPLOAD', documentType, 'manual', 'pending', `Document uploaded (${normalizedSide})`, req);

      // Notify under-review when all required physical uploads exist (non-blocking)
      try {
        if (role === 'worker' || role === 'engineer') {
          const { createNotification } = require('./notificationControllers/notificationController');
          await createNotification({
            userId: entityId,
            userModel: role === 'engineer' ? 'Engineer' : 'Worker',
            type: 'document_uploaded',
            title: 'Document uploaded',
            message: `Your ${documentType.replace(/_/g, ' ')} (${normalizedSide}) was uploaded and is pending review.`,
            relatedId: entityId,
            relatedType: 'kyc_document',
            pushData: { type: 'document_uploaded', documentType, side: normalizedSide }
          });
        }
      } catch (notifyErr) {
        console.warn('[KYC] upload notify skipped:', notifyErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      data: { documentType, side: normalizedSide, fileUrl }
    });
  } catch (error) {
    console.error('[KYC] uploadDocument Error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to upload document' });
  }
};

exports.generateAadhaarOtp = async (req, res) => {
  try {
    const { role, entityId, aadhaarNumber: aadhaarRaw } = req.body;
    const aadhaarNumber = String(aadhaarRaw ?? '').replace(/\D/g, '');
    // #region agent log
    fetch('http://127.0.0.1:7577/ingest/6011d822-6630-4485-85a2-a11dfd06147b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7d825b'},body:JSON.stringify({sessionId:'7d825b',runId:'post-fix',hypothesisId:'H1,H5',location:'kycController.js:generateAadhaarOtp:entry',message:'generate-otp request',data:{role,hasEntityId:!!entityId,aadhaarType:typeof aadhaarRaw,aadhaarLen:aadhaarNumber.length,aadhaarMasked:aadhaarNumber?`****${aadhaarNumber.slice(-4)}`:null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!/^\d{12}$/.test(aadhaarNumber)) {
      // #region agent log
      fetch('http://127.0.0.1:7577/ingest/6011d822-6630-4485-85a2-a11dfd06147b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7d825b'},body:JSON.stringify({sessionId:'7d825b',runId:'post-fix',hypothesisId:'H1',location:'kycController.js:generateAadhaarOtp:validationFail',message:'local validation rejected',data:{aadhaarType:typeof aadhaarRaw,aadhaarLen:aadhaarNumber.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return res.status(400).json({ success: false, message: 'Valid 12-digit Aadhaar number is required' });
    }
    
    const result = await cgpeService.generateAadhaarOtp(aadhaarNumber);
    // #region agent log
    fetch('http://127.0.0.1:7577/ingest/6011d822-6630-4485-85a2-a11dfd06147b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7d825b'},body:JSON.stringify({sessionId:'7d825b',hypothesisId:'H2,H3',location:'kycController.js:generateAadhaarOtp:cgpeOk',message:'cgpe generate returned',data:{hasClientId:!!result?.data?.clientId,flow:result?.data?.flow},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (entityId) {
      await storeAadhaarOtpSession(entityId, aadhaarNumber, result.data.clientId, result.data.flow);
      await logAudit(role, entityId, 'AADHAAR_OTP_GENERATED', 'aadhaar', 'cgpe', 'initiated', 'Aadhaar OTP generated successfully', req);
    }
    
    res.json({
      success: true,
      kycBuild: KYC_AADHAAR_BUILD,
      data: {
        clientId: result.data.clientId,
        message: 'OTP sent successfully to Aadhaar registered mobile number'
      }
    });
  } catch (error) {
    console.error('[KYC] generateAadhaarOtp Error:', error);
    // #region agent log
    fetch('http://127.0.0.1:7577/ingest/6011d822-6630-4485-85a2-a11dfd06147b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7d825b'},body:JSON.stringify({sessionId:'7d825b',hypothesisId:'H2,H3,H4',location:'kycController.js:generateAadhaarOtp:catch',message:'generate-otp failed',data:{errMsg:String(error?.message||'').slice(0,200),hasEntityId:!!req.body?.entityId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (req.body.entityId) {
      await logAudit(req.body.role, req.body.entityId, 'AADHAAR_OTP_FAILED', 'aadhaar', 'cgpe', 'failed', error.message, req);
    }
    res.status(400).json({ success: false, message: error.message || 'Failed to generate Aadhaar OTP' });
  }
};

exports.verifyAadhaar = async (req, res) => {
  try {
    const { role, entityId, clientId, otp, aadhaarNumber } = req.body;
    if (!otp || String(otp).trim().length < 4) {
      return res.status(400).json({ success: false, message: 'Valid OTP is required' });
    }
    if (!aadhaarNumber || String(aadhaarNumber).length !== 12 || isNaN(aadhaarNumber)) {
      return res.status(400).json({ success: false, message: 'Valid 12-digit Aadhaar number is required' });
    }

    const resolvedClientId = await resolveAadhaarClientId(entityId, aadhaarNumber, clientId);
    if (!resolvedClientId) {
      return res.status(400).json({
        success: false,
        message: 'OTP session expired. Please tap Get OTP again and use the new code.'
      });
    }

    if (entityId) {
      // Check cache to prevent duplicate calls
      const existing = await KYCVerification.findOne({ role, entityId, documentType: 'aadhaar' });
      if (existing && existing.status === 'verified') {
        await logAudit(role, entityId, 'AADHAAR_VERIFY_SKIPPED', 'aadhaar', 'cgpe', 'verified', 'Skipped duplicate Aadhaar verification', req);
        return res.json({ success: true, message: 'Aadhaar already verified', data: existing });
      }
    }
    
    const result = await cgpeService.verifyAadhaarOtp(resolvedClientId, otp, aadhaarNumber);

    if (entityId) {
      await delCache(aadhaarOtpCacheKey(entityId));
      aadhaarOtpMem.delete(aadhaarOtpCacheKey(entityId));
    }
    
    if (entityId) {
      const kycRec = await KYCVerification.findOneAndUpdate(
        { role, entityId, documentType: 'aadhaar' },
        {
          documentNumberMasked: result.data?.aadhaarNumberMasked || 'Verified',
          provider: 'cgpe',
          providerTransactionId: result.requestId,
          verificationMode: 'api',
          status: 'verified',
          extractedName: result.data?.fullName,
          verifiedName: result.data?.fullName,
          rawResponseEncrypted: result.data,
          verifiedAt: new Date()
        },
        { upsert: true, new: true }
      );
      
      await syncToLegacy(role, entityId, 'aadhaar', 'verified', null, null, {
        documentNumberMasked: kycRec.documentNumberMasked,
        transactionId: result.requestId,
        rawResponse: result.data
      });
      
      await logAudit(role, entityId, 'AADHAAR_VERIFY_SUCCESS', 'aadhaar', 'cgpe', 'verified', 'Aadhaar verified successfully', req);
    }
    
    res.json({ success: true, kycBuild: KYC_AADHAAR_BUILD, data: result.data });
  } catch (error) {
    console.error('[KYC] verifyAadhaar Error:', error);
    if (req.body.entityId) {
      await logAudit(req.body.role, req.body.entityId, 'AADHAAR_VERIFY_FAILED', 'aadhaar', 'cgpe', 'failed', error.message, req);
    }
    let message = error.message || 'Aadhaar verification failed';
    const providerRaw = String(error?.providerMessage || error.message || '');
    if (/not allowed|validation error/i.test(providerRaw) && !/invalid otp/i.test(providerRaw)) {
      message =
        'Aadhaar verify rejected by provider (request format). Deploy latest backend (kycBuild v10) or use DigiLocker.';
    } else if (/^invalid or expired aadhaar otp/i.test(message) || /^invalid otp/i.test(message)) {
      message =
        'Invalid or expired Aadhaar OTP. Tap Get OTP again, use the latest UIDAI SMS (not phone signup OTP), and verify within a few minutes.';
    } else if (/session expired|session id missing|get otp again/i.test(message)) {
      message = 'OTP session expired. Tap Get OTP again and enter the new code.';
    }
    message = message.replace(/^Verification Failed:\s*/i, '').replace(/\s*\(Status:\s*\d+\)\s*$/i, '');
    res.status(400).json({
      success: false,
      kycBuild: KYC_AADHAAR_BUILD,
      message,
      providerMessage: error.providerMessage
        ? String(error.providerMessage).replace(/^Verification Failed:\s*/i, '').slice(0, 200)
        : undefined
    });
  }
};

exports.verifySelfieMatch = async (req, res) => {
  try {
    const { role, entityId } = req.body;
    if (!entityId) return res.status(400).json({ success: false, message: 'Entity ID is required' });

    // Ensure selfie is uploaded
    const selfieRec = await KYCVerification.findOne({ role, entityId, documentType: 'selfie' });
    if (!selfieRec || !selfieRec.fileUrl) {
      return res.status(400).json({ success: false, message: 'Please upload your live photo first' });
    }

    // Get an ID document (Aadhaar or PAN) to match against
    const idRec = await KYCVerification.findOne({ 
      role, 
      entityId, 
      documentType: { $in: ['aadhaar', 'pan'] },
      status: 'verified' 
    });
    
    if (!idRec) {
      // If no ID is available to match against (e.g. config doesn't require Aadhaar/PAN),
      // just mark selfie as verified/uploaded since we can't do face match.
      const kycRec = await KYCVerification.findOneAndUpdate(
        { role, entityId, documentType: 'selfie' },
        { status: 'verified', verificationMode: 'manual', metadata: { note: 'No ID to match against, marked verified' } },
        { new: true }
      );
      await syncToLegacy(role, entityId, 'selfie', 'verified', selfieRec.fileUrl);
      return res.json({ success: true, message: 'Selfie uploaded successfully (No ID available for face match)' });
    }

    if (!idRec.fileUrl) {
      // Note: If digilocker or API was used, fileUrl might not be present.
      // But we will attempt the match if the provider returned an image.
    }

    // Call CGPE API. (Using a dummy ID image if idRec.fileUrl is not available, just to complete the flow in Sandbox).
    const idUrl = idRec.fileUrl || 'dummy_id_image_url';
    const result = await cgpeService.verifyFaceMatch(selfieRec.fileUrl, idUrl);
    
    const minScore = 70;
    const matchScore = result.data?.matchScore || result.data?.match || 0;
    const isMatched = result.data?.isMatch !== undefined ? result.data.isMatch : (matchScore >= minScore);

    const kycRec = await KYCVerification.findOneAndUpdate(
      { role, entityId, documentType: 'selfie' },
      {
        provider: 'cgpe',
        providerTransactionId: result.requestId,
        verificationMode: 'api',
        status: isMatched ? 'verified' : 'rejected',
        rawResponseEncrypted: result.data,
        verifiedAt: isMatched ? new Date() : undefined,
        rejectionReason: isMatched ? undefined : `Face match score ${matchScore.toFixed(1)}% is below threshold`
      },
      { new: true }
    );
    
    await syncToLegacy(role, entityId, 'selfie', isMatched ? 'verified' : 'rejected', selfieRec.fileUrl, selfieRec.fileKey, {
      transactionId: result.requestId,
      matchScore
    });
    
    await logAudit(role, entityId, 'SELFIE_VERIFY', 'selfie', 'cgpe', isMatched ? 'verified' : 'rejected', isMatched ? 'Selfie verified successfully' : 'Selfie match failed', req);

    res.json({ success: true, data: { status: kycRec.status, matchScore } });
  } catch (error) {
    console.error('[KYC] verifySelfieMatch Error:', error);
    if (req.body.entityId) {
      await logAudit(req.body.role, req.body.entityId, 'SELFIE_VERIFY_FAILED', 'selfie', 'cgpe', 'failed', error.message, req);
    }
    res.status(400).json({ success: false, message: error.message || 'Selfie verification failed' });
  }
};

exports.verifyLicense = async (req, res) => {
  try {
    const { role, entityId, dlNumber, dob } = req.body;
    if (!dlNumber || !dob) {
      return res.status(400).json({ success: false, message: 'License Number and DOB are required' });
    }

    const result = await cgpeService.verifyDrivingLicense(dlNumber, dob);

    const kycRec = await KYCVerification.findOneAndUpdate(
      { role, entityId, documentType: 'license' },
      {
        provider: 'cgpe',
        providerTransactionId: result.requestId,
        verificationMode: 'api',
        status: 'verified',
        rawResponseEncrypted: result.data,
        verifiedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    await syncToLegacy(role, entityId, 'license', 'verified', null, null, {
      transactionId: result.requestId,
      ...result.data
    });
    
    if (entityId) {
      await logAudit(role, entityId, 'LICENSE_VERIFIED', 'license', 'cgpe', 'verified', 'License verified successfully via API', req);
    }
    
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[KYC] verifyLicense Error:', error);
    if (req.body.entityId) {
      await logAudit(req.body.role, req.body.entityId, 'LICENSE_VERIFY_FAILED', 'license', 'cgpe', 'failed', error.message, req);
    }
    res.status(400).json({ success: false, message: error.message || 'License verification failed' });
  }
};

/**
 * GET /kyc/status?role=&entityId=
 * Returns map of documentType → verification state for hydrate / skip re-verify UI.
 */
exports.getVerificationStatus = async (req, res) => {
  try {
    const { role, entityId } = req.query;
    if (!role || !entityId) {
      return res.status(400).json({ success: false, message: 'role and entityId are required' });
    }
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({ success: false, message: 'Invalid entityId' });
    }

    const { isExpired, shouldSkipReverify, TTL_DAYS } = require('../utils/kycReverify.util');
    const records = await KYCVerification.find({
      role,
      entityId: new mongoose.Types.ObjectId(entityId)
    }).lean();

    const map = {};
    for (const r of records) {
      const expired = isExpired(r.verifiedAt);
      map[r.documentType] = {
        status: r.status,
        masked: r.documentNumberMasked || null,
        fileUrl: r.fileUrl || null,
        backFileUrl: r.backFileUrl || null,
        verifiedAt: r.verifiedAt || null,
        provider: r.provider || null,
        verificationMode: r.verificationMode,
        physicalUploadStatus: r.physicalUploadStatus,
        failureReason: r.failureReason || null,
        expired,
        skipReverify: shouldSkipReverify(r),
        ttlDays: TTL_DAYS
      };
    }

    res.json({ success: true, data: map });
  } catch (err) {
    console.error('[kyc] getVerificationStatus:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
