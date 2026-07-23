const { verifyAccessToken } = require('../utils/tokenService');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Worker = require('../models/Worker');
const Admin = require('../models/Admin');
const { USER_ROLES } = require('../utils/constants');

/**
 * Authentication middleware - verifies JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please login.'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
      // console.log('Decoded Token:', decoded); // Debug
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token. Please login again.'
      });
    }

    // Get user based on role (case-insensitive check)
    let user;
    const userRole = decoded.role ? decoded.role.toUpperCase() : '';
    
    switch (userRole) {
      case USER_ROLES.USER:
        user = await User.findById(decoded.userId).select('-password').lean();
        // SINGLE DEVICE LOGOUT Logic
        if (user && user.loginSessionId && decoded.loginSessionId && user.loginSessionId !== decoded.loginSessionId) {
          return res.status(401).json({ success: false, message: 'Account logged in on another device. Please login again.' });
        }
        break;
      case USER_ROLES.VENDOR:
        user = await Vendor.findById(decoded.userId).select('-password').lean();
        
        // Allow unapproved vendors to access specific onboarding routes
        const vendorAllowedPaths = ['/activate-account', '/vendors/profile'];
        const isVendorAllowedPath = vendorAllowedPaths.some(p => req.originalUrl.includes(p));

        if (user && user.approvalStatus !== 'approved' && !isVendorAllowedPath) {
          return res.status(403).json({
            success: false,
            message: 'Your vendor account is pending approval or has been rejected.'
          });
        }

        // SINGLE DEVICE LOGOUT Logic: Check if token's session ID matches DB
        if (user && user.loginSessionId && decoded.loginSessionId && user.loginSessionId !== decoded.loginSessionId) {
          return res.status(401).json({
            success: false,
            message: 'Account logged in on another device. Please login again.'
          });
        }
        break;
      case USER_ROLES.WORKER:
        user = await Worker.findById(decoded.userId).select('-password').lean();
        // SINGLE DEVICE LOGOUT Logic
        if (user && user.loginSessionId && decoded.loginSessionId && user.loginSessionId !== decoded.loginSessionId) {
          return res.status(401).json({ success: false, message: 'Account logged in on another device. Please login again.' });
        }
        break;
      case USER_ROLES.ENGINEER:
        const Engineer = require('../models/Engineer');
        user = await Engineer.findById(decoded.userId).select('-password').lean();
        // SINGLE DEVICE LOGOUT Logic
        if (user && user.loginSessionId && decoded.loginSessionId && user.loginSessionId !== decoded.loginSessionId) {
          return res.status(401).json({ success: false, message: 'Account logged in on another device. Please login again.' });
        }
        break;
      case USER_ROLES.ADMIN:
        user = await Admin.findById(decoded.userId).select('-password').lean();
        break;
      case USER_ROLES.B2B: {
        const B2BCompany = require('../models/B2BCompany');
        const B2BUser = require('../models/B2BUser');
        let b2bUser = await B2BUser.findById(decoded.userId).lean();
        if (b2bUser) {
          if (b2bUser.status !== 'active') {
            return res.status(403).json({ success: false, message: `Access denied. Your account status is: ${b2bUser.status}.` });
          }
          const company = await B2BCompany.findById(b2bUser.companyId).lean();
          if (!company || !company.isActive) {
            return res.status(403).json({ success: false, message: 'Access denied. Your company account is inactive.' });
          }
          user = { 
            ...b2bUser, 
            id: b2bUser._id.toString(), 
            companyId: b2bUser.companyId.toString(),
            verificationStatus: company.verificationStatus 
          };
        } else {
          const company = await B2BCompany.findById(decoded.userId).select('-passwordHash').lean();
          if (company) {
            user = { 
              ...company, 
              id: company._id.toString(), 
              companyId: company._id.toString(),
              role: 'Company Admin',
              verificationStatus: company.verificationStatus, // ← FIXED: explicitly set for isApprovedB2B
              isActive: company.isActive,
              permissions: [
                'bulk_jobs.read', 'bulk_jobs.write',
                'jobs.read', 'jobs.write',
                'wallet.read', 'wallet.write',
                'invoices.read',
                'reports.read',
                'support.write',
                'users.manage',
                'company_profile.read', 'company_profile.write'
              ]
            };
          }
        }
        break;
      }
      default:
        console.error('Role mismatch in middleware:', decoded.role);
        return res.status(401).json({
          success: false,
          message: 'Invalid user role.'
        });
    }

    if (!user) {
      // console.error('User not found for ID:', decoded.userId); // Commented out to prevent log spam from old tokens
      return res.status(401).json({
        success: false,
        message: 'User not found. Please login again.'
      });
    }

    // Attach user to request
    // NOTE: .lean() removes the virtual .id getter — restore it manually
    req.user = { ...user, id: user._id.toString() };
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    
    // Attach companyId for B2B requests
    const userRoleStr = decoded.role ? decoded.role.toUpperCase() : '';
    if (userRoleStr === 'B2B') {
      req.companyId = user.companyId ? user.companyId.toString() : user._id.toString();
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error. Please try again.'
    });
  }
};

module.exports = { authenticate };

