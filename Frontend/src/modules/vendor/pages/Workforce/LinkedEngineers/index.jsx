import React, { useCallback, useEffect, useState } from 'react';
import { Users, Star } from 'lucide-react';
import { fetchLinkedEngineers } from '../../../services/companyCodeService';
import EmptyState from '../../BusinessIntake/components/EmptyState';

const LinkedEngineers = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLinkedEngineers();
      setData(res.data?.data || []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />;
  }

  if (!data.length) {
    return (
      <EmptyState
        icon={Users}
        title="No linked engineers yet"
        description="Approved company engineers will show up here."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {data.map((eng) => (
        <div key={eng._id} className="border border-gray-200 rounded-xl p-4 bg-white">
          <div className="flex justify-between gap-2">
            <div>
              <h3 className="font-bold text-gray-900">{eng.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{eng.phone || eng.email || '—'}</p>
            </div>
            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 h-fit">
              {eng.status || 'active'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-3">
            {eng.linkedViaCode && <span className="font-mono">{eng.linkedViaCode}</span>}
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 text-amber-500" />
              {eng.overallRating?.toFixed?.(1) || eng.overallRating || '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LinkedEngineers;
