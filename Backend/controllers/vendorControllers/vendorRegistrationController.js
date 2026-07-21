const Vendor = require('../../models/Vendor');
const VendorRegistrationConfig = require('../../models/VendorRegistrationConfig');
const VendorKYC = require('../../models/VendorKYC');
const VendorBank = require('../../models/VendorBank');
const VendorPayment = require('../../models/VendorPayment');
const { generateOTP, hashOTP, verifyOTP } = require('../../utils/redisOtp.util');
const VendorCapability = require('../../models/VendorCapability');
const VendorProjectPortfolio = require('../../models/VendorProjectPortfolio');
const VendorDocument = require('../../models/VendorDocument');
const VendorFinance = require('../../models/VendorFinance');
const VendorModelApproval = require('../../models/VendorModelApproval');
const { VENDOR_STATUS } = require('../../utils/constants');
const {
  generateKitWaybill,
  buildOnboardingStatus,
  persistAndEmit,
  emitOnboardingStatus
} = require('../../services/vendorOnboarding.service');
const { verifyVerificationToken } = require('../../utils/tokenService');
const {
  resolveDynamicDocumentRequirements,
  buildKycSnapshot,
  syncVendorComplianceFromKyc
} = require('../../services/vendorOnboardingKyc.service');

async function resolveOnboardingVendor(req, res, { requireAuth = false } = {}) {
  const authId = req.user?.id || req.user?._id;
  const bodyId = req.body?.vendorId || req.query?.vendorId;

  if (requireAuth && !authId) {
    res.status(401).json({ success: false, message: 'Please sign in to continue.' });
    return null;
  }

  const vendorId = authId || bodyId;
  if (!vendorId) {
    res.status(400).json({ success: false, message: 'Vendor ID is required.' });
    return null;
  }

  if (authId && bodyId && String(authId) !== String(bodyId)) {
    res.status(403).json({ success: false, message: 'Vendor mismatch.' });
    return null;
  }

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    res.status(404).json({ success: false, message: 'Vendor not found' });
    return null;
  }
  return vendor;
}
// but to avoid breaking things, we can just save it into a new Model or save a partial vendor

