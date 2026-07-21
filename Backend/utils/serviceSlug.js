/**
 * Derive URL slugs from vendor approvedServices (no hardcoding of paths).
 */

const RESERVED_SLUGS = new Set([
  'login', 'signup', 'forgot-password', 'pending-approval',
  'dynamic', 'digital-solution', 'project-os', 'dashboard',
  'settings', 'notifications', 'support', 'reviews',
  'projects', 'engineers', 'earnings', 'work-orders',
  'portal', 'auth', 'api'
]);

const slugify = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

/**
 * @param {{ categoryCode?: string, categoryName?: string }} service
 * @returns {string}
 */
const toServiceSlug = (service = {}) => {
  const fromName = slugify(service.categoryName);
  if (fromName && !RESERVED_SLUGS.has(fromName)) return fromName;
  const fromCode = slugify(service.categoryCode);
  if (fromCode && !RESERVED_SLUGS.has(fromCode)) return fromCode;
  return `service-${slugify(service.categoryCode || 'x') || 'x'}`;
};

/**
 * Build route metadata for each approved (non-suspended) service.
 */
const buildServiceRoutes = (approvedServices = []) => {
  const routes = [];
  const used = new Set();

  (approvedServices || [])
    .filter((s) => s && s.status !== 'suspended' && s.categoryCode)
    .forEach((s) => {
      let slug = toServiceSlug(s);
      if (used.has(slug)) {
        slug = `${slug}-${String(s.categoryCode).toLowerCase()}`;
      }
      used.add(slug);
      routes.push({
        categoryCode: String(s.categoryCode).toUpperCase(),
        categoryName: s.categoryName || s.categoryCode,
        slug,
        status: s.status || 'pending',
        subServices: Array.isArray(s.subServices) ? s.subServices : []
      });
    });

  return routes;
};

const getPrimaryServiceSlug = (serviceRoutes = []) =>
  serviceRoutes[0]?.slug || 'portal';

module.exports = {
  RESERVED_SLUGS,
  slugify,
  toServiceSlug,
  buildServiceRoutes,
  getPrimaryServiceSlug
};
