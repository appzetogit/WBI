import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../../../services/api';
import { normalizeVendorConfigRoutes } from '../utils/serviceSlug';

// Safe default config — dashboard renders even if API is down
const DEFAULT_CONFIG = {
  vendorId: null,
  companyName: '',
  vendorTier: 'bronze',
  vendorProfile: { walletBalance: 0, vendorTier: 'bronze', overallRating: 0, complianceStatus: null },
  approvedServices: [],
  serviceRoutes: [],
  primaryServiceSlug: null,
  primaryService: null,
  operationalCities: [],
  maxCapacityPerMonth: 10,
  dashboardWidgets: ['wallet', 'active_projects', 'available_engineers', 'sla_adherence'],
  sidebarSections: [
    'Dashboard', 'Business Intake', 'Clients & Contracts',
    'Project Operations', 'Workforce', 'Resources',
    'Quality & Control', 'Finance', 'Performance',
    'Compliance', 'Notifications', 'Support', 'Settings'
  ],
  kpiDefinitions: [],
  extraKPIs: [],
  inventoryCategories: [],
  toolCategories: [],
  projectMilestones: {},
  projectTemplates: {},
  siteChecklist: {},
  complianceDocs: [],
  assetFields: {},
  activeProjectsCount: 0,
  pendingOpportunitiesCount: 0,
  alerts: []
};

const VendorConfigContext = createContext(null);

export const VendorConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchConfig = useCallback(async () => {
    try {
      setError(null);
      const response = await api.get('/vendor/config');
      if (response.data.success) {
        const data = response.data.data || {};
        const normalized = normalizeVendorConfigRoutes(data);
        console.info('[VendorConfig] loaded', {
          company: normalized.companyName,
          services: (normalized.approvedServices || []).map((s) => s.categoryCode),
          primaryServiceSlug: normalized.primaryServiceSlug,
          serviceRoutes: (normalized.serviceRoutes || []).map((r) => r.slug),
          extraKPIs: (normalized.extraKPIs || []).length,
          cached: response.data.cached
        });
        setConfig({ ...DEFAULT_CONFIG, ...normalized });
      } else {
        console.warn('[VendorConfig] Config API returned failure, using defaults.');
        setConfig(DEFAULT_CONFIG);
        setError(response.data.message || 'Config load failed');
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Error fetching dynamic config';
      console.error('[VendorConfig] Config fetch failed:', errMsg);
      setConfig(DEFAULT_CONFIG);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig, retryCount]);

  // Live updates when admin approves/suspends a service
  useEffect(() => {
    const onApproved = (event) => {
      const name = event?.detail?.categoryName || 'Service';
      console.info(`[VendorConfig] service-approved: ${name}`);
      setLoading(true);
      setRetryCount((c) => c + 1);
    };
    const onSuspended = (event) => {
      const name = event?.detail?.categoryCode || 'Service';
      console.info(`[VendorConfig] service-suspended: ${name}`);
      setLoading(true);
      setRetryCount((c) => c + 1);
    };

    window.addEventListener('vendor-service-approved', onApproved);
    window.addEventListener('vendor-service-suspended', onSuspended);
    return () => {
      window.removeEventListener('vendor-service-approved', onApproved);
      window.removeEventListener('vendor-service-suspended', onSuspended);
    };
  }, []);

  const handleRetry = () => {
    setLoading(true);
    setRetryCount((c) => c + 1);
  };

  if (loading && !config) {
    return (
      <VendorConfigContext.Provider value={{ ...DEFAULT_CONFIG, isLoading: true, configError: null, refetch: handleRetry, refetchConfig: handleRetry }}>
        <div className="flex h-screen items-center justify-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <span className="text-base font-medium text-gray-600">Loading Vendor Dashboard...</span>
        </div>
      </VendorConfigContext.Provider>
    );
  }

  return (
    <VendorConfigContext.Provider
      value={{
        ...config,
        isLoading: loading,
        configError: error,
        refetch: handleRetry,
        refetchConfig: handleRetry
      }}
    >
      {error && (
        <div className="flex items-center justify-between bg-amber-50 px-4 py-2 text-sm text-amber-800 border-b border-amber-200">
          <span>⚠️ Dashboard running in limited mode — server connection issue. Some data may be unavailable.</span>
          <button
            onClick={handleRetry}
            className="ml-4 rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700"
          >
            Retry
          </button>
        </div>
      )}
      {children}
    </VendorConfigContext.Provider>
  );
};

export const useVendorConfig = () => {
  const context = useContext(VendorConfigContext);
  if (!context) {
    throw new Error('useVendorConfig must be used within a VendorConfigProvider');
  }
  return context;
};
