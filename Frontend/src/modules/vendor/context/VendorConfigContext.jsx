import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../../../services/api'; // Or whatever api instance is used in frontend

const VendorConfigContext = createContext();

export const VendorConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await api.get('/vendor/config');
        if (response.data.success) {
          setConfig(response.data.data);
        } else {
          setError(response.data.message || 'Failed to load config');
        }
      } catch (err) {
        console.error('Error fetching vendor config:', err);
        setError(err.response?.data?.message || 'Error fetching dynamic config');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        <span className="ml-3 text-lg font-medium text-gray-700">Loading Vendor Environment...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <div className="rounded-lg bg-red-50 p-6 text-red-600">
          <h2 className="text-xl font-bold">Failed to Load Dashboard</h2>
          <p className="mt-2">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <VendorConfigContext.Provider value={{ ...config }}>
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
