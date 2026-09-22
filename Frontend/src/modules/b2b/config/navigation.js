import {
  FiHome, FiBriefcase, FiUploadCloud, FiRadio, FiShuffle, FiCreditCard,
  FiPieChart, FiHelpCircle, FiUser, FiFileText
} from 'react-icons/fi';

/**
 * B2B panel navigation — the single source for the sidebar, the page titles
 * and which permission each screen needs. `permission` mirrors the API's
 * keys (Backend/config/b2bAccessRoles.js); the API still enforces them.
 *
 * `countKey` names a job view whose live count is shown beside the item.
 */
export const B2B_NAV = [
  { name: 'Dashboard', path: '/b2b/dashboard', icon: FiHome, permission: 'jobs.read' },
  { name: 'Enterprise Onboarding', path: '/b2b/onboarding', icon: FiFileText, permission: 'company.manage', onboardingOnly: true },
  {
    name: 'Jobs',
    icon: FiBriefcase,
    base: '/b2b/jobs',
    permission: 'jobs.read',
    children: [
      { name: 'All Jobs', path: '/b2b/jobs', countKey: 'all', exact: true },
      { name: 'Pending', path: '/b2b/jobs/pending', countKey: 'pending' },
      { name: 'Dispatched', path: '/b2b/jobs/dispatched', countKey: 'dispatched' },
      { name: 'En Route', path: '/b2b/jobs/en_route', countKey: 'en_route' },
      { name: 'In Progress', path: '/b2b/jobs/in_progress', countKey: 'in_progress' },
      { name: 'Resolved', path: '/b2b/jobs/resolved', countKey: 'resolved' },
      { name: 'Cancelled', path: '/b2b/jobs/cancelled', countKey: 'cancelled' },
      { name: 'Failed', path: '/b2b/jobs/failed', countKey: 'failed', tone: 'danger' },
      { name: 'SLA Breached', path: '/b2b/jobs/sla_breached', countKey: 'sla_breached', tone: 'danger' }
    ]
  },
  {
    name: 'Bulk Operations',
    icon: FiUploadCloud,
    base: '/b2b/bulk-jobs',
    permission: 'uploads.read',
    children: [
      { name: 'Upload Jobs', path: '/b2b/bulk-jobs/upload', permission: 'uploads.create', alsoActive: ['/b2b/bulk-jobs'] },
      { name: 'Upload History', path: '/b2b/bulk-jobs/history' },
      { name: 'Validation Errors', path: '/b2b/bulk-jobs/validation-errors' },
      { name: 'Templates', path: '/b2b/bulk-jobs/templates' }
    ]
  },
  {
    name: 'Live Operations',
    icon: FiRadio,
    base: '/b2b/live',
    permission: 'tracking.read',
    children: [
      { name: 'Live Map', path: '/b2b/live/map' },
      { name: 'Engineer Tracking', path: '/b2b/live/engineers', permission: 'engineers.read' },
      { name: 'Active Jobs', path: '/b2b/live/active-jobs', permission: 'jobs.read', countKey: 'active' }
    ]
  },
  {
    name: 'Assignments',
    icon: FiShuffle,
    base: '/b2b/assignments',
    permission: 'jobs.read',
    children: [
      { name: 'Vendor Assignments', path: '/b2b/assignments/vendor' },
      { name: 'Freelancer Assignments', path: '/b2b/assignments/freelancer' },
      { name: 'Assignment History', path: '/b2b/assignments/history' }
    ]
  },
  {
    name: 'Wallet & Billing',
    icon: FiCreditCard,
    base: '/b2b/billing',
    permission: 'wallet.read',
    children: [
      { name: 'Wallet', path: '/b2b/billing/wallet', alsoActive: ['/b2b/wallet'] },
      { name: 'Add Funds', path: '/b2b/billing/add-funds', permission: 'wallet.topup' },
      { name: 'Transactions', path: '/b2b/billing/transactions' },
      { name: 'Invoices', path: '/b2b/billing/invoices', permission: 'invoices.read', alsoActive: ['/b2b/invoices'] },
      { name: 'Reconciliation', path: '/b2b/billing/reconciliation' }
    ]
  },
  {
    name: 'Reports',
    icon: FiPieChart,
    base: '/b2b/reports',
    permission: 'reports.read',
    children: [
      { name: 'Job Reports', path: '/b2b/reports/jobs', alsoActive: ['/b2b/reports'] },
      { name: 'SLA Reports', path: '/b2b/reports/sla' },
      { name: 'Engineer Reports', path: '/b2b/reports/engineers' },
      { name: 'Financial Reports', path: '/b2b/reports/financial' },
      { name: 'Exports', path: '/b2b/reports/exports' }
    ]
  },
  { name: 'Support', path: '/b2b/support', icon: FiHelpCircle, permission: 'support.manage' },
  { name: 'Company Profile', path: '/b2b/company-profile', icon: FiUser, permission: 'company.manage' }
];

/** Titles for routes that are not sidebar items. */
const EXTRA_TITLES = [
  ['/b2b/notifications', 'Notifications'],
  ['/b2b/settings', 'Settings'],
  ['/b2b/users', 'Users & Roles'],
  ['/b2b/bulk-jobs/review', 'Review Upload'],
  ['/b2b/bulk-jobs/errors', 'Upload Errors'],
  ['/b2b/bulk-jobs/', 'Upload Details']
];

const matches = (pathname, path, exact) =>
  exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);

/** Is this nav leaf the current page? */
export const isLeafActive = (pathname, leaf) =>
  matches(pathname, leaf.path, leaf.exact) || (leaf.alsoActive || []).some((p) => pathname === p);

/** Title for the header bar. Most specific match wins. */
export const titleFor = (pathname) => {
  let best = null;
  for (const item of B2B_NAV) {
    const leaves = item.children || [item];
    for (const leaf of leaves) {
      if (isLeafActive(pathname, leaf) && (!best || leaf.path.length > best.path.length)) {
        best = { path: leaf.path, name: item.children ? `${item.name} · ${leaf.name}` : leaf.name };
      }
    }
  }
  if (best) return best.name;
  const extra = EXTRA_TITLES.find(([p]) => pathname.startsWith(p));
  return extra ? extra[1] : 'B2B Panel';
};

/** Keep only what the signed-in principal may open. */
export const filterNav = (nav, can) =>
  nav
    .filter((item) => !item.permission || can(item.permission))
    .map((item) => (item.children
      ? { ...item, children: item.children.filter((c) => !c.permission || can(c.permission)) }
      : item))
    .filter((item) => !item.children || item.children.length > 0);
