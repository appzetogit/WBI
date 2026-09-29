const B2BCompany = require('../../models/B2BCompany');
const B2BDocument = require('../../models/B2BDocument');
const B2BUser = require('../../models/B2BUser');
const B2BRole = require('../../models/B2BRole');
const { generateTokenPair } = require('../../utils/tokenService');
const bcrypt = require('bcryptjs');
const {
  requireSuccessfulGstVerification,
  buildEntityGstPayload
} = require('../../services/gstVerification.service');
const { normalizeGstin, isValidGstinFormat } = require('../../utils/gst.util');
const {
  requireSuccessfulCinVerification,
  buildEntityCinPayload
} = require('../../services/cinVerification.service');
const { normalizeCin, isValidCinFormat } = require('../../utils/cin.util');

const ensureDefaultRoles = async (companyId) => {
  const defaults = [
    {
      companyId,
      roleName: 'Company Admin',
      permissions: [
        'bulk_jobs.read', 'bulk_jobs.write',
        'jobs.read', 'jobs.write',
        'wallet.read', 'wallet.write',
        'invoices.read',
        'reports.read',
        'support.write',
        'users.manage',
        'company_profile.read', 'company_profile.write'
      ],
      isDefault: true,
      isActive: true
    },
    {
      companyId,
      roleName: 'Operations Manager',
      permissions: [
        'bulk_jobs.read', 'bulk_jobs.write',
        'jobs.read', 'jobs.write',
        'support.write',
        'company_profile.read'
      ],
      isDefault: true,
      isActive: true
    },
    {
      companyId,
      roleName: 'Finance User',
      permissions: [
        'wallet.read', 'wallet.write',
        'invoices.read',
        'reports.read',
        'company_profile.read'
      ],
      isDefault: true,
      isActive: true
    },
    {
      companyId,
      roleName: 'Support User',
      permissions: [
        'support.write',
        'jobs.read',
        'company_profile.read'
      ],
      isDefault: true,
      isActive: true
    },
    {
      companyId,
      roleName: 'Viewer',
      permissions: [
        'bulk_jobs.read',
        'jobs.read',
        'wallet.read',
        'invoices.read',
        'reports.read',
        'company_profile.read'
      ],
      isDefault: true,
      isActive: true
    }
  ];

  for (const role of defaults) {
    const exists = await B2BRole.findOne({ companyId, roleName: role.roleName });
    if (!exists) {
      await B2BRole.create(role);
    }
  }
};

/**
 * Register a new B2B Company
 */
