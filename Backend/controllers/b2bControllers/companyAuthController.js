const Company = require('../../models/Company');
const { generateTokenPair } = require('../../utils/tokenService');
const { USER_ROLES } = require('../../utils/constants');
const cloudinaryService = require('../../services/cloudinaryService');

/**
 * Register a new Company
 */
const registerCompany = async (req, res) => {
  try {
    const {
      companyName, companyType, gstNumber, registrationNumber,
      address, website, logo,
      primaryContact, admin
    } = req.body;

    // Check if company already exists with same email/phone
    const existingCompany = await Company.findOne({
      $or: [
        { 'primaryContact.phone': primaryContact?.phone },
        { 'primaryContact.email': primaryContact?.email },
        { 'admin.phone': admin?.phone },
        { 'admin.email': admin?.email }
      ]
    });

    if (existingCompany) {
      return res.status(400).json({
        success: false,
        message: 'A company or admin with these contact details is already registered.'
      });
    }

    // Process logo upload
    let processedLogoUrl = null;
    if (logo && logo.startsWith('data:')) {
      const uploadRes = await cloudinaryService.uploadFile(logo, { folder: 'companies/logos' });
      if (uploadRes.success) {
        processedLogoUrl = uploadRes.url;
      }
    } else {
      processedLogoUrl = logo;
    }

    const newCompany = await Company.create({
      companyName,
      companyType,
      gstNumber: gstNumber || null,
      registrationNumber: registrationNumber || null,
      address: address || {},
      website: website || null,
      logo: processedLogoUrl,
      primaryContact: {
        name: primaryContact.name,
        phone: primaryContact.phone,
        email: primaryContact.email,
        isPhoneVerified: true, // Assuming OTP verified in frontend
        isEmailVerified: true
      },
      admin: {
        fullName: admin.fullName,
        phone: admin.phone,
        email: admin.email,
        password: admin.password,
        role: admin.role,
        isPhoneVerified: true,
        isEmailVerified: true
      },
      status: 'pending' // Requires WBI Admin approval
    });

    try {
      const { emitAsync } = require('../../services/notification/notificationOrchestrator.service');
      emitAsync('b2b_registered', {
        targets: { notifyAllAdmins: true },
        data: {
          companyId: newCompany._id,
          companyName: newCompany.companyName,
          gstNumber: newCompany.gstNumber || undefined,
          contactName: primaryContact?.name,
          email: primaryContact?.email,
          phone: primaryContact?.phone
        }
      });
      const welcomeTo = [...new Set([primaryContact?.email, admin?.email].filter(Boolean).map((e) => String(e).trim().toLowerCase()))];
      emitAsync('account_welcome', {
        targets: { emails: welcomeTo.map((email) => ({ role: 'b2b', email })) },
        data: {
          variant: 'b2b',
          accountLabel: 'Business company',
          name: admin?.fullName || primaryContact?.name,
          companyName: newCompany.companyName,
          email: primaryContact?.email,
          phone: primaryContact?.phone
        }
      });
    } catch (notifyErr) {
      console.warn('Company registration email skipped:', notifyErr.message);
    }

    // Generate token for auto-login
    const tokens = generateTokenPair({
      userId: newCompany._id,
      role: USER_ROLES.COMPANY_ADMIN // We might need to add this to constants later
    });

    res.status(201).json({
      success: true,
      message: 'Company registered successfully. Pending admin approval.',
      company: {
        id: newCompany._id,
        name: newCompany.companyName,
        status: newCompany.status
      },
      ...tokens
    });

  } catch (error) {
    console.error('Company Registration Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register company. Please try again.'
    });
  }
};

module.exports = {
  registerCompany
};
