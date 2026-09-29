const mongoose = require('mongoose');
const { TXN_OPTS } = require('../../utils/txnOptions');
const { logAudit } = require('../../utils/auditLogger');
const Engineer = require('../../models/Engineer');
const { findUserAcrossCollections } = require('../../utils/authHelper');
const { generateOTP, hashOTP, storeOTP, verifyOTP, checkRateLimit } = require('../../utils/redisOtp.util');
const { generateTokenPair, verifyRefreshToken, generateVerificationToken, verifyVerificationToken } = require('../../utils/tokenService');
const { sendRegistrationOTP } = require('../../services/smsService');
const cloudinaryService = require('../../services/cloudinaryService');
const cgpeService = require('../../services/cgpeService');
const { USER_ROLES, ENGINEER_STATUS } = require('../../utils/constants');
const { validationResult } = require('express-validator');
const Worker = require('../../models/Worker');

/**
 * Send OTP for engineer registration/login
 */
const sendOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { phone, email } = req.body;

    // 1. Rate limit check
    const allowed = await checkRateLimit(phone);
    if (!allowed) {
      return res.status(429).json({
        success: false,
        message: 'Too many OTP requests. Please try again after 10 minutes.'
      });
    }

    // 2. Generate OTP
    const otp = generateOTP(phone);
    const otpHash = hashOTP(otp);

    // 3. Store OTP (Redis primary, MongoDB fallback)
    await storeOTP(phone, otpHash);

    // 4. Send OTP via SMS — await so client knows if delivery failed
    const smsResult = await sendRegistrationOTP(phone, otp).catch((err) => {
      console.error(`[OTP] SMS error for engineer ${phone}:`, err);
      return { success: false };
    });
    if (
      !smsResult.success &&
      process.env.USE_DEFAULT_OTP !== 'true' &&
      process.env.NODE_ENV === 'production'
    ) {
      return res.status(502).json({
        success: false,
        message: 'Unable to send OTP SMS. Please check your mobile number and try again.'
      });
    }
    if (!smsResult.success) {
      console.warn(`[OTP] SMS failed for engineer ${phone}, but OTP stored`);
    }

    // Log OTP in development mode only
    if (process.env.NODE_ENV === 'development' || process.env.USE_DEFAULT_OTP === 'true') {
      console.log(`[DEV] OTP for ${phone}: ${otp}`);
    }

    // 5. Send email notification if email provided
    if (email) {
      sendOTPEmail(email, otp, 'verification').catch(err => 
        console.error(`[OTP] Email error for ${email}:`, err)
      );
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      token: 'verification-pending'
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again.'
    });
  }
};

/**
 * Verify OTP and Check Engineer Status (Unified Login/Signup Entry)
 */
const verifyLogin = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // 1. Verify OTP
    const verification = await verifyOTP(phone, otp);
    if (!verification.success) {
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    // 2. Check if user exists dynamically in database
    const searchResult = await findUserAcrossCollections(phone, 'engineer');

    if (searchResult) {
      const { user: foundUser, role: resolvedRole, redirect: resolvedRedirect, model: matchedModel } = searchResult;

      if (!foundUser.isActive && resolvedRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Account deactivated.' });
      }

      // Check vendor specific approval status
      if (resolvedRole === 'vendor') {
        const status = foundUser.approvalStatus || 'pending';
        if (status === 'pending') {
          return res.status(200).json({
            success: true,
            message: 'Your account is currently under review. Please wait for admin approval.',
            vendor: { adminApproval: 'pending' }
          });
        }
        if (status === 'rejected') {
          return res.status(403).json({ success: false, message: 'Account rejected.' });
        }
        if (status === 'suspended') {
          return res.status(403).json({ success: false, message: 'Account suspended.' });
        }
      }

      // SINGLE DEVICE LOGIN: Update Session ID & Clear OLD FCM tokens
      const loginSessionId = Date.now().toString();
      await matchedModel.findByIdAndUpdate(foundUser._id, { 
        loginSessionId,
        $set: { fcmTokens: [], fcmTokenMobile: [] } // Clear all old tokens
      });

      const tokens = generateTokenPair({
        userId: foundUser._id.toString(),
        role: resolvedRole.toUpperCase(),
        profileId: foundUser._id.toString(),
        mobile: foundUser.phone || foundUser.mobile || null,
        email: foundUser.email || null,
        loginSessionId
      });

      const userRes = foundUser.toObject();
      delete userRes.password;
      delete userRes.__v;
      userRes.id = foundUser._id;
      userRes.mobile = foundUser.phone || foundUser.mobile || null;
      userRes.role = resolvedRole;
      userRes.status = foundUser.status || foundUser.approvalStatus || undefined;

      return res.status(200).json({
        success: true,
        isNewUser: false,
        message: 'Login successful',
        token: tokens.accessToken,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: userRes,
        engineer: resolvedRole === 'engineer' ? userRes : undefined,
        role: resolvedRole,
        profileId: foundUser._id.toString(),
        redirectTo: resolvedRedirect,
        platform: 'mobile'
      });

    } else {
      // NEW ENGINEER
      const verificationToken = generateVerificationToken(phone);

      return res.status(200).json({
        success: true,
        isNewUser: true,
        message: 'OTP verified. Please complete registration.',
        verificationToken
      });
    }

  } catch (error) {
    console.error('Verify Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed. Please try again.'
    });
  }
};

