import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, RefreshCw, Briefcase, TrendingUp, CheckCircle, XCircle } from 'lucide-react';
import { fetchOpportunities, fetchOpportunityById, typeLabels } from '../../services/businessIntakeService';
import OpportunityCard from './components/OpportunityCard';
import OpportunityDrawer from './components/OpportunityDrawer';
import { SkeletonGrid } from './components/SkeletonCard';
import EmptyState from './components/EmptyState';
import KYCBanner from './components/KYCBanner';
import { useVendorConfig } from '../../context/VendorConfigContext';

const STATUSES = ['open', 'awarded', 'closed'];
const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Latest First' },
  { value: 'deadline', label: 'Deadline Soon' },
  { value: 'budget.max', label: 'Highest Budget' }
];

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className={`bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm`}>
    <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${color}`}>
      <Icon className="h-6 w-6 text-white" />
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  </div>
);

const AllOpportunities = () => {
  const { vendorProfile } = useVendorConfig() || {};
  const kycPending = vendorProfile?.complianceStatus !== 'verified' && !vendorProfile?.kycVerified;

  const [data, setData] = useState([]);
  const [typeCounts, setTypeCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ type: '', status: 'open', sort: 'createdAt' });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    setError('');
    try {
      const params = { ...filters, page: reset ? 1 : page, limit: 18 };
      if (search) params.search = search;
      const res = await fetchOpportunities(params);
      const { data: items, typeCounts: tc, pagination } = res.data;
      setData(prev => reset ? items : [...prev, ...items]);
      setTypeCounts(tc || {});
      setHasMore(pagination.page < pagination.pages);
      if (reset) setPage(1);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load opportunities');
    } finally {
      setLoading(false);
    }
  }, [filters, page, search]);

  useEffect(() => { load(true); }, [filters]);

  const handleSearch = (e) => {
    e.preventDefault();
    load(true);
  };

  const handleViewDetail = async (id, opp) => {
    setSelectedOpp(opp); // Show immediately with partial data
    setDrawerLoading(true);
    try {
      const res = await fetchOpportunityById(id);
      setSelectedOpp(res.data.data);
    } catch (e) {
      // keep partial data
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleBidClick = (id, opp) => {
    setSelectedOpp(opp);
  };

  const handleLoadMore = () => {
    setPage(p => p + 1);
    load(false);
  };

  const totalOpen = Object.values(typeCounts).reduce((s, v) => s + v, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <KYCBanner show={kycPending} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Opportunities</h1>
          <p className="text-sm text-gray-500 mt-0.5">Browse all open business opportunities for your services</p>
        </div>
        <button onClick={() => load(true)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Briefcase} label="Open Opportunities" value={totalOpen} color="bg-blue-500" />
        <StatCard icon={TrendingUp} label="B2B Opportunities" value={typeCounts['b2b_opportunity'] || 0} color="bg-purple-500" />
        <StatCard icon={CheckCircle} label="Direct Invitations" value={typeCounts['direct_invitation'] || 0} color="bg-amber-500" />
        <StatCard icon={XCircle} label="Bulk Requirements" value={typeCounts['bulk_requirement'] || 0} color="bg-orange-500" />
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search title, category, city..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button type="submit" className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              Search
            </button>
          </form>

          <select
            value={filters.type}
            onChange={e => setFilters(p => ({ ...p, type: e.target.value }))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="">All Types</option>
            {Object.entries(typeLabels).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>

          <select
            value={filters.sort}
            onChange={e => setFilters(p => ({ ...p, sort: e.target.value }))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading && data.length === 0 ? (
        <SkeletonGrid count={9} />
      ) : data.length === 0 ? (
        <EmptyState
          title="No opportunities found"
          description="Try adjusting your filters or check back later for new opportunities."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map(opp => (
              <OpportunityCard
                key={opp._id}
                opportunity={opp}
                onView={handleViewDetail}
                onBid={handleBidClick}
              />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="text-center mt-8">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="px-6 py-2.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Drawer */}
      {selectedOpp && (
        <OpportunityDrawer
          opportunity={selectedOpp}
          onClose={() => setSelectedOpp(null)}
          onBidSubmitted={() => { setSelectedOpp(null); load(true); }}
        />
      )}
    </div>
  );
};

export default AllOpportunities;
