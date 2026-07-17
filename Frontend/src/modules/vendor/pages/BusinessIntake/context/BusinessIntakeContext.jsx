import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const BusinessIntakeContext = createContext(null);

const BOOKMARKS_KEY = 'wbi_bi_bookmarks';

const loadBookmarks = () => {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

export const BusinessIntakeProvider = ({ children }) => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    city: '',
    minBudget: '',
    maxBudget: '',
    priority: '',
    status: 'open',
    sort: 'createdAt',
  });
  const [viewMode, setViewMode] = useState('grid');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [bookmarks, setBookmarks] = useState(loadBookmarks);
  const [refreshKey, setRefreshKey] = useState(0);

  const toggleBookmark = useCallback((id) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setSearch('');
    setFilters({
      category: '',
      city: '',
      minBudget: '',
      maxBudget: '',
      priority: '',
      status: 'open',
      sort: 'createdAt',
    });
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
      viewMode,
      setViewMode,
      showAdvancedFilters,
      setShowAdvancedFilters,
      bookmarks,
      toggleBookmark,
      refreshKey,
      triggerRefresh,
    }),
    [
      search,
      filters,
      viewMode,
      showAdvancedFilters,
      bookmarks,
      updateFilter,
      resetFilters,
      toggleBookmark,
      refreshKey,
      triggerRefresh,
    ]
  );

  return (
    <BusinessIntakeContext.Provider value={value}>
      {children}
    </BusinessIntakeContext.Provider>
  );
};

export const useBusinessIntake = () => {
  const ctx = useContext(BusinessIntakeContext);
  if (!ctx) throw new Error('useBusinessIntake must be used within BusinessIntakeProvider');
  return ctx;
};

export default BusinessIntakeContext;
