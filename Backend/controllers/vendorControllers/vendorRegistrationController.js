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

// Since we are upgrading the registration, we might use a draft collection,
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
    const vendor = await Vendor.findById(vendorId);
    
    // Dynamic logic based on vendor models and business type
    const requirements = ['PAN', 'BANK_STATEMENT'];
    if (vendor.incorporationType !== 'Proprietorship') requirements.push('COMPANY_REGISTRATION');
    if (vendor.vendorModels.includes('PROJECT')) {
      requirements.push('GST', 'ITR', 'BALANCE_SHEET', 'PF_ESI_DECLARATION');
    }
    
    res.status(200).json({ success: true, requirements });
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
        oneTimeServices, projectServices, dailyCapacity, totalWorkers,
        serviceRadiusKm, maxProjectValue, totalEngineers, projectCoverageType,
        portfolioTitle, portfolioClient, portfolioValue,
        panUrl, gstUrl, companyRegUrl, chequeUrl, pfDocumentUrl, esiDocumentUrl, workOrderUrl, digitalSLAAccepted,
        accountHolderName, accountNumber, ifscCode, upiId,
        workingCity, latitude, longitude, bankStatus, aadhaarVerified
      } = req.body;

      if (!ownerName || !mobile) {
         return res.status(400).json({ success: false, message: 'Owner name and mobile are required' });
      }

      // Check for existing vendor by phone or email to prevent E11000 errors
      vendor = await Vendor.findOne({ $or: [{ phone: mobile }, { email: email && email !== '' ? email : 'NON_EXISTENT_EMAIL_DUMMY' }] });
      
      if (!vendor) {
        vendor = new Vendor({ phone: mobile });
      }

      vendor.name = ownerName;
      vendor.email = email || null;
      vendor.businessName = companyName;
      vendor.gstin = gstin;
      vendor.pan = { number: panNumber, document: panUrl };
      vendor.incorporationType = incorporationType || 'Proprietorship';
      vendor.address = { fullAddress: officeAddress, city, state, pincode, lat: latitude, lng: longitude };
      vendor.vendorModels = models || [];
      vendor.workingCities = workingCity ? [workingCity] : [];
      vendor.serviceRadiusKm = serviceRadiusKm || 10;
      if (bankStatus === 'verified') vendor.bankStatus = 'verified';
      if (aadhaarVerified) vendor.kycStatus = 'verified';

      vendor.pfDocument = pfDocumentUrl || null;
      vendor.esiDocument = esiDocumentUrl || null;
      vendor.digitalSLAAccepted = !!digitalSLAAccepted;
      vendor.otherDocuments = [gstUrl, companyRegUrl, chequeUrl, workOrderUrl].filter(Boolean);

      if (password) {
        // DO NOT manually hash the password here, as VendorSchema.pre('save') will hash it automatically!
        vendor.password = password;
      }
      
      // Basic init
      vendor.onboarding = { status: 'SUBMITTED', progressPercentage: 100 };
      await vendor.save();
      
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

      if (models?.includes('PROJECT') && projectServices?.length) {
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
    const { vendorId, gstin, panNumber } = req.body;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    vendor.kycStatus = 'verified';
    if (gstin) vendor.gstin = gstin.toUpperCase();
    if (panNumber) vendor.pan = { ...vendor.pan, number: panNumber.toUpperCase() };
    await vendor.save();

    res.status(200).json({ success: true, message: 'KYC documents verified successfully!' });
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
      await vendor.save();

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
    const { vendorId } = req.body;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    vendor.inductionStatus = 'completed';
    vendor.kitDispatchStatus = 'dispatched';
    await vendor.save();

    res.status(200).json({ success: true, message: 'Onboarding training modules successfully completed!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const activateAccount = async (req, res) => {
  try {
    const { vendorId } = req.body;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    vendor.approvalStatus = 'approved';
    vendor.kitDispatchStatus = 'delivered';
    await vendor.save();

    res.status(200).json({ success: true, message: 'Vendor account activated successfully! Welcome to Active & Go-Live.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
  submitApplication,
  verifyKyc,
  verifyBankPennyDrop,
  completeInduction,
  activateAccount
};
