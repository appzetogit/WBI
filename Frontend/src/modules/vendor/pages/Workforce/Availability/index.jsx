import React, { useState, useEffect, useCallback } from 'react';
import { Radio, Battery, Wifi, MapPin } from 'lucide-react';
import { fetchAvailability, statusColors } from '../../../services/workforceOpsService';
import { useWorkforceOps } from '../context/WorkforceContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';

const Availability = () => {
  const { search, filters, refreshKey } = useWorkforceOps();
  const [data, setData] = useState({ engineers: [], summary: {} });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filters.category) params.category = filters.category;
      const res = await fetchAvailability(params);
      setData(res.data.data || { engineers: [], summary: {} });
    } catch { setData({ engineers: [], summary: {} }); }
    finally { setLoading(false); }
  }, [search, filters]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />;
  if (!data.engineers?.length) {
    return <EmptyState icon={Radio} title="No availability data" description="Live status appears when engineers are online via the mobile app." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {Object.entries(data.summary || {}).map(([k, v]) => (
          <span key={k} className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${statusColors[k] || 'bg-gray-50'}`}>
            {k.replace('_', ' ')}: {v}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.engineers.map((e) => {
          const sc = statusColors[e.availability] || statusColors.offline;
          return (
            <div key={e._id} className="border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-gray-900">{e.name}</h3>
                  <p className="text-xs text-gray-500">{e.role} · {e.employeeId}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${sc}`}>
                  {e.availability?.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                <MapPin className="h-3 w-3" /> {e.currentLocation || e.city || '—'}
              </p>
              <p className="text-xs text-gray-600 mb-3">{e.todayTask || 'Idle'}</p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Battery className="h-3 w-3" />{e.gps?.battery ?? '—'}%</span>
                <span className="flex items-center gap-1"><Wifi className="h-3 w-3" />{e.gps?.internet || '—'}</span>
                <span>Util {e.utilization}%</span>
              </div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${e.capacity || 0}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Availability;