/**
 * Register engineer (Multi-Step payload)
 */
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { 
      name, email, phone, password,
      serviceCategories, subServices, skills, secondarySkills,
      uploadedDocuments,
      skillCertificates,
      roleType, role,
      experience, qualification, specialization, city, pincode,
      tshirtSize, toolsAvailable, otherTools, hasBike, vehicleNumber, 
      drivingLicenseUrl, rcUrl, selfieUrl, introVideoUrl,
      registrationDraftId,
      tempEntityId,
      kycEntityId,
      ...customFields // Capture all other dynamic fields here
    } = req.body;

    const currentRole = (roleType || role || '').toLowerCase();
    if (currentRole !== 'engineer') {
      return res.status(400).json({
        success: false,
        message: 'Invalid role payload for engineer registration'
      });
    }

    // Start Mongoose Transaction Session
    const session = await mongoose.startSession();
    session.startTransaction(TXN_OPTS);
    // Several validation branches return early; never leave the transaction or session open
    res.once('finish', () => {
      if (session.hasEnded) return;
      const close = () => session.endSession();
      if (session.inTransaction()) session.abortTransaction().catch(() => {}).finally(close);
      else close();
    });

    try {
      // Check existing
    const existingEngineer = await Engineer.findOne({ $or: [{ phone }, { email }] });
    if (existingEngineer) {
      return res.status(400).json({
        success: false,
        message: 'Engineer already exists with this phone or email. Please login.'
      });
    }

    // Check Worker collection for same phone
    const existingWorker = await Worker.findOne({ phone });
    if (existingWorker) {
      return res.status(400).json({
        success: false,
        message: 'This mobile number is already registered as a Worker. Duplicate roles with the same number are not allowed.'
      });
    }

    // Process Draft
    const EngineerRegistrationDraft = require('../../models/EngineerRegistrationDraft');
    const EngineerRegistrationConfig = require('../../models/EngineerRegistrationConfig');
    const Vendor = require('../../models/Vendor');
    
    let draft = null;
    let vendorId = null;
    let linkedViaCode = null;
    let vendorApprovalStatus = 'not_required';
    const regConfig = await EngineerRegistrationConfig.findOne().lean();
    const joiningFeeEnabled = regConfig?.joiningFeeEnabled !== false;
    const { findVendorByActiveCode, normalizeVendorCode } = require('../../utils/vendorCompanyCode');
    
    if (registrationDraftId) {
      draft = await EngineerRegistrationDraft.findById(registrationDraftId);
      if (!draft) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: 'Invalid registration draft ID' });
      }
      if (draft.joiningFeeStatus !== 'paid' && draft.joiningFeeStatus !== 'skipped') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: 'Joining fee payment is not completed' });
      }

      if (draft.engineerType === 'vendor_engineer') {
        const codeToCheck = normalizeVendorCode(draft.vendorCode || req.body.vendorCode);
        if (!codeToCheck) {
          return res.status(400).json({
            success: false,
            message: 'Vendor company code is required for company engineers'
          });
        }
        // Re-validate server-side (code may have been regenerated/revoked since Step 1)
        const vendor = await findVendorByActiveCode(codeToCheck);
        if (!vendor) {
          return res.status(400).json({
            success: false,
            message: 'Invalid or revoked vendor company code. Ask your vendor for the latest code.'
          });
        }
        vendorId = vendor._id;
        linkedViaCode = vendor.uniqueCompanyCode;
        vendorApprovalStatus = 'pending_approval';
      }
    } else if (joiningFeeEnabled) {
      draft = await EngineerRegistrationDraft.findOne({
        mobile: phone,
        joiningFeeStatus: { $in: ['paid', 'skipped'] }
      })
        .sort({ updatedAt: -1 })
        .session(session);

      if (!draft) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Joining fee payment is required before registration. Complete payment on the fee step.'
        });
      }

      if (draft.engineerType === 'vendor_engineer') {
        const codeToCheck = normalizeVendorCode(draft.vendorCode || req.body.vendorCode);
        if (!codeToCheck) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Vendor company code is required for company engineers'
          });
        }
        const vendor = await findVendorByActiveCode(codeToCheck);
        if (!vendor) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Invalid or revoked vendor company code. Ask your vendor for the latest code.'
          });
        }
        vendorId = vendor._id;
        linkedViaCode = vendor.uniqueCompanyCode;
        vendorApprovalStatus = 'pending_approval';
      }
    } else if ((req.body.engineerType || 'freelancer') === 'vendor_engineer') {
      // Fee disabled path — still require live code validation
      const codeToCheck = normalizeVendorCode(req.body.vendorCode);
      if (!codeToCheck) {
        return res.status(400).json({
          success: false,
          message: 'Vendor company code is required for company engineers'
        });
      }
      const vendor = await findVendorByActiveCode(codeToCheck);
      if (!vendor) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or revoked vendor company code. Ask your vendor for the latest code.'
        });
      }
      vendorId = vendor._id;
      linkedViaCode = vendor.uniqueCompanyCode;
      vendorApprovalStatus = 'pending_approval';
    }

    // Process Documents to Cloudinary
    let processedDocuments = [];
    if (uploadedDocuments && Array.isArray(uploadedDocuments)) {
      for (let doc of uploadedDocuments) {
        let processedDoc = { key: doc.key, status: 'Pending' };
        
        if (doc.url && doc.url.startsWith('data:')) {
          const uploadRes = await cloudinaryService.uploadFile(doc.url, { folder: 'engineers/documents' });
          if (uploadRes.success) processedDoc.url = uploadRes.url;
        } else {
          processedDoc.url = doc.url;
        }

        if (doc.backUrl && doc.backUrl.startsWith('data:')) {
          const uploadResBack = await cloudinaryService.uploadFile(doc.backUrl, { folder: 'engineers/documents' });
          if (uploadResBack.success) processedDoc.backUrl = uploadResBack.url;
        } else {
          processedDoc.backUrl = doc.backUrl;
        }

        processedDocuments.push(processedDoc);
      }
    }

    // Process Skill Certificates Uploads
    let processedCertificates = [];
    if (skillCertificates && Array.isArray(skillCertificates)) {
      for (let cert of skillCertificates) {
        let processedCert = { ...cert };
        if (cert.documentUrl && cert.documentUrl.startsWith('data:')) {
          const uploadRes = await cloudinaryService.uploadFile(cert.documentUrl, { folder: 'engineers/certificates' });
          if (uploadRes.success) processedCert.documentUrl = uploadRes.url;
        }
        processedCertificates.push(processedCert);
      }
    }

    // Process New Media Fields
    const processMedia = async (urlStr, folder) => {
      if (urlStr && urlStr.startsWith('data:')) {
        const uploadRes = await cloudinaryService.uploadFile(urlStr, { folder });
        if (uploadRes.success) return uploadRes.url;
      }
      return urlStr;
    };

    const selfieUrlProcessed = await processMedia(selfieUrl, 'engineers/selfies');
    const introVideoUrlProcessed = await processMedia(introVideoUrl, 'engineers/videos');
    const drivingLicenseUrlProcessed = await processMedia(drivingLicenseUrl, 'engineers/documents');
    const rcUrlProcessed = await processMedia(rcUrl, 'engineers/documents');

    // Extract Aadhaar/PAN
    const aadhaarDoc = processedDocuments.find(d => d.key === 'aadhaar' || d.key === 'aadhar' || d.key === 'Aadhaar Card Front');
    const panDoc = processedDocuments.find(d => d.key === 'pan' || d.key === 'PAN Card Photo');

    // Create engineer within transaction (array format required)
    const [engineer] = await Engineer.create([{
      name, email, phone, password,
      serviceCategories: serviceCategories || [],
      subServices: subServices || [],
      skills: skills || [],
      secondarySkills: secondarySkills || [],
      uploadedDocuments: processedDocuments,
      roleType: 'Engineer',
      experience: experience || 0,
      qualification: qualification || '',
      specialization: specialization || '',
      address: {
        city: city || '',
        pincode: pincode || ''
      },
      pan: {
        number: customFields?.panNumber || '',
        document: panDoc?.url || null
      },
      skillCertificates: processedCertificates,
      documents: {
        aadhaar: aadhaarDoc?.url || null,
        pan: panDoc?.url || null,
        status: 'Pending'
      },
      tshirtSize, toolsAvailable, otherTools, hasBike, vehicleNumber,
      drivingLicenseUrl: drivingLicenseUrlProcessed, rcUrl: rcUrlProcessed, 
      selfieUrl: selfieUrlProcessed, introVideoUrl: introVideoUrlProcessed,
      aadhar: {
        number: customFields?.aadhaarNumber || customFields?.aadharNumber || '',
        document: aadhaarDoc?.url || null,
        backDocument: aadhaarDoc?.backUrl || null
      },
      customFields: {
        ...(customFields || {}),
        // Persist signup KYC temp id so admin can relink orphan docs if needed
        tempEntityId: tempEntityId || kycEntityId || customFields?.tempEntityId || null
      },
      engineerType: draft ? draft.engineerType : (req.body.engineerType || 'freelancer'),
      vendorId: vendorId,
      linkedViaCode: linkedViaCode,
      vendorApprovalStatus: vendorApprovalStatus,
      joiningFeePaid: draft ? (draft.joiningFeeStatus === 'paid' || draft.joiningFeeStatus === 'skipped') : false,
      joiningFeeAmount: draft ? draft.joiningFeeAmount : 0,
      joiningFeeDiscount: draft ? draft.joiningFeeDiscount : 0,
      joiningFeeFinalAmount: draft ? draft.joiningFeeFinalAmount : 0,
      couponCode: draft ? draft.couponCode : '',
      razorpayOrderId: draft ? draft.razorpayOrderId : '',
      razorpayPaymentId: draft ? draft.razorpayPaymentId : '',
      status: ENGINEER_STATUS.OFFLINE,
      // Vendor-linked engineers stay pending until vendor approves; freelancers need platform/KYC path
      approvalStatus: 'pending'
    }], { session });

    if (vendorId && vendorApprovalStatus === 'pending_approval') {
      try {
        const { createNotification } = require('../notificationControllers/notificationController');
        await createNotification({
          vendorId,
          type: 'worker_assigned',
          title: 'New Engineer Join Request',
          message: `${name} wants to join via your company code ${linkedViaCode || ''}. Approve them in Workforce.`,
          relatedId: engineer._id,
          relatedType: 'worker'
        });
      } catch (nErr) {
        console.warn('Vendor join notification failed:', nErr.message);
      }
    }

    // Generate JWT tokens with initial session
    const loginSessionId = Date.now().toString();
    await Engineer.findByIdAndUpdate(engineer._id, { loginSessionId }, { session });

    // Log the audit event within the transaction
    await logAudit({
      actionType: 'ENGINEER_REGISTERED',
      eventMessage: `Engineer ${engineer.name} registered successfully via app from IP ${req.ip}`,
      actorId: engineer._id,
      actorRole: 'engineer',
      targetId: engineer._id,
      targetType: 'Engineer',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      session
    });

    // Commit transaction if all database writes succeed
    await session.commitTransaction();
    session.endSession();

    // Link signup KYC / physical uploads (stored under tempEntityId) → real engineer._id
    try {
      const { linkKycEntityToProfile, ensureProfileKycLinked } = require('../../services/kycEntityLinkService');
      const signupTempId = tempEntityId || kycEntityId || customFields?.tempEntityId;
      if (signupTempId && String(signupTempId) !== String(engineer._id)) {
        await linkKycEntityToProfile({
          role: 'engineer',
          fromEntityId: signupTempId,
          toEntityId: engineer._id
        });
      } else {
        await ensureProfileKycLinked('engineer', engineer);
      }
    } catch (linkErr) {
      console.warn('[Engineer Register] KYC entity link failed:', linkErr.message);
    }

    const tokens = generateTokenPair({
      userId: engineer._id,
      role: USER_ROLES.ENGINEER,
      loginSessionId
    });

    const engineerRes = engineer.toObject();
    delete engineerRes.password;
    delete engineerRes.__v;
    engineerRes.id = engineer._id;

    // Enqueue Heavy Operations to BullMQ (Scaling)
    const { enqueueRegistrationTask } = require('../../queues/registrationQueue');
    await enqueueRegistrationTask('KYC_VERIFICATION', { engineerId: engineer._id });
    await enqueueRegistrationTask('WELCOME_NOTIFICATION', { phone: engineer.phone, email: engineer.email });

    res.status(201).json({
      success: true,
      message: 'Registration received! You will receive a confirmation SMS shortly. Account is pending approval.',
      engineer: engineerRes,
      ...tokens
    });
    } catch (txError) {
      // Rollback database writes if any part of the registration fails
      await session.abortTransaction();
      session.endSession();
      throw txError;
    }
  } catch (error) {
    console.error('Engineer registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Registration failed. Please try again.'
    });
  }
};

