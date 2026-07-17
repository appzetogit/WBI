import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchOpportunities, fetchOpportunityById } from '../../../services/businessIntakeService';
import { useBusinessIntake } from '../context/BusinessIntakeContext';
import OpportunityCard from './OpportunityCard';
import OpportunityDrawer from './OpportunityDrawer';
import { SkeletonGrid } from './SkeletonCard';
import EmptyState from './EmptyState';
import Pagination from './Pagination';

const ROUTE_TYPE_MAP = {
  all: '',
  requests: 'client_request',
  b2b: 'b2b_opportunity',
  bulk: 'bulk_requirement',
  rfq: 'bid_quote_request',
};

const PAGE_SIZE = 6;

const OpportunityList = ({
  type: propType,
  emptyTitle = 'No opportunities found',
  emptyDescription = 'Try adjusting your filters or check back later for new opportunities.',
  emptyIcon,
}) => {
  const location = useLocation();
  const segment = location.pathname.split('/').pop();
  const type = propType ?? ROUTE_TYPE_MAP[segment] ?? '';

  const {
    search,
    filters,
    viewMode,
    bookmarks,
    toggleBookmark,
    refreshKey,
  } = useBusinessIntake();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
  const [selectedOpp, setSelectedOpp] = useState(null);
  const filterKey = `${type}|${search}|${JSON.stringify(filters)}|${refreshKey}`;
  const prevFilterKey = useRef(filterKey);

  const load = useCallback(async (targetPage) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        status: filters.status,
        sort: filters.sort,
        page: targetPage,
        limit: PAGE_SIZE,
      };
      if (type) params.type = type;
      if (search) params.search = search;
      if (filters.category) params.category = filters.category;
      if (filters.city) params.city = filters.city;
      if (filters.minBudget) params.minBudget = filters.minBudget;
      if (filters.maxBudget) params.maxBudget = filters.maxBudget;
      if (filters.priority) params.priority = filters.priority;

      const res = await fetchOpportunities(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load opportunities');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [type, search, filters]);

  useEffect(() => {
    const filtersChanged = prevFilterKey.current !== filterKey;
    prevFilterKey.current = filterKey;
    const targetPage = filtersChanged ? 1 : page;
    if (filtersChanged && page !== 1) {
      setPage(1);
    }
    load(targetPage);
  }, [filterKey, page, load]);

  const handleView = async (id, opp) => {
    setSelectedOpp(opp);
    try {
      const res = await fetchOpportunityById(id);
      setSelectedOpp(res.data.data);
    } catch {
      /* keep partial */
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      setPage(newPage);
    }
  };

  return (
    <>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonGrid count={PAGE_SIZE} />
      ) : data.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
                : 'flex flex-col gap-3'
            }
          >
            {data.map((opp) => (
              <OpportunityCard
                key={opp._id}
                opportunity={opp}
                onView={handleView}
                onBid={handleView}
                onAccept={handleView}
                compact={viewMode === 'list'}
                bookmarked={bookmarks.has(opp._id)}
                onBookmark={toggleBookmark}
              />
            ))}
          </div>

          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={handlePageChange}
            loading={loading}
          />
        </>
      )}

      {selectedOpp && (
        <OpportunityDrawer
          opportunity={selectedOpp}
          onClose={() => setSelectedOpp(null)}
          onBidSubmitted={() => {
            setSelectedOpp(null);
            load(page);
          }}
        />
      )}
    </>
  );
};

export default OpportunityList;