const getConfig = async (req, res) => {
  try {
    let config = await VendorRegistrationConfig.findOne();
    if (!config) {
      config = await VendorRegistrationConfig.create({}); // create default
    }
    res.status(200).json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateBusinessDetails = async (req, res) => {
  try {
    // Expect req.user.id to be set by auth middleware
    const vendorId = req.user?.id || req.body.vendorId;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const { companyName, incorporationType, gstin, panNumber, panUrl, officeAddress, city, state, pincode, latitude, longitude } = req.body;
    
    vendor.businessName = companyName;
    vendor.incorporationType = incorporationType;
    vendor.gstin = gstin;
    vendor.pan = { number: panNumber, document: panUrl };
    vendor.address = {
      fullAddress: officeAddress,
      city, state, pincode,
      lat: latitude, lng: longitude
    };
    if (longitude && latitude) {
      vendor.geoLocation = { type: 'Point', coordinates: [longitude, latitude] };
    }
    
    vendor.onboarding.currentStep = 2;
    if (!vendor.onboarding.completedSteps.includes(1)) vendor.onboarding.completedSteps.push(1);
    
    await vendor.save();
    res.status(200).json({ success: true, message: 'Business details updated', vendor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateModels = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.body.vendorId;
    const { models } = req.body; // e.g. ["ONE_TIME", "PROJECT"]
    
    if (!models || models.length === 0) return res.status(400).json({ success: false, message: 'Select at least one model' });

    const vendor = await Vendor.findById(vendorId);
    vendor.vendorModels = models;
    vendor.onboarding.currentStep = 3;
    if (!vendor.onboarding.completedSteps.includes(2)) vendor.onboarding.completedSteps.push(2);
    
    await vendor.save();
    res.status(200).json({ success: true, message: 'Models updated', vendorModels: vendor.vendorModels });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateOneTimeCapability = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.body.vendorId;
    const { serviceCoverage, dailyCapacity, serviceConfigurations } = req.body;

    await VendorCapability.findOneAndUpdate(
      { vendorId },
      { $set: { 
          'oneTime.serviceCoverage': serviceCoverage, 
          'oneTime.dailyCapacity': dailyCapacity,
          'oneTime.serviceConfigurations': serviceConfigurations
      } },
      { upsert: true, new: true }
    );
    
    // Also update vendor step tracking
    await Vendor.findByIdAndUpdate(vendorId, {
      $set: { 'onboarding.currentStep': 4 },
      $addToSet: { 'onboarding.completedSteps': 3 }
    });

    res.status(200).json({ success: true, message: 'One-Time capabilities updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateProjectCapability = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.body.vendorId;
    const { projectCoverage, capacity, experience, workingModel } = req.body;

    await VendorCapability.findOneAndUpdate(
      { vendorId },
      { $set: { 
          'project.projectCoverage': projectCoverage, 
          'project.capacity': capacity,
          'project.experience': experience,
          'project.workingModel': workingModel
      } },
      { upsert: true, new: true }
    );
    
    await Vendor.findByIdAndUpdate(vendorId, {
      $set: { 'onboarding.currentStep': 5 },
      $addToSet: { 'onboarding.completedSteps': 4 }
    });

    res.status(200).json({ success: true, message: 'Project capabilities updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addPortfolio = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.body.vendorId;
    const projects = req.body.projects || []; // Array of project objects
    
    // For simplicity, we clear and recreate, or we can insert many. Let's do a replace-all for draft flow.
    await VendorProjectPortfolio.deleteMany({ vendorId });
    if (projects.length > 0) {
      const docs = projects.map(p => ({ ...p, vendorId }));
      await VendorProjectPortfolio.insertMany(docs);
    }
    
    await Vendor.findByIdAndUpdate(vendorId, {
      $addToSet: { 'onboarding.completedSteps': 5 }
    });

    res.status(200).json({ success: true, message: 'Portfolio updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDocumentRequirements = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.query.vendorId;
    let models = String(req.query.models || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    let incorporationType = req.query.incorporationType || 'Proprietorship';
    let categoryCodes = String(req.query.codes || '')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);

    if (vendorId) {
      const vendor = await Vendor.findById(vendorId).lean();
      if (vendor) {
        models = vendor.vendorModels || models;
        incorporationType = vendor.incorporationType || incorporationType;
        if (!categoryCodes.length) {
          categoryCodes = (vendor.approvedServices || []).map((s) => s.categoryCode).filter(Boolean);
        }
      }
    }

    const requirements = await resolveDynamicDocumentRequirements({
      categoryCodes,
      models,
      incorporationType
    });

    res.status(200).json({ success: true, requirements });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getKycSnapshot = async (req, res) => {
  try {
    const vendor = await resolveOnboardingVendor(req, res);
    if (!vendor) return;

    const snapshot = await buildKycSnapshot(vendor._id);
    const status = buildOnboardingStatus(vendor);

    res.status(200).json({
      success: true,
      data: { ...status, kyc: snapshot }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const syncKycCompliance = async (req, res) => {
  try {
    const vendor = await resolveOnboardingVendor(req, res);
    if (!vendor) return;

    const snapshot = await syncVendorComplianceFromKyc(vendor);
    const data = await persistAndEmit(vendor);

    res.status(200).json({
      success: true,
      message: 'Compliance status updated',
      data: { ...data, kyc: snapshot }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const submitApplication = async (req, res) => {
  try {
    const { vendorId } = req.body;
    let vendor;
    
    if (req.user?.id || (vendorId && vendorId !== 'draft_mode_validation')) {
      const id = req.user?.id || vendorId;
      vendor = await Vendor.findById(id);
      if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    } else {
      const {
        ownerName, mobile, email, password, companyName, gstin, panNumber,
        models, incorporationType, officeAddress, city, state, pincode,
        oneTimeServices, projectServices, selectedProjectServices, dailyCapacity, totalWorkers,
        serviceRadiusKm, maxProjectValue, totalEngineers, projectCoverageType,
        portfolioTitle, portfolioClient, portfolioValue,
        panUrl, gstUrl, companyRegUrl, chequeUrl, pfDocumentUrl, esiDocumentUrl, workOrderUrl, digitalSLAAccepted,
        accountHolderName, accountNumber, ifscCode, upiId,
        workingCity, latitude, longitude, bankStatus, aadhaarVerified,
        serviceDocuments, brandName, website, companyDescription, registeredAddress,
        yearEstablished, authorizedPerson
      } = req.body;

      if (!ownerName || !mobile) {
         return res.status(400).json({ success: false, message: 'Owner name and mobile are required' });
      }
      if (!req.body.isPhoneVerified || !req.body.verificationToken) {
        return res.status(400).json({
          success: false,
          message: 'Please verify your mobile number with OTP before continuing.'
        });
      }
      if (!password || String(password).length < 8) {
        return res.status(400).json({ success: false, message: 'Password is required (min 8 characters)' });
      }
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required for login' });
      }

      // Normalize phone to last 10 digits for consistent login matching
      const normalizedPhone = String(mobile).replace(/\D/g, '').slice(-10);
      const verifiedPhone = verifyVerificationToken(req.body.verificationToken);
      if (!verifiedPhone || String(verifiedPhone).replace(/\D/g, '').slice(-10) !== normalizedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Phone verification expired. Please verify OTP again on step 1.'
        });
      }
      const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

      // Check for existing vendor by phone or email to prevent E11000 errors
      vendor = await Vendor.findOne({
        $or: [
          { phone: normalizedPhone },
          { phone: mobile },
          ...(normalizedEmail ? [{ email: normalizedEmail }] : [])
        ]
      });
      
      if (!vendor) {
        vendor = new Vendor({ phone: normalizedPhone || mobile });
      }

      vendor.name = ownerName;
      vendor.email = normalizedEmail;
      vendor.phone = normalizedPhone || mobile;
      vendor.isPhoneVerified = true;
      vendor.businessName = companyName;
      vendor.gstin = gstin;
      vendor.pan = { number: panNumber, document: panUrl };
      vendor.incorporationType = incorporationType || 'Proprietorship';
      vendor.address = { fullAddress: officeAddress, city, state, pincode, lat: latitude, lng: longitude };
      vendor.vendorModels = models || [];
      vendor.workingCities = workingCity ? [workingCity] : [];
      vendor.serviceRadiusKm = serviceRadiusKm || 10;
      if (bankStatus === 'verified') vendor.bankStatus = 'verified';
      vendor.kycStatus = 'pending';

      if (companyDescription) vendor.companyDescription = companyDescription;
      if (website) vendor.website = website;
      if (registeredAddress && vendor.address) {
        vendor.address.addressLine1 = registeredAddress;
      }
      if (brandName && !vendor.companyDescription?.includes('Trade name:')) {
        vendor.companyDescription = [vendor.companyDescription, `Trade name: ${brandName}`]
          .filter(Boolean)
          .join('\n');
      }
      if (authorizedPerson && typeof authorizedPerson === 'object') {
        vendor.name = authorizedPerson.fullName || vendor.name;
      }

      vendor.pfDocument = pfDocumentUrl || null;
      vendor.esiDocument = esiDocumentUrl || null;
      vendor.digitalSLAAccepted = !!digitalSLAAccepted;
      vendor.otherDocuments = [gstUrl, companyRegUrl, chequeUrl, workOrderUrl].filter(Boolean);

      // Persist selected project services into approvedServices
      if (Array.isArray(selectedProjectServices) && selectedProjectServices.length) {
        vendor.approvedServices = selectedProjectServices.map((s) => ({
          categoryCode: String(s.categoryCode || '').toUpperCase(),
          categoryName: s.categoryName || s.categoryCode,
          subServices: Array.isArray(s.subServices) ? s.subServices : [],
          approvedAt: null,
          status: 'pending'
        })).filter((s) => s.categoryCode);
      } else if (Array.isArray(projectServices) && projectServices.length) {
        // Backward compat: parse "Name (C01)" strings
        vendor.approvedServices = projectServices.map((label) => {
          const match = String(label).match(/\((C\d{2})\)\s*$/i);
          const code = match ? match[1].toUpperCase() : null;
          return code ? {
            categoryCode: code,
            categoryName: String(label).replace(/\s*\(C\d{2}\)\s*$/i, '').trim(),
            subServices: [],
            approvedAt: null,
            status: 'pending'
          } : null;
        }).filter(Boolean);
      }

      // Keep legacy service/categories arrays in sync for older filters
      if (vendor.approvedServices?.length) {
        vendor.service = vendor.approvedServices.map((s) => s.categoryName).filter(Boolean);
        vendor.categories = vendor.approvedServices.map((s) => s.categoryCode).filter(Boolean);
      }

      if (password) {
        // DO NOT manually hash the password here, as VendorSchema.pre('save') will hash it automatically!
        vendor.password = password;
      }
      
      // Basic init
      vendor.onboarding = { status: 'SUBMITTED', progressPercentage: 100 };
      await vendor.save();

      if (serviceDocuments && typeof serviceDocuments === 'object') {
        const entries = Object.entries(serviceDocuments).filter(([, url]) => !!url);
        for (const [docKey, documentUrl] of entries) {
          await VendorDocument.findOneAndUpdate(
            { vendorId: vendor._id, documentType: docKey },
            {
              title: docKey,
              documentUrl,
              documentType: docKey,
              status: 'PENDING',
              type: 'Onboarding'
            },
            { upsert: true }
          );
        }
      }

      // Invalidate dynamic config cache so dashboard/profile pick up services immediately
      try {
        const { invalidateVendorConfigCache } = require('./vendorConfigController');
        await invalidateVendorConfigCache(vendor._id);
      } catch (cacheErr) {
        console.warn('[submitApplication] config cache invalidate failed:', cacheErr.message);
      }
      
      // Upsert Bank Details
      if (accountNumber && ifscCode) {
        await VendorBank.findOneAndUpdate(
          { vendorId: vendor._id },
          {
            accountHolderName: accountHolderName || ownerName,
            accountNumberEncrypted: accountNumber,
            accountNumberMasked: '****' + accountNumber.slice(-4),
            ifsc: ifscCode,
            upiId: upiId
          },
          { upsert: true }
        );
      }

      // Upsert Capabilities
      if (models?.includes('ONE_TIME') && oneTimeServices?.length) {
        await VendorCapability.findOneAndUpdate(
          { vendorId: vendor._id },
          {
            $set: {
              'oneTime.dailyCapacity.maxJobsPerDay': dailyCapacity || 5
            }
          },
          { upsert: true }
        );
      }

      if (models?.includes('PROJECT') && (selectedProjectServices?.length || projectServices?.length)) {
        const parseValue = (val) => {
          if (!val) return 0;
          const str = String(val).toUpperCase();
          const num = parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
          if (str.includes('CR')) return num * 10000000;
          if (str.includes('L')) return num * 100000;
          if (str.includes('K')) return num * 1000;
          return num;
        };

        await VendorCapability.findOneAndUpdate(
          { vendorId: vendor._id },
          {
            $set: {
              'project.capacity.maxProjectValueHandled': parseValue(maxProjectValue),
              'project.capacity.maxSimultaneousProjects': 1
            }
          },
          { upsert: true }
        );
        
        if (portfolioTitle) {
          await VendorProjectPortfolio.findOneAndUpdate(
            { vendorId: vendor._id, projectName: portfolioTitle },
            {
              $set: {
                clientName: portfolioClient,
                projectValue: parseValue(portfolioValue),
                'documents.workOrderUrl': workOrderUrl
              }
            },
            { upsert: true }
          );
        }
      }
    }
    
    vendor.onboarding.status = 'SUBMITTED';
    vendor.onboarding.progressPercentage = 100;
    
    await vendor.save();
    
    // Initialize model approvals to PENDING
    if (vendor.vendorModels && vendor.vendorModels.length > 0) {
      for (const model of vendor.vendorModels) {
        await VendorModelApproval.findOneAndUpdate(
          { vendorId: vendor._id, model },
          { status: 'PENDING' },
          { upsert: true }
        );
      }
    }
    
    res.status(200).json({ success: true, message: 'Application submitted successfully', vendorId: vendor._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Levenshtein-based fuzzy matching
const getFuzzyMatchScore = (str1, str2) => {
  const s1 = (str1 || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const s2 = (str2 || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  
  if (s1 === s2) return 100;
  if (!s1 || !s2) return 0;
  
  const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }
  const distance = track[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  return Math.round(((maxLength - distance) / maxLength) * 100);
};

const verifyKyc = async (req, res) => {
  try {
    const vendor = await resolveOnboardingVendor(req, res);
    if (!vendor) return;

    const { gstin, panNumber } = req.body;

    if (gstin) vendor.gstin = gstin.toUpperCase();
    if (panNumber) vendor.pan = { ...vendor.pan, number: panNumber.toUpperCase() };
    await vendor.save();

    // Backward-compatible behavior:
    // - Existing PendingApproval UI uses `/vendor/verify-kyc` without creating `KYCVerification` records.
    // - New dynamic KYC flows create KYCVerification records and should be enforced.
    const snapshot = await buildKycSnapshot(vendor._id);

    if (!snapshot.flags.coreKycMet && snapshot.records.length === 0) {
      // Legacy onboarding: keep the old "verifyKyc" semantics.
      vendor.kycStatus = 'verified';
      if (!vendor.compliance) vendor.compliance = {};
      vendor.compliance.kycStatus = 'verified';
      if (panNumber) vendor.compliance.panVerified = true;
      if (gstin) vendor.compliance.gstVerified = true;
      await vendor.save();

      const data = await persistAndEmit(vendor);
      return res.status(200).json({
        success: true,
        message: 'KYC documents verified successfully!',
        data
      });
    }

    const synced = await syncVendorComplianceFromKyc(vendor);
    const data = await persistAndEmit(vendor);

    if (!synced.flags.coreKycMet) {
      return res.status(400).json({
        success: false,
        message: 'Complete Aadhaar and PAN verification (CGPE) before continuing.',
        data: { ...data, kyc: synced }
      });
    }

    res.status(200).json({
      success: true,
      message: 'KYC documents verified successfully!',
      data: { ...data, kyc: synced }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyBankPennyDrop = async (req, res) => {
  try {
    const { vendorId, bankName, accountNumber, ifsc, upiId, ownerName, companyName } = req.body;
    
    let targetName1 = 'Vendor Partner';
    let targetName2 = '';
    let vendor = null;

    if (vendorId && vendorId !== 'draft_mode_validation') {
      vendor = await Vendor.findById(vendorId);
      if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
      targetName1 = vendor.name || 'Vendor Partner';
      targetName2 = vendor.businessName || '';
    } else {
      targetName1 = ownerName || 'Vendor Partner';
      targetName2 = companyName || '';
    }

    // Calculate name match score against both owner name and company name
    const matchScore1 = getFuzzyMatchScore(targetName1, bankName);
    const matchScore2 = targetName2 ? getFuzzyMatchScore(targetName2, bankName) : 0;
    
    const bestScore = Math.max(matchScore1, matchScore2);
    const matchedWith = bestScore === matchScore1 ? targetName1 : targetName2;

    if (bestScore < 80) {
      return res.status(400).json({
        success: false,
        message: `Penny Drop failed: Account holder name "${bankName}" does not match Legal/Company name (Best match: ${bestScore}%, required >= 80%).`
      });
    }

    if (vendor) {
      vendor.bankStatus = 'verified';
      await persistAndEmit(vendor);

      // Create Bank record
      await VendorBank.findOneAndUpdate(
        { vendorId: vendor._id },
        {
          accountHolderName: bankName,
          accountNumberEncrypted: accountNumber,
          accountNumberMasked: '****' + accountNumber.slice(-4),
          ifsc,
          upiId
        },
        { upsert: true }
      );
    }

    res.status(200).json({
      success: true,
      message: `Penny drop verification successful! Legal name matched with ${bestScore}% score.`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const completeInduction = async (req, res) => {
  try {
    const vendor = await resolveOnboardingVendor(req, res);
    if (!vendor) return;

    vendor.inductionStatus = 'completed';
    vendor.kitDispatchStatus = 'dispatched';
    if (!vendor.kitWaybill) {
      vendor.kitWaybill = generateKitWaybill(vendor._id);
    }
    const data = await persistAndEmit(vendor);

    res.status(200).json({ success: true, message: 'Onboarding training modules successfully completed!', data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOnboardingStatus = async (req, res) => {
  try {
    const vendor = await resolveOnboardingVendor(req, res);
    if (!vendor) return;

    const { syncOperationalAudit } = require('../../services/vendorOnboarding.service');
    syncOperationalAudit(vendor);
    if (vendor.isModified()) await vendor.save();

    const data = buildOnboardingStatus(vendor);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const activateAccount = async (req, res) => {
  try {
    const vendor = await resolveOnboardingVendor(req, res, { requireAuth: true });
    if (!vendor) return;

    if (vendor.approvalStatus === VENDOR_STATUS.APPROVED) {
      const data = buildOnboardingStatus(vendor);
      return res.status(200).json({
        success: true,
        message: 'Your partner workspace is already active.',
        data
      });
    }

    if (vendor.kycStatus !== 'verified' || vendor.bankStatus !== 'verified' || vendor.inductionStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Complete compliance, financial audit, and partner induction before activation.'
      });
    }

    if (vendor.operationalAuditStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Operational audit is pending administrator review. You will be notified when you can go live.'
      });
    }

    // Additional production-safe gates for project partners.
    // These fields are required by the signup wizard, but we enforce them again server-side
    // so activation never happens with incomplete compliance uploads.
    const requiresProjectSetup =
      Array.isArray(vendor.vendorModels) && vendor.vendorModels.includes('PROJECT');

    if (requiresProjectSetup) {
      if (!vendor.pfDocument || !vendor.esiDocument) {
        return res.status(400).json({
          success: false,
          message: 'Upload PF & ESIC registration documents before activation (Project partner).'
        });
      }
      if (!vendor.digitalSLAAccepted) {
        return res.status(400).json({
          success: false,
          message: 'You must accept the Enterprise SLA & Liability Agreement before activation (Project partner).'
        });
      }
    }

    if (vendor.workspaceProvisioning?.status === 'in_progress') {
      return res.status(409).json({
        success: false,
        message: 'Workspace provisioning is already in progress. Please wait a moment.'
      });
    }

    vendor.workspaceProvisioning = {
      status: 'in_progress',
      startedAt: new Date(),
      completedAt: null,
      error: null
    };
    await vendor.save();
    emitOnboardingStatus(vendor._id, buildOnboardingStatus(vendor));

    try {
      const { ensureVendorCompanyCode } = require('../../utils/vendorCompanyCode');
      await ensureVendorCompanyCode(vendor);
    } catch (codeErr) {
      console.warn('Vendor company code generation failed:', codeErr.message);
    }

    try {
      const { invalidateVendorConfigCache } = require('./vendorConfigController');
      await invalidateVendorConfigCache(vendor._id);
    } catch (cacheErr) {
      console.warn('[activateAccount] config cache invalidate failed:', cacheErr.message);
    }

    vendor.approvalStatus = VENDOR_STATUS.APPROVED;
    vendor.isActive = true;
    vendor.approvalDate = new Date();
    vendor.kitDispatchStatus = 'delivered';
    if (!vendor.kitWaybill) {
      vendor.kitWaybill = generateKitWaybill(vendor._id);
    }
    if (vendor.onboarding) {
      vendor.onboarding.status = 'APPROVED';
      vendor.onboarding.currentStep = 5;
      if (!vendor.onboarding.completedSteps.includes(5)) {
        vendor.onboarding.completedSteps.push(5);
      }
    }
    vendor.workspaceProvisioning = {
      status: 'completed',
      startedAt: vendor.workspaceProvisioning?.startedAt || new Date(),
      completedAt: new Date(),
      error: null
    };

    const data = await persistAndEmit(vendor);

    try {
      const { notifyVendor } = require('../../services/vendorNotify.service');
      await notifyVendor(vendor._id, {
        type: 'general',
        category: 'account',
        title: 'Partner workspace active',
        message: 'Your WBI partner dashboard is live. You can now accept leads and manage operations.',
        relatedId: vendor._id,
        relatedType: 'vendor',
        data: { type: 'vendor_workspace_active' }
      });
    } catch (notifyErr) {
      console.warn('[activateAccount] notify failed:', notifyErr.message);
    }

    try {
      const { sendVendorPartnerActivationEmail } = require('../../services/emailService');
      await sendVendorPartnerActivationEmail(vendor, data);
    } catch (mailErr) {
      console.warn('[activateAccount] email failed:', mailErr.message);
    }

    emitOnboardingStatus(vendor._id, { ...data, provisioningPhase: 'completed' });

    res.status(200).json({
      success: true,
      message: 'Vendor account activated successfully! Welcome to Active & Go-Live.',
      data
    });
  } catch (error) {
    try {
      const vendorId = req.user?.id || req.body?.vendorId;
      if (vendorId) {
        await Vendor.findByIdAndUpdate(vendorId, {
          $set: {
            'workspaceProvisioning.status': 'failed',
            'workspaceProvisioning.error': error.message,
            'workspaceProvisioning.completedAt': new Date()
          }
        });
      }
    } catch (_) {
      /* ignore */
    }
    res.status(500).json({ success: false, message: error.message || 'Activation failed. Please try again.' });
  }
};

module.exports = {
  getConfig,
  updateBusinessDetails,
  updateModels,
  updateOneTimeCapability,
  updateProjectCapability,
  addPortfolio,
  getDocumentRequirements,
  getKycSnapshot,
  syncKycCompliance,
  submitApplication,
  verifyKyc,
  verifyBankPennyDrop,
  completeInduction,
  activateAccount,
  getOnboardingStatus
};
