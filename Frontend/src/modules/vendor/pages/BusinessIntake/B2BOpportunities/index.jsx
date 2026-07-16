import React, { useState, useEffect, useCallback } from 'react';
import { Building2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchOpportunities, fetchOpportunityById } from '../../services/businessIntakeService';
import OpportunityCard from './components/OpportunityCard';
import OpportunityDrawer from './components/OpportunityDrawer';
import { SkeletonGrid } from './components/SkeletonCard';
import EmptyState from './components/EmptyState';
import KYCBanner from './components/KYCBanner';

const B2BOpportunities = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOpp, setSelectedOpp] = useState(null);
  const [expandedProfiles, setExpandedProfiles] = useState({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const res = await fetchOpportunities({ type: 'b2b_opportunity', status: 'open', page: reset ? 1 : page, limit: 18 });
      const { data: items, pagination } = res.data;
      setData(prev => reset ? items : [...prev, ...items]);
      setHasMore(pagination.page < pagination.pages);
      if (reset) setPage(1);
    } catch {
      setError('Failed to load B2B opportunities');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(true); }, []);

  const handleView = async (id, opp) => {
    setSelectedOpp(opp);
    try { const res = await fetchOpportunityById(id); setSelectedOpp(res.data.data); } catch {}
  };

  const toggleProfile = (id) => setExpandedProfiles(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <KYCBanner />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-purple-600" /> B2B Opportunities
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Enterprise & corporate business opportunities from companies</p>
        </div>
        <button onClick={() => load(true)} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}

      {loading && data.length === 0 ? (
        <SkeletonGrid count={6} />
      ) : data.length === 0 ? (
        <EmptyState icon={Building2} title="No B2B opportunities" description="Enterprise opportunities matching your services will appear here." />
      ) : (
        <div className="space-y-4">
          {data.map(opp => (
            <div key={opp._id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4">
                <OpportunityCard opportunity={opp} onView={handleView} onBid={handleView} />
              </div>

              {/* Expandable company profile */}
              {opp.clientInfo?.company && (
                <div className="border-t border-gray-100">
                  <button
                    onClick={() => toggleProfile(opp._id)}
                    className="w-full flex items-center justify-between px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <span>Company Profile: {opp.clientInfo.company}</span>
                    {expandedProfiles[opp._id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {expandedProfiles[opp._id] && (
                    <div className="px-5 pb-4 bg-purple-50/40 grid grid-cols-2 gap-3 text-sm">
                      {opp.clientInfo.companySize && <div><span className="text-gray-500">Size:</span> <span className="font-medium">{opp.clientInfo.companySize}</span></div>}
                      {opp.clientInfo.industry && <div><span className="text-gray-500">Industry:</span> <span className="font-medium">{opp.clientInfo.industry}</span></div>}
                      {opp.clientInfo.gstNumber && <div><span className="text-gray-500">GST:</span> <span className="font-mono font-medium">{opp.clientInfo.gstNumber}</span></div>}
                      {opp.clientInfo.city && <div><span className="text-gray-500">HQ:</span> <span className="font-medium">{opp.clientInfo.city}, {opp.clientInfo.state}</span></div>}
                      {opp.requirements?.contractDuration && <div><span className="text-gray-500">Contract:</span> <span className="font-medium">{opp.requirements.contractDuration}</span></div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {hasMore && (
            <div className="text-center mt-4">
              <button onClick={() => { setPage(p => p + 1); load(false); }} disabled={loading}
                className="px-6 py-2.5 text-sm font-medium text-purple-700 border border-purple-300 rounded-xl hover:bg-purple-50 disabled:opacity-50">
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}

      {selectedOpp && (
        <OpportunityDrawer opportunity={selectedOpp} onClose={() => setSelectedOpp(null)}
          onBidSubmitted={() => { setSelectedOpp(null); load(true); }} />
      )}
    </div>
  );
};

export default B2BOpportunities;
