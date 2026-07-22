import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useVendorConfig } from '../context/VendorConfigContext';
import {
  buildServiceRoutes,
  isSlugAllowedForVendor,
  resolvePrimaryServiceSlug,
  vendorPath
} from '../utils/serviceSlug';

/**
 * Base path for the current vendor service portal: /vendor/:serviceSlug
 */
export default function useVendorBasePath() {
  const { serviceSlug } = useParams();
  const { primaryServiceSlug, serviceRoutes, approvedServices = [] } = useVendorConfig() || {};

  const routes = serviceRoutes?.length ? serviceRoutes : buildServiceRoutes(approvedServices);
  const resolvedPrimary = resolvePrimaryServiceSlug(primaryServiceSlug, routes, approvedServices);
  const slug = isSlugAllowedForVendor(serviceSlug, routes, approvedServices)
    ? serviceSlug
    : resolvedPrimary;

  return useMemo(() => {
    const primaryService = routes.find((r) => r.slug === slug) || routes[0] || null;
    return {
      slug,
      basePath: `/vendor/${slug}`,
      serviceRoutes: routes,
      primaryService,
      categoryCode: primaryService?.categoryCode || primaryService?.code || '',
      categoryName: primaryService?.categoryName || primaryService?.name || primaryService?.label || '',
      path: (rest = 'dashboard') => vendorPath(slug, rest)
    };
  }, [slug, routes]);
}
