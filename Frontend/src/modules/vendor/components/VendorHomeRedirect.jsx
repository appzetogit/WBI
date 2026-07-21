import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../../../services/api';
import {
  buildServiceRoutes,
  normalizeVendorConfigRoutes,
  resolvePrimaryServiceSlug,
  vendorPath
} from '../utils/serviceSlug';

/**
 * /vendor and /vendor/dynamic/* → /vendor/:serviceSlug/...
 * Resolves slug from live /vendor/config (registered services).
 */
const VendorHomeRedirect = ({ suffix = 'dashboard' }) => {
  const [target, setTarget] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get('/vendor/config');
        if (cancelled) return;
        const normalized = normalizeVendorConfigRoutes(res.data?.data || {});
        const routes = normalized.serviceRoutes?.length
          ? normalized.serviceRoutes
          : buildServiceRoutes(normalized.approvedServices || []);
        const slug = resolvePrimaryServiceSlug(
          normalized.primaryServiceSlug,
          routes,
          normalized.approvedServices || []
        );
        setTarget(vendorPath(slug, suffix));
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.message || err.message || 'Failed to resolve service portal');
        setTarget(vendorPath('portal', suffix));
      }
    };
    load();
    return () => { cancelled = true; };
  }, [suffix]);

  if (!target) {
    return (
      <div className="flex h-screen items-center justify-center gap-3 bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <span className="text-sm font-medium text-gray-600">
          {error ? 'Opening portal…' : 'Finding your service dashboard…'}
        </span>
      </div>
    );
  }

  return <Navigate to={target} replace />;
};

export default VendorHomeRedirect;
