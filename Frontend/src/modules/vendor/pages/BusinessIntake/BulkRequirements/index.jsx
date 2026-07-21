import React, { useState, useEffect, useCallback } from 'react';
import { Layers, AlertTriangle } from 'lucide-react';
import { fetchOpportunities, fetchOpportunityById, formatBudget } from '../../../services/businessIntakeService';
import OpportunityDrawer from '../components/OpportunityDrawer';
import { SkeletonGrid } from '../components/SkeletonCard';
import EmptyState from '../components/EmptyState';
import { useVendorConfig } from '../../../context/VendorConfigContext';
import { useBusinessIntake } from '../context/BusinessIntakeContext';
import { deadlineCountdown, typeLabels } from '../../../services/businessIntakeService';
import { Clock, MapPin } from 'lucide-react';

const CapacityWidget = ({ totalSites, vendorCapacity = 200 }) => {
  const monthsNeeded = Math.ceil(totalSites / vendorCapacity);
  const isOverCapacity = totalSites > vendorCapacity * 3;

  return (
    <div className={`mt-3 p-3 rounded-lg border text-xs ${isOverCapacity ? 'border-red-200 bg-red-50' : 'border-orange-200 bg-orange-50'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {isOverCapacity && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
        <span className="font-semibold text-gray-700">Capacity Check</span>
      </div>
      <p className="text-gray-600">
        Your capacity: <strong>{vendorCapacity.toLocaleString()}/month</strong> &nbsp;|&nbsp;
        This needs: <strong>{totalSites.toLocaleString()} sites</strong> → ~<strong>{monthsNeeded} months</strong>
      </p>
      {isOverCapacity && (
        <p className="text-red-600 font-medium mt-1">⚠️ Exceeds your capacity significantly. Consider partnering.</p>
      )}
    </div>
  );
};

const BulkCard = ({ opp, onView, vendorCapacity }) => {
  const countdown = deadlineCountdown(opp.deadline);
  const typeInfo = typeLabels[opp.type] || {};

  return (
    <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-orange-400 shadow-sm hover:shadow-md transition-all p-5">
      {/* Type + priority */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeInfo.color || 'bg-orange-100 text-orange-700'}`}>
          {typeInfo.label || 'Bulk Requirement'}
        </span>
        {countdown && (
          <span className={`text-xs font-semibold flex items-center gap-1 ${countdown.urgent ? 'text-red-600' : 'text-gray-500'}`}>
            <Clock className="h-3 w-3" /> {countdown.text}
          </span>
        )}
      </div>

      {/* BIG sites number */}
      <div className="flex items-end gap-3 mb-3">
        <span className="text-5xl font-black text-orange-500 leading-none">
          {(opp.requirements?.totalSites || 1).toLocaleString()}
        </span>
        <span className="text-gray-500 text-sm pb-1">sites required</span>
      </div>

      <h3 className="text-base font-semibold text-gray-900 mb-1 line-clamp-2">{opp.title}</h3>
      <p className="text-xs text-gray-500 mb-2">{opp.categoryName}</p>

      <div className="flex flex-wrap gap-2 text-xs text-gray-600 mb-3">
        {opp.clientInfo?.company && <span><strong>{opp.clientInfo.company}</strong></span>}
        {opp.requirements?.cities?.length > 0 && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {opp.requirements.cities.slice(0, 3).join(', ')}{opp.requirements.cities.length > 3 && ` +${opp.requirements.cities.length - 3} more`}
          </span>
        )}
        <span className="font-semibold text-blue-700">{formatBudget(opp.budget)}</span>
      </div>

      {/* Capacity check widget */}
      <CapacityWidget totalSites={opp.requirements?.totalSites || 1} vendorCapacity={vendorCapacity} />

      <button
        onClick={() => onView(opp._id, opp)}
        className="mt-4 w-full py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-xl hover:bg-orange-600 transition-colors"
      >
        View Full Details & Bid
      </button>
    </div>
  );
};

const BulkRequirements = () => {
  const { vendorProfile } = useVendorConfig() || {};
  const vendorCapacity = vendorProfile?.maxCapacity || 200;
  const { search, filters, refreshKey } = useBusinessIntake();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpp, setSelectedOpp] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        type: 'bulk_requirement',
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
    } catch {
      console.error('Failed to load bulk requirements');
    } finally {
      setLoading(false);
    }
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
        <EmptyState icon={Layers} title="No bulk requirements" description="Large-scale multi-site projects will appear here." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {data.map(opp => (
            <BulkCard key={opp._id} opp={opp} onView={handleView} vendorCapacity={vendorCapacity} />
          ))}
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

export default BulkRequirements;