const registerCompany = async (req, res) => {
  try {
    const {
      companyName,
      gstNumber,
      panNumber,
      tanNumber,
      cinNumber,
      logoUrl,
      companyAddress,
      billingAddress,
      branches,
      authorizedPerson,
      email,
      phone,
      password,
      documents,
      gstVerificationId,
      cinVerificationId
    } = req.body;

    const normalizedGst = normalizeGstin(gstNumber);
    if (!normalizedGst || !isValidGstinFormat(normalizedGst)) {
      return res.status(400).json({
        success: false,
        code: 'GST_REQUIRED',
        message: 'A valid GSTIN is required for B2B company registration'
      });
    }

    let gstVerify;
    try {
      gstVerify = await requireSuccessfulGstVerification({
        gstin: normalizedGst,
        verificationId: gstVerificationId || null,
        entityType: 'unbound'
      });
    } catch (gstErr) {
      return res.status(gstErr.statusCode || 422).json({
        success: false,
        code: gstErr.code || 'GST_NOT_VERIFIED',
        message: gstErr.message || 'Please verify your GSTIN before registering'
      });
    }

    const profile = gstVerify.profile || {};
    let cinVerify = null;
    let normalizedCin = null;
    const cinProvided = Boolean(cinNumber && String(cinNumber).trim());
    if (cinProvided || process.env.CIN_REQUIRE_B2B === 'true') {
      normalizedCin = normalizeCin(cinNumber);
      if (!isValidCinFormat(normalizedCin)) {
        return res.status(400).json({
          success: false,
          code: 'CIN_INVALID_FORMAT',
          message: 'A valid CIN is required. Example: U72900MH2019PTC123456'
        });
      }
      try {
        cinVerify = await requireSuccessfulCinVerification({
          cinNumber: normalizedCin,
          verificationId: cinVerificationId || null,
          entityType: 'unbound'
        });
      } catch (cinErr) {
        return res.status(cinErr.statusCode || 422).json({
          success: false,
          code: cinErr.code || 'CIN_NOT_VERIFIED',
          message: cinErr.message || 'Please verify your CIN with MCA before registering'
        });
      }
    }

    const cinProfile = cinVerify?.profile || {};
    const resolvedCompanyName =
      companyName || cinProfile.companyName || profile.legalName || profile.tradeName;
    const resolvedPan = panNumber || profile.pan;
    const resolvedAddress =
      companyAddress || cinProfile.registeredAddress || profile.businessAddress;

    // 1. Check for duplicates dynamically
    const orConditions = [];
    if (email) orConditions.push({ email: email.toLowerCase().trim() });
    if (phone) orConditions.push({ phone: phone.trim() });
    if (normalizedGst) orConditions.push({ gstNumber: normalizedGst });
    if (resolvedPan) orConditions.push({ panNumber: String(resolvedPan).trim().toUpperCase() });
    if (normalizedCin) orConditions.push({ cinNumber: normalizedCin });

    if (orConditions.length > 0) {
      const existingCompany = await B2BCompany.findOne({ $or: orConditions });

      if (existingCompany) {
        if (email && existingCompany.email === email.toLowerCase().trim()) {
          return res.status(400).json({ success: false, message: 'A B2B company is already registered with this email address' });
        }
        if (phone && existingCompany.phone === phone.trim()) {
          return res.status(400).json({ success: false, message: 'A B2B company is already registered with this phone number' });
        }
        if (existingCompany.gstNumber === normalizedGst) {
          return res.status(400).json({ success: false, code: 'GST_DUPLICATE', message: 'A B2B company is already registered with this GSTIN' });
        }
        if (normalizedCin && existingCompany.cinNumber === normalizedCin) {
          return res.status(400).json({ success: false, code: 'CIN_DUPLICATE', message: 'A B2B company is already registered with this CIN' });
        }
        if (resolvedPan && existingCompany.panNumber === String(resolvedPan).trim().toUpperCase()) {
          return res.status(400).json({ success: false, message: 'A B2B company is already registered with this PAN' });
        }
        return res.status(400).json({ success: false, message: 'A B2B company is already registered with these details' });
      }
    }

    // 2. Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Prepare documents array for model
    const companyDocs = (documents || []).map(doc => ({
      documentType: doc.documentType,
      fileUrl: doc.fileUrl,
      fileKey: doc.fileKey || null,
      status: 'uploaded',
      uploadedAt: new Date()
    }));

    // 4. Create company record (locked GST + CIN snapshots)
    const companyCreate = {
      companyName: resolvedCompanyName,
      gstNumber: normalizedGst,
      panNumber: resolvedPan,
      tanNumber,
      cinNumber: normalizedCin || null,
      logoUrl: logoUrl || null,
      companyAddress: resolvedAddress,
      billingAddress,
      branches: branches || [],
      authorizedPerson,
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      passwordHash,
      documents: companyDocs,
      verificationStatus: 'pending',
      isActive: true,
      walletBalance: 0,
      gstVerification: buildEntityGstPayload(
        { ...profile, gstin: normalizedGst },
        gstVerify.record._id,
        gstVerify.record.verificationStatus === 'admin_approved' ? 'admin_approved' : 'verified'
      )
    };
    if (cinVerify) {
      companyCreate.cinVerification = buildEntityCinPayload(
        { ...cinProfile, cin: normalizedCin },
        cinVerify.record._id,
        cinVerify.record.verificationStatus === 'admin_approved' ? 'admin_approved' : 'verified'
      );
    }

    const company = await B2BCompany.create(companyCreate);

    // Bind unbound verification to the new company
    try {
      await requireSuccessfulGstVerification({
        gstin: normalizedGst,
        verificationId: gstVerify.record._id,
        entityType: 'b2b',
        entityId: company._id
      });
    } catch (bindErr) {
      console.warn('[B2B_REGISTER] GST bind warning:', bindErr.message);
    }
    if (cinVerify) {
      try {
        await requireSuccessfulCinVerification({
          cinNumber: normalizedCin,
          verificationId: cinVerify.record._id,
          entityType: 'b2b',
          entityId: company._id
        });
      } catch (bindErr) {
        console.warn('[B2B_REGISTER] CIN bind warning:', bindErr.message);
      }
    }

    // Seed default roles and create main Company Admin B2BUser profile
    await ensureDefaultRoles(company._id);
    await B2BUser.create({
      companyId: company._id,
      fullName: company.authorizedPerson.name,
      email: company.email,
      mobile: company.phone,
      role: 'Company Admin',
      permissions: [
        'bulk_jobs.read', 'bulk_jobs.write',
        'jobs.read', 'jobs.write',
        'wallet.read', 'wallet.write',
        'invoices.read',
        'reports.read',
        'support.write',
        'users.manage',
        'company_profile.read', 'company_profile.write'
      ],
      status: 'active',
      passwordHash: company.passwordHash
    });

    // 5. Create B2BDocument collection records for granular admin tracking
    if (documents && documents.length > 0) {
      const docRecords = documents.map(doc => ({
        companyId: company._id,
        documentType: doc.documentType,
        fileUrl: doc.fileUrl,
        fileKey: doc.fileKey || null,
        status: 'uploaded',
        uploadedAt: new Date()
      }));
      await B2BDocument.insertMany(docRecords);
    }

    // 6. Notify admins of new registration
    try {
      const { getOrCreateOnboardingForCompany } = require('../../services/b2bEnterpriseOnboarding.service');
      await getOrCreateOnboardingForCompany(company._id);
    } catch (err) {
      console.error('B2B onboarding bootstrap error:', err.message);
    }

    try {
      const { emitAsync } = require('../../services/notification/notificationOrchestrator.service');
      emitAsync('b2b_registered', {
        targets: { notifyAllAdmins: true },
        data: {
          companyId: company._id,
          companyName: company.companyName,
          email: company.email,
          phone: company.phone
        }
      });
    } catch (err) {
      console.error('B2B Admin notification error:', err.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Registration submitted successfully. Pending admin approval.',
      companyId: company._id
    });
  } catch (error) {
    console.error('B2B Registration Error:', error);
    if (error.name === 'ValidationError') {
      const fields = Object.values(error.errors || {}).map((e) => ({
        field: e.path,
        message: e.kind === 'required' ? `${e.path} is required` : `${e.path} is invalid`
      }));
      return res.status(400).json({
        success: false,
        message: `Please check: ${fields.map((f) => f.field).join(', ')}`,
        errors: fields
      });
    }
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A B2B company is already registered with these details' });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to register company. Please try again.'
    });
  }
};

