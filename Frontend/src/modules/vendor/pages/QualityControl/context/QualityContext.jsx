import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const QualityContext = createContext(null);

export const QualityProvider = ({ children }) => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', status: '', priority: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const updateFilter = useCallback((k, v) => setFilters((p) => ({ ...p, [k]: v })), []);
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ search, setSearch, filters, updateFilter, refreshKey, triggerRefresh }),
    [search, filters, updateFilter, refreshKey, triggerRefresh]
  );

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
};

export const useQuality = () => {
  const ctx = useContext(QualityContext);
  if (!ctx) throw new Error('useQuality must be within QualityProvider');
  return ctx;
};
