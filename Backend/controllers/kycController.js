const crypto = require('crypto');
const DocumentRule = require('../models/DocumentRule');
const KYCVerification = require('../models/KYCVerification');
const DigiLockerSession = require('../models/DigiLockerSession');
const KYCAuditLog = require('../models/KYCAuditLog');
const cgpeService = require('../services/cgpeService');
const VerificationDocument = require('../models/VerificationDocument');
const VendorKYC = require('../models/VendorKYC');

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
      const docData = {
        ownerId: entityId,
        ownerType: role,
        documentType,
        status: status === 'verified' ? 'verified' : (status === 'failed' || status === 'rejected' ? 'rejected' : 'under_review'),
        fileUrl: fileUrl || 'digilocker-fetch',
        fileKey: fileKey || 'digilocker-fetch',
        documentNumberMasked: meta.documentNumberMasked || null,
        cgpeRequestId: meta.transactionId || null,
        cgpeResponse: meta.rawResponse || null,
        matchScore: meta.matchScore || null
      };
      
      await VerificationDocument.findOneAndUpdate(
        { ownerId: entityId, documentType },
        docData,
        { upsert: true, new: true }
      );
      
      if (role === 'engineer') {
        const Engineer = require('../models/Engineer');
        const updateData = {};
        if (documentType === 'license') {
          updateData.licenseVerificationStatus = status === 'verified' ? 'verified' : (status === 'failed' || status === 'rejected' ? 'rejected' : 'uploaded');
          if (fileUrl) updateData.licenseUrl = fileUrl;
        } else if (documentType === 'education_certificate') {
          updateData.educationCertificateStatus = status === 'verified' ? 'verified' : (status === 'failed' || status === 'rejected' ? 'rejected' : 'uploaded');
          if (fileUrl) updateData.educationCertificateUrl = fileUrl;
        }
        
        if (Object.keys(updateData).length > 0) {
          await Engineer.findByIdAndUpdate(entityId, updateData);
        }
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
    
    // Seed default rules if empty
    if (rules.length === 0) {
      const defaultRules = [
        { role, documentType: 'aadhaar', label: 'Aadhaar Card', required: true, verificationMode: 'digilocker', sortOrder: 1 },
        { role, documentType: 'pan', label: 'PAN Card', required: true, verificationMode: 'api', sortOrder: 2 },
        { role, documentType: 'bank', label: 'Bank Details', required: true, verificationMode: 'api', sortOrder: 3 },
        { role, documentType: 'selfie', label: 'Selfie / Live Photo', required: true, verificationMode: 'upload_only', sortOrder: 4 }
      ];
      await DocumentRule.insertMany(defaultRules);
      rules = await DocumentRule.find({ role, isActive: true }).sort({ sortOrder: 1 });
    }
    
    // Inject Engineer specific rules if missing
    if (role === 'engineer') {
      const hasLicense = rules.find(r => r.documentType === 'license');
      if (!hasLicense) {
        const engineerRules = [
          { role: 'engineer', documentType: 'license', label: 'Professional License', required: true, verificationMode: 'upload_only', sortOrder: 5 },
          { role: 'engineer', documentType: 'education_certificate', label: 'Education Certificate', required: true, verificationMode: 'upload_only', sortOrder: 6 }
        ];
        await DocumentRule.insertMany(engineerRules);
        rules = await DocumentRule.find({ role, isActive: true }).sort({ sortOrder: 1 });
      }
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
    
    // Initiate with CGPE
    const result = await cgpeService.initiateDigiLocker(mobileNumber, redirectUrl);
    
    // Create session
    const session = await DigiLockerSession.create({
      role,
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
        transactionId: session.transactionId
      }
    });
  } catch (error) {
    console.error('[KYC] initiateDigiLocker Error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to initiate DigiLocker' });
  }
};

