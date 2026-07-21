import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useVendorConfig } from '../context/VendorConfigContext';
import {
  buildServiceRoutes,
  isSlugAllowedForVendor,
  resolvePrimaryServiceSlug,
  vendorPath
} from '../utils/serviceSlug';

/**
 * Ensures :serviceSlug matches one of the vendor's registered services.
 * Wrong slug → redirect to primary service path (same suffix).
 */
const ServiceSlugGuard = ({ children }) => {
  const { serviceSlug } = useParams();
  const location = useLocation();
  const {
    approvedServices = [],
    serviceRoutes: apiRoutes,
    primaryServiceSlug,
    isLoading
  } = useVendorConfig() || {};

  const serviceRoutes = apiRoutes?.length ? apiRoutes : buildServiceRoutes(approvedServices);
  const primary = resolvePrimaryServiceSlug(primaryServiceSlug, serviceRoutes, approvedServices);

  if (isLoading && !serviceRoutes.length && !approvedServices.length) {
    return (
      <div className="flex h-screen items-center justify-center gap-3 bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <span className="text-sm font-medium text-gray-600">Loading your service portal…</span>
      </div>
    );
  }

  // No registered services yet — allow "portal" fallback only
  if (!serviceRoutes.length) {
    if (serviceSlug !== 'portal') {
      const rest = location.pathname.replace(/^\/vendor\/[^/]+\/?/, '') || 'dashboard';
      return <Navigate to={vendorPath('portal', rest)} replace />;
    }
    return children;
  }

  if (!isSlugAllowedForVendor(serviceSlug, serviceRoutes, approvedServices)) {
    const rest = location.pathname.replace(/^\/vendor\/[^/]+\/?/, '') || 'dashboard';
    const target = vendorPath(primary, rest);
    // Avoid Navigate-to-self loops (e.g. stale primaryServiceSlug: "portal")
    if (location.pathname === target || serviceSlug === primary) {
      return children;
    }
    return <Navigate to={target} replace />;
  }

  return children;
};

export default ServiceSlugGuard;
