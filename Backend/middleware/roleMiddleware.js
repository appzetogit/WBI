const { USER_ROLES } = require('../utils/constants');

/**
 * Role-based authorization middleware
 */
const isUser = (req, res, next) => {
  if (req.userRole !== USER_ROLES.USER) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. User role required.'
    });
  }
  next();
};

const isVendor = (req, res, next) => {
  if (req.userRole !== USER_ROLES.VENDOR) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Vendor role required.'
    });
  }
  next();
};

const isWorker = (req, res, next) => {
  if (req.userRole !== USER_ROLES.WORKER) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Worker role required.'
    });
  }
  next();
};

const isEngineer = (req, res, next) => {
  if (req.userRole !== USER_ROLES.ENGINEER && req.userRole !== 'engineer') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Engineer role required.'
    });
  }
  next();
};

const isAdmin = (req, res, next) => {
  if (req.userRole !== USER_ROLES.ADMIN && req.userRole !== 'super_admin' && req.userRole !== 'admin' && req.userRole !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.'
    });
  }
  next();
};

const isAdminOrVendor = (req, res, next) => {
  if (req.userRole !== USER_ROLES.ADMIN && req.userRole !== 'super_admin' && req.userRole !== USER_ROLES.VENDOR) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin or Vendor role required.'
    });
  }
  next();
};

/**
 * Super Admin only middleware
 * Checks if admin user has super_admin role in database
 */
const isSuperAdmin = async (req, res, next) => {
  try {
    const role = String(req.userRole || '').toLowerCase();
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    // The token only proves "an admin"; super_admin is a database attribute,
    // so it must be read from the record rather than trusted from the claim.
    const Admin = require('../models/Admin');
    const admin = await Admin.findById(req.user?.id || req.userId).select('role isActive').lean();

    if (!admin || admin.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin account not found or inactive.'
      });
    }

    if (admin.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin role required.'
      });
    }

    next();
  } catch (error) {
    console.error('Super admin check error:', error);
    res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

const isB2B = (req, res, next) => {
  if (req.userRole !== 'B2B' && req.userRole !== 'b2b') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. B2B role required.'
    });
  }
  next();
};

const isApprovedB2B = (req, res, next) => {
  if (req.userRole !== 'B2B' && req.userRole !== 'b2b') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. B2B role required.'
    });
  }
  if (req.user.verificationStatus === 'rejected') {
    return res.status(403).json({
      success: false,
      verificationStatus: req.user.verificationStatus,
      message: 'Access denied. B2B account verification was rejected.'
    });
  }
  // The operational account status is the gate: PENDING and APPROVED companies
  // are still onboarding and may use the panel; these three may not.
  const BLOCKED = ['SUSPENDED', 'REJECTED', 'INACTIVE'];
  if (BLOCKED.includes(req.user.companyStatus)) {
    return res.status(403).json({
      success: false,
      accountStatus: req.user.companyStatus,
      message: `Access denied. This company account is ${req.user.companyStatus.toLowerCase()}.`
    });
  }
  next();
};

/**
 * Guard a B2B route with a permission key.
 *
 * Permissions come from the user's access role (B2B_ADMIN / B2B_OPERATIONS /
 * B2B_FINANCE / DISPATCHER) plus any per-user overrides. The company's own
 * login holds everything. This is the only place that decides — a panel
 * hiding a button is not access control.
 */
const checkB2BPermission = (permissionKey) => {
  const { hasPermission, ACCESS_ROLES } = require('../config/b2bAccessRoles');

  return (req, res, next) => {
    if (req.userRole !== 'B2B' && req.userRole !== 'b2b') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. B2B role required.'
      });
    }

    if (hasPermission(req.user || {}, permissionKey)) return next();

    const role = req.user?.accessRole;
    return res.status(403).json({
      success: false,
      code: 'PERMISSION_DENIED',
      message: role && ACCESS_ROLES[role]
        ? `Your role (${ACCESS_ROLES[role].label}) cannot do this. It needs '${permissionKey}'.`
        : `Access denied. Permission '${permissionKey}' is required.`,
      requiredPermission: permissionKey
    });
  };
};

module.exports = {
  isUser,
  isVendor,
  isWorker,
  isEngineer,
  isAdmin,
  isAdminOrVendor,
  isSuperAdmin,
  isB2B,
  isApprovedB2B,
  checkB2BPermission
};