const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { phone, password } = req.body;

    const searchResult = await findUserAcrossCollections(phone, 'engineer');
    // Shared Flutter field app: accept engineer OR worker accounts
    if (!searchResult || !['engineer', 'worker'].includes(searchResult.role)) {
      return res.status(404).json({
        success: false,
        message: 'Account not found. Please register as Worker or Engineer first.'
      });
    }

    const { user: foundUser, role: resolvedRole, redirect: resolvedRedirect, model: matchedModel } = searchResult;

    // Verify Password
    const isMatch = await foundUser.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone or password'
      });
    }

    if (!foundUser.isActive && resolvedRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Account deactivated.' });
    }

    // Check vendor specific approval status
    if (resolvedRole === 'vendor') {
      const status = foundUser.approvalStatus || 'pending';
      if (status === 'pending') {
        return res.status(403).json({
          success: false,
          message: 'Your account is pending admin approval. Please wait for approval.'
        });
      }
      if (status === 'rejected') {
        return res.status(403).json({
          success: false,
          message: 'Your account has been rejected. Please contact support.'
        });
      }
      if (status === 'suspended') {
        return res.status(403).json({
          success: false,
          message: 'Your account has been suspended. Please contact support.'
        });
      }
    }

    const loginSessionId = Date.now().toString();
    await matchedModel.findByIdAndUpdate(foundUser._id, { 
      loginSessionId,
      $set: { fcmTokens: [], fcmTokenMobile: [] } // Clear all old tokens
    });

    const tokens = generateTokenPair({
      userId: foundUser._id.toString(),
      role: resolvedRole.toUpperCase(),
      profileId: foundUser._id.toString(),
      mobile: foundUser.phone || foundUser.mobile || null,
      email: foundUser.email || null,
      loginSessionId
    });

    const userRes = foundUser.toObject();
    delete userRes.password;
    delete userRes.__v;
    userRes.id = foundUser._id;
    userRes.mobile = foundUser.phone || foundUser.mobile || null;
    userRes.role = resolvedRole;
    userRes.status = foundUser.status || foundUser.approvalStatus || undefined;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      role: resolvedRole,
      user: userRes,
      engineer: resolvedRole === 'engineer' ? userRes : undefined,
      worker: resolvedRole === 'worker' ? userRes : undefined,
      redirectTo: resolvedRedirect,
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      profileId: foundUser._id.toString(),
      platform: 'mobile'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
};

