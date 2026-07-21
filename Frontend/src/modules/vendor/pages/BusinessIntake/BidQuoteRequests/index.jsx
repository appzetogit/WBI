import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Clock, MapPin, TrendingUp } from 'lucide-react';
import { fetchOpportunities, fetchOpportunityById, formatBudget, deadlineCountdown } from '../../../services/businessIntakeService';
import OpportunityDrawer from '../components/OpportunityDrawer';
import { SkeletonGrid } from '../components/SkeletonCard';
import EmptyState from '../components/EmptyState';
import { useBusinessIntake } from '../context/BusinessIntakeContext';

const RFQCard = ({ opp, onView }) => {
  const countdown = deadlineCountdown(opp.deadline);

  return (
    <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-all p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">RFQ / Bid Request</span>
        {countdown && (
          <span className={`text-xs font-semibold flex items-center gap-1 ${countdown.urgent ? 'text-red-600' : 'text-gray-500'}`}>
            <Clock className="h-3 w-3" />{countdown.text}
          </span>
        )}
      </div>

      <h3 className="text-base font-semibold text-gray-900 mb-1 line-clamp-2">{opp.title}</h3>
      <p className="text-xs text-gray-500 mb-3">{opp.categoryName}</p>

      <div className="flex flex-wrap gap-2 text-xs text-gray-600 mb-4">
        {opp.clientInfo?.company && <span className="font-medium">{opp.clientInfo.company}</span>}
        {opp.requirements?.cities?.[0] && (
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{opp.requirements.cities[0]}</span>
        )}
        <span className="flex items-center gap-1 font-semibold text-blue-700">
          <TrendingUp className="h-3 w-3" />{formatBudget(opp.budget)}
        </span>
      </div>

      {/* Document downloads */}
      <div className="flex gap-2 mb-4">
        {opp.rfqDocumentUrl ? (
          <a href={opp.rfqDocumentUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition-colors">
            <Download className="h-3.5 w-3.5" /> RFQ Document
          </a>
        ) : (
          <span className="flex items-center gap-1 text-xs text-gray-400 italic">No RFQ doc attached</span>
        )}
        {opp.technicalSpecsUrl && (
          <a href={opp.technicalSpecsUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <FileText className="h-3.5 w-3.5" /> Tech Specs
          </a>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={() => onView(opp._id, opp)}
          className="flex-1 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 transition-colors">
          Open & Submit Bid
        </button>
      </div>
    </div>
  );
};

const BidQuoteRequests = () => {
  const { search, filters, refreshKey } = useBusinessIntake();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpp, setSelectedOpp] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        type: 'bid_quote_request',
        status: filters.status || 'open',
        sort: filters.sort,
        limit: 20,
      };
      if (search) params.search = search;
      if (filters.category) params.category = filters.category;
      if (filters.city) params.city = filters.city;
      if (filters.minBudget) params.minBudget = filters.minBudget;
      if (filters.maxBudget) params.maxBudget = filters.maxBudget;
      if (filters.priority) params.priority = filters.priority;
      const res = await fetchOpportunities(params);
      setData(res.data.data || []);
    } catch {}
    finally { setLoading(false); }
  }, [search, filters]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleView = async (id, opp) => {
    setSelectedOpp(opp);
    try { const res = await fetchOpportunityById(id); setSelectedOpp(res.data.data); } catch {}
  };

  return (
    <>
      {loading ? (
        <SkeletonGrid count={4} />
      ) : data.length === 0 ? (
        <EmptyState icon={FileText} title="No RFQ requests available" description="Formal bid/quote requests from enterprises will appear here." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.map(opp => <RFQCard key={opp._id} opp={opp} onView={handleView} />)}
        </div>
      )}

      {selectedOpp && (
        <OpportunityDrawer opportunity={selectedOpp} onClose={() => setSelectedOpp(null)}
          onBidSubmitted={() => { setSelectedOpp(null); load(); }}
          onAccepted={() => { setSelectedOpp(null); load(); }} />
      )}
    </>
  );
};

export default BidQuoteRequests;
