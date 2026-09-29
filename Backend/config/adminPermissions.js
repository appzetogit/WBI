/**
 * Admin RBAC: permission catalog, default role grants and the route → permission map.
 *
 * The central guard (middleware/adminAccess.js) resolves every /api/admin request
 * to one permission key here, so a hidden button in the panel is never the only
 * control — the API refuses the call too.
 */

const PERMISSIONS = {
  'dashboard.read': 'View dashboards',
  'users.read': 'View users',
  'users.update': 'Edit, block and unblock users',
  'users.delete': 'Delete users',
  'vendors.read': 'View vendors',
  'vendors.update': 'Edit vendor settings, services and coverage',
  'vendors.approve': 'Approve, reject and suspend vendors',
  'workforce.read': 'View engineers and workers',
  'workforce.update': 'Edit engineers and workers (skills, vendor, location)',
  'workforce.approve': 'Approve, reject and suspend engineers and workers',
  'b2b.read': 'View B2B companies, jobs and bulk uploads',
  'b2b.update': 'Operate B2B jobs, support and onboarding',
  'b2b.approve': 'Approve, suspend and control B2B companies',
  'b2b.pricing': 'Edit B2B pricing rules and contracts',
  'jobs.read': 'View jobs and bookings',
  'jobs.assign': 'Assign, reassign and update jobs',
  'jobs.cancel': 'Cancel jobs',
  'payments.read': 'View payments, transactions, settlements and refunds',
  'payments.refund': 'Issue refunds and payment actions',
  'payments.payout': 'Approve, reject and pay withdrawals and settlements',
  'wallet.read': 'View wallets',
  'wallet.manage': 'Adjust wallets, reverse transactions, change limits',
  'services.read': 'View catalog and service configuration',
  'services.create': 'Create catalog items',
  'services.update': 'Update catalog items and service configuration',
  'services.disable': 'Disable or delete catalog items',
  'content.read': 'View banners, home content, reviews and enquiries',
  'content.update': 'Edit banners, home content, reviews and enquiries',
  'verification.read': 'View KYC / document verifications',
  'verification.approve': 'Approve or reject KYC / documents',
  'notifications.read': 'View notification logs, events and templates',
  'notifications.send': 'Send announcements and edit templates',
  'reports.read': 'View and export reports',
  'settings.read': 'View platform settings',
  'settings.update': 'Change platform, payment and payout settings',
  'locations.manage': 'Manage cities, states, pincodes and service areas',
  'disputes.read': 'View disputes',
  'disputes.manage': 'Resolve disputes',
  'audit.read': 'View audit logs',
  'admins.manage': 'Manage admins, roles and permissions'
};

const ALL_READ = Object.keys(PERMISSIONS).filter((k) => k.endsWith('.read'));

/** Default grants per role. super_admin holds every permission ('*'). */
const DEFAULT_ROLES = {
  super_admin: { label: 'Super Admin', permissions: ['*'] },
  // Legacy general admin: runs day-to-day operations but cannot move money,
  // change platform settings or manage other admins.
  admin: {
    label: 'Admin',
    permissions: [
      ...ALL_READ.filter((k) => k !== 'audit.read'),
      'users.update', 'vendors.update', 'vendors.approve', 'workforce.update', 'workforce.approve',
      'b2b.update', 'b2b.approve', 'jobs.assign', 'jobs.cancel',
      'services.create', 'services.update', 'services.disable', 'content.update',
      'verification.approve', 'notifications.send', 'locations.manage', 'disputes.manage'
    ]
  },
  operations_admin: {
    label: 'Operations Admin',
    permissions: [
      'dashboard.read', 'users.read', 'users.update', 'vendors.read', 'vendors.update',
      'workforce.read', 'workforce.update', 'b2b.read', 'b2b.update',
      'jobs.read', 'jobs.assign', 'jobs.cancel', 'services.read', 'services.create', 'services.update',
      'services.disable', 'content.read', 'content.update', 'locations.manage', 'disputes.read',
      'disputes.manage', 'reports.read', 'notifications.read', 'notifications.send', 'wallet.read', 'payments.read'
    ]
  },
  finance_admin: {
    label: 'Finance Admin',
    permissions: [
      'dashboard.read', 'users.read', 'vendors.read', 'workforce.read', 'b2b.read', 'b2b.pricing', 'jobs.read',
      'payments.read', 'payments.refund', 'payments.payout', 'wallet.read', 'wallet.manage',
      'reports.read', 'disputes.read', 'disputes.manage', 'settings.read', 'audit.read'
    ]
  },
  support_admin: {
    label: 'Support Admin',
    permissions: [
      'dashboard.read', 'users.read', 'vendors.read', 'workforce.read', 'b2b.read', 'b2b.update',
      'jobs.read', 'jobs.assign', 'payments.read', 'wallet.read', 'disputes.read', 'disputes.manage',
      'notifications.read', 'content.read'
    ]
  },
  verification_admin: {
    label: 'Verification Admin',
    permissions: [
      'dashboard.read', 'users.read', 'vendors.read', 'vendors.approve', 'workforce.read', 'workforce.approve',
      'b2b.read', 'b2b.approve', 'verification.read', 'verification.approve'
    ]
  }
};

const ADMIN_ROLE_KEYS = Object.keys(DEFAULT_ROLES);

