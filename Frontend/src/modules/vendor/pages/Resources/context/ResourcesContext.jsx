import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const ResourcesContext = createContext(null);

export const ResourcesProvider = ({ children }) => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', status: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const updateFilter = useCallback((k, v) => setFilters((p) => ({ ...p, [k]: v })), []);
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ search, setSearch, filters, updateFilter, refreshKey, triggerRefresh }),
    [search, filters, updateFilter, refreshKey, triggerRefresh]
  );

  return <ResourcesContext.Provider value={value}>{children}</ResourcesContext.Provider>;
};

export const useResourcesOps = () => {
  const ctx = useContext(ResourcesContext);
  if (!ctx) throw new Error('useResourcesOps must be within ResourcesProvider');
  return ctx;
};