/**
 * Logout engineer
 */
const logout = async (req, res) => {
  try {
    const { platform = 'web' } = req.body;

    // Clear FCM tokens based on platform and reset Session ID
    if (req.user && req.user.id) {
      const updateQuery = platform === 'mobile'
        ? { $set: { fcmTokenMobile: [], loginSessionId: null } }
        : { $set: { fcmTokens: [], loginSessionId: null } };

      await Engineer.findByIdAndUpdate(req.user.id, updateQuery);
      console.log(`[AUTH] ✅ ${platform} session & tokens cleared for engineer: ${req.user.id}`);

      try {
        const { markEngineerOffline } = require('../../utils/engineerLocationSession.util');
        await markEngineerOffline(req.user.id);
      } catch (_) { /* non-blocking */ }
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

/**
 * Refresh Access Token
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Check if engineer exists
    const engineer = await Engineer.findById(decoded.userId);
    if (!engineer) {
      return res.status(404).json({
        success: false,
        message: 'Engineer not found'
      });
    }

    // Check status
    if (!engineer.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is not active'
      });
    }

    // Verify Session ID
    if (decoded.loginSessionId !== engineer.loginSessionId) {
      return res.status(401).json({ success: false, message: 'LoggedIn on another device.' });
    }

    // Generate new token pair
    const tokens = generateTokenPair({
      userId: engineer._id,
      role: USER_ROLES.ENGINEER,
      loginSessionId: engineer.loginSessionId
    });

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      ...tokens
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
};

/**
 * Verify Aadhaar before completing registration
 */
const verifyAadhaarSignup = async (req, res) => {
  try {
    const { aadhaarNumber } = req.body;
    if (!aadhaarNumber) {
      return res.status(400).json({ success: false, message: 'Aadhaar number is required' });
    }
    const result = await cgpeService.verifyAadhaar(aadhaarNumber);
    res.status(200).json(result);
  } catch (error) {
    console.error('Aadhaar pre-verification error:', error);
    res.status(500).json({ success: false, message: error.response?.data?.message || error.message || 'Verification failed' });
  }
};

/**
 * Verify PAN before completing registration
 */
const verifyPanSignup = async (req, res) => {
  try {
    const { panNumber, fullName, dob } = req.body;
    if (!panNumber || !fullName) {
      return res.status(400).json({ success: false, message: 'PAN number and Full Name are required' });
    }
    const result = await cgpeService.verifyPan(panNumber, fullName, dob);
    res.status(200).json(result);
  } catch (error) {
    console.error('PAN pre-verification error:', error);
    res.status(500).json({ success: false, message: error.response?.data?.message || error.message || 'Verification failed' });
  }
};

/**
 * Initiate DigiLocker Flow
 */
const initiateDigiLockerSignup = async (req, res) => {
  try {
    const { mobileNumber, redirectUrl } = req.body;
    if (!mobileNumber) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }
    if (!redirectUrl) {
      return res.status(400).json({ success: false, message: 'redirectUrl is required' });
    }
    const result = await cgpeService.initiateDigiLocker(mobileNumber, redirectUrl);
    res.status(200).json({
      success: true,
      data: {
        ...result.data,
        authorizationUrl: result.data.authUrl || result.data.authorizationUrl,
        transactionId: result.data.recordId
      }
    });
  } catch (error) {
    console.error('DigiLocker initiate error:', error);
    res.status(500).json({ success: false, message: error.response?.data?.message || error.message || 'DigiLocker initiation failed' });
  }
};

/**
 * Complete DigiLocker Flow (callback + complete per CGPE docs)
 */
const completeDigiLockerSignup = async (req, res) => {
  try {
    const { recordId, transactionId, code, state, codeVerifier } = req.body;
    const id = recordId || transactionId;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Record ID is required' });
    }
    if (code && state && codeVerifier) {
      await cgpeService.callbackDigiLocker(code, state, codeVerifier, id);
    }
    const result = await cgpeService.completeDigiLocker(id);
    res.status(200).json(result);
  } catch (error) {
    console.error('DigiLocker complete error:', error);
    res.status(500).json({ success: false, message: error.response?.data?.message || error.message || 'DigiLocker completion failed' });
  }
};

module.exports = {
  sendOTP,
  verifyLogin,
  register,
  login,
  logout,
  refreshToken,
  verifyAadhaarSignup,
  verifyPanSignup,
  initiateDigiLockerSignup,
  completeDigiLockerSignup
};
