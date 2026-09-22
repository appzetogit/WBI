/**
 * B2B access roles and what each may do.
 *
 * Every B2B route is guarded by one of these permission keys. A user's
 * permissions are the union of their access role's set and any per-user
 * overrides stored on B2BUser.permissions — the API decides, never the UI.
 *
 * Company login (the company's own credentials) acts as B2B_ADMIN.
 */

const PERMISSIONS = {
  JOBS_READ: 'jobs.read',
  JOBS_CREATE: 'jobs.create',
  JOBS_MANAGE: 'jobs.manage',
  UPLOADS_READ: 'uploads.read',
  UPLOADS_CREATE: 'uploads.create',
  TRACKING_READ: 'tracking.read',
  ENGINEERS_READ: 'engineers.read',
  WALLET_READ: 'wallet.read',
  WALLET_TOPUP: 'wallet.topup',
  INVOICES_READ: 'invoices.read',
  REPORTS_READ: 'reports.read',
  SUPPORT_MANAGE: 'support.manage',
  USERS_MANAGE: 'users.manage',
  COMPANY_MANAGE: 'company.manage'
};

const P = PERMISSIONS;

/** Everything a company can do — B2B_ADMIN holds all of it. */
const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const ACCESS_ROLES = {
  B2B_ADMIN: {
    label: 'Company Admin',
    description: 'Full access to everything in this company.',
    permissions: ALL_PERMISSIONS
  },
  B2B_OPERATIONS: {
    label: 'Operations',
    description: 'Raises and runs jobs and uploads; no money, no user management.',
    permissions: [
      P.JOBS_READ, P.JOBS_CREATE, P.JOBS_MANAGE,
      P.UPLOADS_READ, P.UPLOADS_CREATE,
      P.TRACKING_READ, P.ENGINEERS_READ,
      P.REPORTS_READ, P.SUPPORT_MANAGE
    ]
  },
  B2B_FINANCE: {
    label: 'Finance',
    description: 'Wallet, payments, invoices and reconciliation; cannot raise or cancel jobs.',
    permissions: [
      P.WALLET_READ, P.WALLET_TOPUP,
      P.INVOICES_READ, P.REPORTS_READ,
      P.JOBS_READ, P.UPLOADS_READ
    ]
  },
  DISPATCHER: {
    label: 'Dispatcher',
    description: 'Creates and watches jobs; no money, no user management.',
    permissions: [
      P.JOBS_READ, P.JOBS_CREATE,
      P.UPLOADS_READ, P.TRACKING_READ, P.ENGINEERS_READ
    ]
  }
};

/** The permissions a B2B principal actually holds. */
function permissionsFor(user = {}) {
  // The company logging in with its own credentials is the company admin.
  if (user.isCompanyLogin || user.role === 'Company Admin' || user.accessRole === 'B2B_ADMIN') {
    return new Set(ALL_PERMISSIONS);
  }
  const role = ACCESS_ROLES[user.accessRole];
  const fromRole = role ? role.permissions : [];
  return new Set([...fromRole, ...(user.permissions || [])]);
}

function hasPermission(user, permissionKey) {
  return permissionsFor(user).has(permissionKey);
}

module.exports = {
  PERMISSIONS,
  ACCESS_ROLES,
  ALL_PERMISSIONS,
  permissionsFor,
  hasPermission
};
