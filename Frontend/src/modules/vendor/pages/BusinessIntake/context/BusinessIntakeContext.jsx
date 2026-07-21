import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import {
  bookmarkOpportunity as apiBookmark,
  removeBookmark as apiRemoveBookmark,
  fetchOpportunities,
} from '../../../services/businessIntakeService';

const BusinessIntakeContext = createContext(null);

const BOOKMARKS_KEY = 'wbi_bi_bookmarks';

const loadLocalBookmarks = () => {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

const persistLocalBookmarks = (set) => {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
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
  const [bookmarks, setBookmarks] = useState(loadLocalBookmarks);
  const [refreshKey, setRefreshKey] = useState(0);
  const [proposalSeed, setProposalSeed] = useState(null);

  // Hydrate bookmarks from API (open opportunities only; merge with local)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchOpportunities({ bookmarked: true, limit: 100 });
        const ids = (res.data?.data || [])
          .filter((o) => o.isBookmarked)
          .map((o) => o._id);
        if (cancelled || !ids.length) return;
        setBookmarks((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.add(id));
          persistLocalBookmarks(next);
          return next;
        });
      } catch {
        /* offline / limited mode — keep localStorage */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleBookmark = useCallback(async (id) => {
    const wasBookmarked = bookmarks.has(id);
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistLocalBookmarks(next);
      return next;
    });

    try {
      if (wasBookmarked) await apiRemoveBookmark(id);
      else await apiBookmark(id);
    } catch {
      // Revert on failure
      setBookmarks((prev) => {
        const next = new Set(prev);
        if (wasBookmarked) next.add(id);
        else next.delete(id);
        persistLocalBookmarks(next);
        return next;
      });
    }
  }, [bookmarks]);

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

  const openProposalBuilder = useCallback((seed = {}) => {
    setProposalSeed(seed || {});
  }, []);

  const clearProposalSeed = useCallback(() => {
    setProposalSeed(null);
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
      proposalSeed,
      openProposalBuilder,
      clearProposalSeed,
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
      proposalSeed,
      openProposalBuilder,
      clearProposalSeed,
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
