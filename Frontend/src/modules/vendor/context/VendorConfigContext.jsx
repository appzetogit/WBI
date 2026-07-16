import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../../../services/api';

const VendorConfigContext = createContext();

// Safe default config — dashboard renders even if API is down
const DEFAULT_CONFIG = {
  vendorProfile: { walletBalance: 0, vendorTier: 'STANDARD', overallRating: 0, complianceStatus: null },
  approvedServices: [],
  dashboardWidgets: ['wallet', 'active_projects'],
  sidebarSections: [
    'Dashboard', 'Business Intake', 'Clients & Contracts',
    'Project Operations', 'Workforce', 'Resources',
    'Quality & Control', 'Finance', 'Performance',
    'Compliance', 'Notifications', 'Support', 'Settings'
  ],
  kpiDefinitions: [],
  projectTemplates: {},
  activeProjectsCount: 0,
  pendingOpportunitiesCount: 0,
  alerts: []
};

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
        setConfig(response.data.data);
      } else {
        // API responded but returned failure — use defaults
        console.warn('[VendorConfig] Config API returned failure, using defaults.');
        setConfig(DEFAULT_CONFIG);
        setError(response.data.message || 'Config load failed');
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Error fetching dynamic config';
      console.error('[VendorConfig] Config fetch failed:', errMsg);

      // Use default config so dashboard still renders
      setConfig(DEFAULT_CONFIG);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig, retryCount]);

  const handleRetry = () => {
    setLoading(true);
    setRetryCount(c => c + 1);
  };

  // Show spinner only on very first load
  if (loading && !config) {
    return (
      <div className="flex h-screen items-center justify-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <span className="text-base font-medium text-gray-600">Loading Vendor Dashboard...</span>
      </div>
    );
  }

  return (
    <VendorConfigContext.Provider value={{ ...config, configError: error, refetchConfig: handleRetry }}>
      {/* Non-blocking warning banner if config failed but defaults are in use */}
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
  if (context === undefined) {
    throw new Error('useVendorConfig must be used within a VendorConfigProvider');
  }
  return context;
};