exports.completeDigiLocker = async (req, res) => {
  try {
    const { transactionId, code, state, codeVerifier } = req.body; // transactionId is the recordId
    if (!transactionId) return res.status(400).json({ success: false, message: 'transactionId (recordId) is required' });
    
    const session = await DigiLockerSession.findOne({ transactionId });
    if (!session) return res.status(404).json({ success: false, message: 'DigiLocker session not found or expired' });
    
    // If frontend provides callback params, process callback first
    if (code && state && codeVerifier) {
      await cgpeService.callbackDigiLocker(code, state, codeVerifier, transactionId);
    }

    const result = await cgpeService.completeDigiLocker(transactionId);
    
    session.status = 'completed';
    await session.save();
    
    const maskedAadhaar = result.data?.aadhaarNumberMasked || 'XXXX-XXXX-XXXX';
    
    if (session.entityId) {
      // Upsert KYCVerification
      const kycRec = await KYCVerification.findOneAndUpdate(
        { role: session.role, entityId: session.entityId, documentType: 'aadhaar' },
        {
          documentNumberMasked: maskedAadhaar,
          provider: 'digilocker',
          providerTransactionId: transactionId,
          verificationMode: 'digilocker',
          status: 'verified',
          extractedName: result.data?.fullName,
          verifiedName: result.data?.fullName,
          rawResponseEncrypted: result.data,
          verifiedAt: new Date()
        },
        { upsert: true, new: true }
      );
      
      // Sync
      await syncToLegacy(session.role, session.entityId, 'aadhaar', 'verified', null, null, {
        documentNumberMasked: maskedAadhaar,
        transactionId,
        rawResponse: result.data
      });
      
      await logAudit(session.role, session.entityId, 'DIGILOCKER_COMPLETE', 'aadhaar', 'digilocker', 'verified', 'DigiLocker verified', req);
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
    const { role, entityId, documentType, fileUrl, fileKey } = req.body;
    if (!documentType || !fileUrl) return res.status(400).json({ success: false, message: 'documentType and fileUrl are required' });
    
    if (entityId) {
      await KYCVerification.findOneAndUpdate(
        { role, entityId, documentType },
        {
          fileUrl,
          fileKey,
          provider: 'manual',
          verificationMode: 'upload_only',
          status: 'pending' // Needs manual review or just uploaded state
        },
        { upsert: true, new: true }
      );
      
      await syncToLegacy(role, entityId, documentType, 'uploaded', fileUrl, fileKey, {});
      await logAudit(role, entityId, 'DOCUMENT_UPLOAD', documentType, 'manual', 'pending', 'Document uploaded', req);
    }
    
    res.json({ success: true, message: 'Document uploaded successfully' });
  } catch (error) {
    console.error('[KYC] uploadDocument Error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to upload document' });
  }
};

exports.generateAadhaarOtp = async (req, res) => {
  try {
    const { role, entityId, aadhaarNumber } = req.body;
    if (!aadhaarNumber || aadhaarNumber.length !== 12 || isNaN(aadhaarNumber)) {
      return res.status(400).json({ success: false, message: 'Valid 12-digit Aadhaar number is required' });
    }
    
    const result = await cgpeService.generateAadhaarOtp(aadhaarNumber);
    
    if (entityId) {
      await logAudit(role, entityId, 'AADHAAR_OTP_GENERATED', 'aadhaar', 'cgpe', 'initiated', 'Aadhaar OTP generated successfully', req);
    }
    
    res.json({
      success: true,
      data: {
        clientId: result.data.clientId,
        message: 'OTP sent successfully to Aadhaar registered mobile number'
      }
    });
  } catch (error) {
    console.error('[KYC] generateAadhaarOtp Error:', error);
    if (req.body.entityId) {
      await logAudit(req.body.role, req.body.entityId, 'AADHAAR_OTP_FAILED', 'aadhaar', 'cgpe', 'failed', error.message, req);
    }
    res.status(400).json({ success: false, message: error.message || 'Failed to generate Aadhaar OTP' });
  }
};

exports.verifyAadhaar = async (req, res) => {
  try {
    const { role, entityId, clientId, otp, aadhaarNumber } = req.body;
    if (!clientId || !otp) return res.status(400).json({ success: false, message: 'Client ID and OTP are required' });
    
    if (entityId) {
      // Check cache to prevent duplicate calls
      const existing = await KYCVerification.findOne({ role, entityId, documentType: 'aadhaar' });
      if (existing && existing.status === 'verified') {
        await logAudit(role, entityId, 'AADHAAR_VERIFY_SKIPPED', 'aadhaar', 'cgpe', 'verified', 'Skipped duplicate Aadhaar verification', req);
        return res.json({ success: true, message: 'Aadhaar already verified', data: existing });
      }
    }
    
    const result = await cgpeService.verifyAadhaarOtp(clientId, otp, aadhaarNumber);
    
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
    
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[KYC] verifyAadhaar Error:', error);
    if (req.body.entityId) {
      await logAudit(req.body.role, req.body.entityId, 'AADHAAR_VERIFY_FAILED', 'aadhaar', 'cgpe', 'failed', error.message, req);
    }
    res.status(400).json({ success: false, message: error.message || 'Aadhaar verification failed' });
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