/**
 * B2B Company Login
 */
const loginCompany = async (req, res) => {
  try {
    const { emailOrMobile, password } = req.body;

    if (!emailOrMobile || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide Email/Mobile and Password'
      });
    }

    const cleanIdentifier = emailOrMobile.trim();

    // 1. Find B2B user by email or mobile
    let user = await B2BUser.findOne({
      $or: [
        { email: cleanIdentifier.toLowerCase() },
        { mobile: cleanIdentifier }
      ]
    });

    let company;
    if (user) {
      company = await B2BCompany.findById(user.companyId);
    } else {
      // Check B2BCompany (migration fallback)
      company = await B2BCompany.findOne({
        $or: [
          { email: cleanIdentifier.toLowerCase() },
          { phone: cleanIdentifier }
        ]
      });

      if (company) {
        // Seed default roles and create admin user on the fly
        await ensureDefaultRoles(company._id);
        user = await B2BUser.findOne({ companyId: company._id, role: 'Company Admin' });
        if (!user) {
          user = await B2BUser.create({
            companyId: company._id,
            fullName: company.authorizedPerson.name,
            email: company.email,
            mobile: company.phone,
            role: 'Company Admin',
            permissions: [
              'bulk_jobs.read', 'bulk_jobs.write',
              'jobs.read', 'jobs.write',
              'wallet.read', 'wallet.write',
              'invoices.read',
              'reports.read',
              'support.write',
              'users.manage',
              'company_profile.read', 'company_profile.write'
            ],
            status: 'active',
            passwordHash: company.passwordHash
          });
        }
      }
    }

    if (!user || !company) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // 2. Validate password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // 3. Allow login while pending — enterprise onboarding completes before admin activation
    if (company.verificationStatus === 'rejected') {
      return res.status(403).json({
        success: false,
        verificationStatus: 'rejected',
        rejectionReason: company.rejectionReason || 'Documents verification failed.',
        message: `Your account registration was rejected. Reason: ${company.rejectionReason || 'Please review your uploaded documents.'}`,
        company: {
          id: company._id,
          companyName: company.companyName,
          email: company.email,
          phone: company.phone,
          documents: company.documents
        }
      });
    }

    // 4. Check active/blocked states
    if (!company.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your company account is deactivated. Please contact support.'
      });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({
        success: false,
        message: 'Your user account has been blocked. Please contact your administrator.'
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Your account is currently ${user.status}. Please activate your account or contact support.`
      });
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // 5. Generate JWT tokens
    const loginSessionId = Date.now().toString();
    const tokens = generateTokenPair({
      userId: user._id.toString(),
      role: 'B2B',
      profileId: company._id.toString(),
      mobile: user.mobile,
      email: user.email,
      loginSessionId
    });

    const companyRes = company.toObject();
    delete companyRes.passwordHash;
    delete companyRes.__v;
    companyRes.id = company._id;
    companyRes.role = 'b2b';

    // Populate user profile info to the response
    const userRes = user.toObject();
    delete userRes.passwordHash;
    delete userRes.__v;

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      company: companyRes,
      user: userRes,
      role: 'b2b',
      profileId: company._id.toString()
    });
  } catch (error) {
    console.error('B2B Login Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
};

/**
 * Get current logged in B2B profile
 */
const getProfile = async (req, res) => {
  try {
    const company = await B2BCompany.findById(req.companyId).select('-passwordHash');
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company profile not found'
      });
    }
    // What this signed-in principal may do — the panel hides what the API
    // would refuse anyway (the API remains the enforcer).
    const { permissionsFor, ACCESS_ROLES } = require('../../config/b2bAccessRoles');
    const accessRole = req.user?.accessRole || 'B2B_ADMIN';
    return res.status(200).json({
      success: true,
      company,
      principal: {
        id: req.user?.id || null,
        name: req.user?.isCompanyLogin
          ? (company.authorizedPerson?.name || company.companyName)
          : (req.user?.name || req.user?.fullName || req.user?.email || ''),
        email: req.user?.email || company.email,
        accessRole,
        accessRoleLabel: ACCESS_ROLES[accessRole]?.label || accessRole,
        isCompanyLogin: Boolean(req.user?.isCompanyLogin),
        permissions: Array.from(permissionsFor(req.user || {}))
      }
    });
  } catch (error) {
    console.error('B2B Get Profile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile data',
      error: error.message
    });
  }
};

/**
 * Update profile details
 */
const updateProfile = async (req, res) => {
  try {
    const {
      companyName,
      companyAddress,
      billingAddress,
      branches,
      authorizedPerson,
      logoUrl
    } = req.body;

    const company = await B2BCompany.findById(req.companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company profile not found'
      });
    }

    if (companyName) company.companyName = companyName;
    if (companyAddress) company.companyAddress = companyAddress;
    if (billingAddress) company.billingAddress = billingAddress;
    if (branches) company.branches = branches;
    if (logoUrl) company.logoUrl = logoUrl;
    
    if (authorizedPerson) {
      company.authorizedPerson = {
        ...company.authorizedPerson,
        ...authorizedPerson
      };
    }

    await company.save();

    const updatedCompany = company.toObject();
    delete updatedCompany.passwordHash;

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      company: updatedCompany
    });
  } catch (error) {
    console.error('B2B Update Profile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile details',
      error: error.message
    });
  }
};

/**
 * Re-upload document if rejected
 */
const reuploadDocuments = async (req, res) => {
  try {
    // If rejected, the frontend sends documents to re-evaluate
    const { companyId, documents } = req.body;
    
    // Find the company
    const company = await B2BCompany.findById(companyId || req.companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'B2B Company not found'
      });
    }

    if (!documents || documents.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No documents provided for re-upload'
      });
    }

    // Update company documents array
    for (const newDoc of documents) {
      const existingDocIndex = company.documents.findIndex(d => d.documentType === newDoc.documentType);
      if (existingDocIndex > -1) {
        company.documents[existingDocIndex].fileUrl = newDoc.fileUrl;
        company.documents[existingDocIndex].fileKey = newDoc.fileKey || null;
        company.documents[existingDocIndex].status = 'uploaded';
        company.documents[existingDocIndex].rejectionReason = null;
        company.documents[existingDocIndex].uploadedAt = new Date();
      } else {
        company.documents.push({
          documentType: newDoc.documentType,
          fileUrl: newDoc.fileUrl,
          fileKey: newDoc.fileKey || null,
          status: 'uploaded',
          uploadedAt: new Date()
        });
      }

      // Update granularity collection B2BDocument
      await B2BDocument.findOneAndUpdate(
        { companyId: company._id, documentType: newDoc.documentType },
        {
          fileUrl: newDoc.fileUrl,
          fileKey: newDoc.fileKey || null,
          status: 'uploaded',
          rejectionReason: null,
          uploadedAt: new Date()
        },
        { upsert: true, new: true }
      );
    }

    // Reset status back to pending
    company.verificationStatus = 'pending';
    company.rejectionReason = null;
    await company.save();

    return res.status(200).json({
      success: true,
      message: 'Documents updated and registration re-submitted for approval successfully.'
    });
  } catch (error) {
    console.error('B2B Re-upload Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update documents',
      error: error.message
    });
  }
};

/**
 * Get current verification status
 */
const getVerificationStatus = async (req, res) => {
  try {
    const company = await B2BCompany.findById(req.companyId).select('verificationStatus rejectionReason documents');
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }
    return res.status(200).json({
      success: true,
      verificationStatus: company.verificationStatus,
      rejectionReason: company.rejectionReason,
      documents: company.documents
    });
  } catch (error) {
    console.error('B2B Verification Status Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve verification status',
      error: error.message
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
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    const { verifyRefreshToken, generateTokenPair } = require('../../utils/tokenService');
    
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    const user = await B2BUser.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.status === 'blocked' || user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is not active' });
    }

    const company = await B2BCompany.findById(user.companyId);
    if (!company || !company.isActive) {
      return res.status(403).json({ success: false, message: 'Company account is inactive' });
    }

    const tokens = generateTokenPair({
      userId: user._id.toString(),
      role: 'B2B',
      profileId: company._id.toString(),
      mobile: user.mobile,
      email: user.email,
      loginSessionId: decoded.loginSessionId
    });

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      ...tokens,
      accessToken: tokens.accessToken
    });
  } catch (error) {
    console.error('B2B Refresh token error:', error);
    return res.status(500).json({ success: false, message: 'Failed to refresh token' });
  }
};

module.exports = {
  registerCompany,
  loginCompany,
  getProfile,
  updateProfile,
  reuploadDocuments,
  getVerificationStatus,
  refreshToken
};
