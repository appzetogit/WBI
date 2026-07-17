import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const WorkforceContext = createContext(null);

export const WorkforceProvider = ({ children }) => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', status: '', availability: '', priority: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const updateFilter = useCallback((k, v) => setFilters((p) => ({ ...p, [k]: v })), []);
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ search, setSearch, filters, updateFilter, refreshKey, triggerRefresh }),
    [search, filters, updateFilter, refreshKey, triggerRefresh]
  );

  return <WorkforceContext.Provider value={value}>{children}</WorkforceContext.Provider>;
};

export const useWorkforceOps = () => {
  const ctx = useContext(WorkforceContext);
  if (!ctx) throw new Error('useWorkforceOps must be within WorkforceProvider');
  return ctx;
};
