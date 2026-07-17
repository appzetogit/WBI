import React, { useState, useEffect, useCallback } from 'react';
import { Truck, MapPin, Wrench } from 'lucide-react';
import { fetchDispatches, assignDispatch, statusColors } from '../../../services/projectOpsService';
import { useProjectOps } from '../context/ProjectOpsContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';

const RADII = [5, 10, 20, 50, 100];

const DispatchCenter = () => {
  const { search, refreshKey } = useProjectOps();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [radius, setRadius] = useState('');
  const [availability, setAvailability] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (radius) params.radius = radius;
      if (availability) params.availability = availability;
      const res = await fetchDispatches(params);
      setData(res.data.data || []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, radius, availability]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const assign = async (id, name) => {
    try {
      await assignDispatch(id, { assignedJob: `Manual dispatch — ${name}`, assignmentStatus: 'assigned' });
      load();
    } catch (e) { alert(e.response?.data?.message || 'Assign failed'); }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-xs text-gray-500 font-medium">Radius:</span>
        {RADII.map((r) => (
          <button key={r} onClick={() => setRadius(String(r))}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg ${radius === String(r) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {r}km
          </button>
        ))}
        <button onClick={() => setRadius('')} className={`px-2.5 py-1 text-xs rounded-lg ${!radius ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>All</button>
        <select value={availability} onChange={(e) => setAvailability(e.target.value)} className="ml-auto px-3 py-1.5 text-xs border border-gray-200 rounded-lg">
          <option value="">All availability</option>
          <option value="available">Available</option>
          <option value="on_job">On Job</option>
          <option value="on_leave">On Leave</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2,3,4].map((i) => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={Truck} title="No engineers on board" description="Dispatch pool will show skilled engineers near job sites." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((d) => {
            const sc = statusColors[d.availability] || statusColors.available;
            return (
              <div key={d._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-gray-900">{d.engineerName}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" /> {d.city} · {d.distanceKm} km</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border h-fit ${sc}`}>{d.availability.replace('_', ' ')}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(d.skills || []).map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{s}</span>)}
                </div>
                <div className="text-xs text-gray-500 space-y-1 mb-3">
                  <p>Workload: {d.workload} jobs · Vehicle: {d.vehicle || '—'}</p>
                  <p className="flex items-center gap-1"><Wrench className="h-3 w-3" /> {(d.tools || []).join(', ')}</p>
                  <p>Status: {d.assignmentStatus?.replace('_', ' ')}{d.assignedJob ? ` — ${d.assignedJob}` : ''}</p>
                </div>
                {d.availability === 'available' && (
                  <button onClick={() => assign(d._id, d.engineerName)} className="w-full py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                    Assign Job
                  </button>
                )}
                {d.assignmentStatus === 'recommended' && d.availability === 'available' && (
                  <p className="text-[10px] text-emerald-600 font-medium mt-2 text-center">System recommended — nearest + lowest workload</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default DispatchCenter;
