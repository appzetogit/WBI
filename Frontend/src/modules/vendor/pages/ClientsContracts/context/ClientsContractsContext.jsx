import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const ClientsContractsContext = createContext(null);

export const ClientsContractsProvider = ({ children }) => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    city: '',
    status: '',
    sort: 'lastActivityAt'
  });
  const [refreshKey, setRefreshKey] = useState(0);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setSearch('');
    setFilters({ category: '', city: '', status: '', sort: 'lastActivityAt' });
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const value = useMemo(
    () => ({
      search,
      setSearch,
      filters,
      setFilters,
      updateFilter,
      resetFilters,
      refreshKey,
      triggerRefresh
    }),
    [search, filters, updateFilter, resetFilters, refreshKey, triggerRefresh]
  );

  return (
    <ClientsContractsContext.Provider value={value}>
      {children}
    </ClientsContractsContext.Provider>
  );
};

export const useClientsContracts = () => {
  const ctx = useContext(ClientsContractsContext);
  if (!ctx) throw new Error('useClientsContracts must be used within ClientsContractsProvider');
  return ctx;
};

export default ClientsContractsContext;
