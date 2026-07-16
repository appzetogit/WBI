import React, { useState, useEffect, useCallback } from 'react';
import { UserCircle, RefreshCw } from 'lucide-react';
import { fetchOpportunities, fetchOpportunityById } from '../../../services/businessIntakeService';
import OpportunityCard from '../components/OpportunityCard';
import OpportunityDrawer from '../components/OpportunityDrawer';
import { SkeletonGrid } from '../components/SkeletonCard';
import EmptyState from '../components/EmptyState';
import KYCBanner from '../components/KYCBanner';

const ClientRequests = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOpp, setSelectedOpp] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const res = await fetchOpportunities({ type: 'client_request', status: 'open', page: reset ? 1 : page, limit: 18 });
      const { data: items, pagination } = res.data;
      setData(prev => reset ? items : [...prev, ...items]);
      setHasMore(pagination.page < pagination.pages);
      if (reset) setPage(1);
    } catch (e) {
      setError('Failed to load client requests');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(true); }, []);

  const handleView = async (id, opp) => {
    setSelectedOpp(opp);
    try {
      const res = await fetchOpportunityById(id);
      setSelectedOpp(res.data.data);
    } catch {}
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <KYCBanner />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserCircle className="h-6 w-6 text-blue-600" /> Client Requests
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Individual client service requests — direct homeowners and businesses</p>
        </div>
        <button onClick={() => load(true)} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}

      {loading && data.length === 0 ? (
        <SkeletonGrid count={6} />
      ) : data.length === 0 ? (
        <EmptyState icon={UserCircle} title="No client requests available" description="New client requests matching your service categories will appear here." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map(opp => (
              <OpportunityCard key={opp._id} opportunity={opp} onView={handleView} onBid={handleView} />
            ))}
          </div>
          {hasMore && (
            <div className="text-center mt-8">
              <button onClick={() => { setPage(p => p + 1); load(false); }} disabled={loading}
                className="px-6 py-2.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-xl hover:bg-blue-50 disabled:opacity-50">
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}

      {selectedOpp && (
        <OpportunityDrawer opportunity={selectedOpp} onClose={() => setSelectedOpp(null)}
          onBidSubmitted={() => { setSelectedOpp(null); load(true); }} />
      )}
    </div>
  );
};

export default ClientRequests;
