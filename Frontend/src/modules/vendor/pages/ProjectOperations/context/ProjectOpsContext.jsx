import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const ProjectOpsContext = createContext(null);

export const ProjectOpsProvider = ({ children }) => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', status: '', priority: '', city: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const updateFilter = useCallback((k, v) => setFilters((p) => ({ ...p, [k]: v })), []);
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ search, setSearch, filters, updateFilter, refreshKey, triggerRefresh }),
    [search, filters, updateFilter, refreshKey, triggerRefresh]
  );

  return <ProjectOpsContext.Provider value={value}>{children}</ProjectOpsContext.Provider>;
};

export const useProjectOps = () => {
  const ctx = useContext(ProjectOpsContext);
  if (!ctx) throw new Error('useProjectOps must be within ProjectOpsProvider');
  return ctx;
};
