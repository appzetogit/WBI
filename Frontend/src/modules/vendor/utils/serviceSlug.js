/**
 * Frontend service-slug helpers (mirrors backend utils/serviceSlug.js)
 */

const RESERVED_SLUGS = new Set([
  'login', 'signup', 'forgot-password', 'pending-approval',
  'dynamic', 'digital-solution', 'project-os', 'dashboard',
  'settings', 'notifications', 'support', 'reviews',
  'projects', 'engineers', 'earnings', 'work-orders',
  'portal', 'auth', 'api'
]);

export const slugify = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

export const toServiceSlug = (service = {}) => {
  const fromName = slugify(service.categoryName);
  if (fromName && !RESERVED_SLUGS.has(fromName)) return fromName;
  const fromCode = slugify(service.categoryCode);
  if (fromCode && !RESERVED_SLUGS.has(fromCode)) return fromCode;
  return `service-${slugify(service.categoryCode || 'x') || 'x'}`;
};

export const buildServiceRoutes = (approvedServices = []) => {
  const routes = [];
  const used = new Set();

  (approvedServices || [])
    .filter((s) => s && s.status !== 'suspended' && s.categoryCode)
    .forEach((s) => {
      let slug = toServiceSlug(s);
      if (used.has(slug)) slug = `${slug}-${String(s.categoryCode).toLowerCase()}`;
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

export const getPrimaryServiceSlug = (serviceRoutes = [], approvedServices = []) => {
  if (serviceRoutes?.[0]?.slug) return serviceRoutes[0].slug;
  const built = buildServiceRoutes(approvedServices);
  return built[0]?.slug || 'portal';
};

/** Treat missing/stale "portal" as unset when real services exist */
export const resolvePrimaryServiceSlug = (primaryServiceSlug, serviceRoutes = [], approvedServices = []) => {
  const routes = serviceRoutes?.length ? serviceRoutes : buildServiceRoutes(approvedServices);
  if (routes.length) {
    if (primaryServiceSlug && primaryServiceSlug !== 'portal' && routes.some((r) => r.slug === primaryServiceSlug)) {
      return primaryServiceSlug;
    }
    return routes[0].slug;
  }
  return primaryServiceSlug && primaryServiceSlug !== 'portal' ? primaryServiceSlug : 'portal';
};

/** Normalize API/cached config so slug routing always has serviceRoutes */
export const normalizeVendorConfigRoutes = (data = {}) => {
  const approvedServices = data.approvedServices || [];
  const serviceRoutes = data.serviceRoutes?.length
    ? data.serviceRoutes
    : buildServiceRoutes(approvedServices);
  const primaryServiceSlug = resolvePrimaryServiceSlug(
    data.primaryServiceSlug,
    serviceRoutes,
    approvedServices
  );
  return {
    ...data,
    approvedServices,
    serviceRoutes,
    primaryServiceSlug,
    primaryService: data.primaryService?.slug
      ? data.primaryService
      : serviceRoutes.find((r) => r.slug === primaryServiceSlug) || serviceRoutes[0] || null
  };
};

export const isSlugAllowedForVendor = (slug, serviceRoutes = [], approvedServices = []) => {
  if (!slug || slug === 'portal') {
    return !(serviceRoutes?.length || buildServiceRoutes(approvedServices).length);
  }
  const routes = serviceRoutes?.length ? serviceRoutes : buildServiceRoutes(approvedServices);
  return routes.some((r) => r.slug === slug);
};

export const vendorPath = (slug, rest = 'dashboard') => {
  const clean = String(rest || 'dashboard').replace(/^\//, '');
  return `/vendor/${slug || 'portal'}/${clean}`;
};

/** Derive /vendor/:slug from current URL (safe for non-hook usage) */
export const getVendorBaseFromLocation = (pathname = typeof window !== 'undefined' ? window.location.pathname : '') => {
  const m = String(pathname).match(/^\/vendor\/([^/]+)/);
  if (!m) return '/vendor/portal';
  const slug = m[1];
  if (RESERVED_SLUGS.has(slug) || slug === 'dynamic' || slug === 'digital-solution') {
    return '/vendor/portal';
  }
  return `/vendor/${slug}`;
};