const isWrite = (method) => !['GET', 'HEAD', 'OPTIONS'].includes(method);
const APPROVAL = /\/(approve|reject|suspend|verify|status|kyc-status|bank-status|controls|request-changes)(\/|$)/;

/**
 * Ordered rules: the first matching pattern decides. Each rule is
 * [pathRegex, read permission, write permission | (method, path) => permission].
 * Paths are relative to /api/admin.
 */
const RULES = [
  [/^\/(fcm-tokens|upload|upload-media|upload-file)(\/|$)/, null, null], // self-service, any admin
  [/^\/rbac\/me$/, null, null],
  [/^\/(admins|rbac)(\/|$)/, 'admins.manage', 'admins.manage'],
  [/^\/audit-logs(\/|$)/, 'audit.read', 'audit.read'],
  [/^\/dashboard(\/|$)/, 'dashboard.read', 'dashboard.read'],
  [/^\/disputes(\/|$)/, 'disputes.read', 'disputes.manage'],
  [/^\/refunds(\/|$)/, 'payments.read', 'payments.refund'],
  [/^\/jobs(\/|$)/, 'jobs.read', 'jobs.assign'],
  [/^\/users(\/|$)/, 'users.read', (m) => (m === 'DELETE' ? 'users.delete' : 'users.update')],
  [/^\/b2b-wallets(\/|$)/, 'wallet.read', 'wallet.manage'],
  [/^\/b2b\/(pricing-rules|contracts)(\/|$)/, 'b2b.read', 'b2b.pricing'],
  [/^\/b2b\/invoices(\/|$)/, 'payments.read', 'payments.refund'],
  [/^\/b2b\/reports(\/|$)/, 'reports.read', 'reports.read'],
  [/^\/b2b\/settings(\/|$)/, 'b2b.read', 'settings.update'],
  [/^\/(b2b-companies)(\/|$)/, 'b2b.read', (m, p) => (APPROVAL.test(p) ? 'b2b.approve' : 'b2b.update')],
  [/^\/(b2b-onboarding|bulk-jobs|b2b|enterprise-b2b)(\/|$)/, 'b2b.read', 'b2b.update'],
  [/^\/vendors\/[^/]+\/(approve-service|services)(\/|$)/, 'vendors.read', 'vendors.update'],
  [/^\/vendors\/[^/]+\/commission$/, 'vendors.read', 'b2b.pricing'],
  [/^\/(vendors|vendor-settings|vendor-support|vendor-registration-config|vendor-services|vendor-parts|vendor-offerings)(\/|$)/, 'vendors.read',
    (m, p) => (APPROVAL.test(p) || m === 'DELETE' ? 'vendors.approve' : 'vendors.update')],
  [/^\/(workers|engineers)\/[^/]+\/pay$/, 'workforce.read', 'payments.payout'],
  [/^\/(workers|engineers|engineer-tools|engineer-coupons|engineer-coupon-analytics|engineer-coupon-redemptions|engineer-registration-config)(\/|$)/,
    'workforce.read', (m, p) => (APPROVAL.test(p) || m === 'DELETE' ? 'workforce.approve' : 'workforce.update')],
  [/^\/bookings\/[^/]+\/payment-action$/, 'payments.read', 'payments.refund'],
  [/^\/bookings(\/|$)/, 'jobs.read', (m, p) => (/\/cancel$/.test(p) ? 'jobs.cancel' : 'jobs.assign')],
  [/^\/(payments|transactions)(\/|$)/, 'payments.read', 'payments.refund'],
  [/^\/payment-config(\/|$)/, 'payments.read', 'settings.update'],
  [/^\/settlements\/vendors\/[^/]+\/(block|unblock|cash-limit)$/, 'payments.read', 'wallet.manage'],
  [/^\/settlements(\/|$)/, 'payments.read', 'payments.payout'],
  [/^\/settings(\/|$)/, 'settings.read', 'settings.update'],
  [/^\/(verifications|verification-config|verification-logs)(\/|$)/, 'verification.read', 'verification.approve'],
  [/^\/notifications(\/|$)/, 'notifications.read', 'notifications.send'],
  [/^\/(reports)(\/|$)/, 'reports.read', 'reports.read'],
  [/^\/(cities|locations)(\/|$)/, 'services.read', 'locations.manage'],
  [/^\/(banners|home|home-content|home-sections|engineer-offer-banners|trust-videos|reviews|cms|scrap|[a-z-]+-enquiries|web-enquiries|app-enquiries)(\/|$)/,
    'content.read', 'content.update'],
  // Everything else under /api/admin is catalog / service configuration.
  [/^\//, 'services.read', (m, p) => {
    if (m === 'POST' && !/\/(status|publish|rollback|toggle|order)$/.test(p)) return 'services.create';
    if (m === 'DELETE' || /\/(status|toggle)$/.test(p)) return 'services.disable';
    return 'services.update';
  }]
];

/** @returns {string|null} permission key, or null when any admin may call it */
const permissionFor = (method, path) => {
  for (const [re, read, write] of RULES) {
    if (!re.test(path)) continue;
    const perm = isWrite(method) ? write : read;
    return typeof perm === 'function' ? perm(method, path) : perm;
  }
  return null;
};

const hasPermission = (granted, key) => !key || granted.includes('*') || granted.includes(key);

module.exports = { PERMISSIONS, DEFAULT_ROLES, ADMIN_ROLE_KEYS, permissionFor, hasPermission };
