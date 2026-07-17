import React, { useState, useEffect, useCallback } from 'react';
import { Radio, AlertTriangle, MapPin, Users } from 'lucide-react';
import { fetchLiveOps, formatINR, statusColors } from '../../../services/projectOpsService';
import { useProjectOps } from '../context/ProjectOpsContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';

const LiveOperations = () => {
  const { refreshKey } = useProjectOps();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLiveOps();
      setData(res.data.data);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[1,2,3,4,5].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  }
  if (!data) return <EmptyState icon={Radio} title="Live ops unavailable" description="Realtime board will load when projects are active." />;

  const s = data.summary || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Live Projects', value: s.liveProjects, color: 'text-blue-700' },
          { label: 'Live Engineers', value: s.liveEngineers, color: 'text-emerald-700' },
          { label: "Today's Jobs", value: s.todaysJobs, color: 'text-violet-700' },
          { label: 'At Risk', value: s.delayedJobs, color: 'text-amber-700' },
          { label: 'SLA Breaches', value: s.slaBreaches, color: 'text-red-700' }
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-gray-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><Radio className="h-4 w-4 text-red-500" /> Live Projects</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(data.liveProjects || []).length === 0 ? <p className="text-sm text-gray-400">None running</p> : data.liveProjects.map((p) => (
              <div key={p._id} className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg text-sm">
                <div>
                  <p className="font-medium text-gray-900">{p.title}</p>
                  <p className="text-xs text-gray-500">{p.projectCode} · {p.progress}%</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors[p.status]}`}>{p.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-blue-500" /> Live Engineers</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(data.liveEngineers || []).length === 0 ? <p className="text-sm text-gray-400">None on site</p> : data.liveEngineers.map((e) => (
              <div key={e._id} className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg text-sm">
                <div>
                  <p className="font-medium text-gray-900">{e.engineerName}</p>
                  <p className="text-xs text-gray-500">{e.city} · {e.assignmentStatus?.replace('_', ' ')}</p>
                </div>
                <span className="text-[10px] text-emerald-600 font-semibold">● Live</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-500" /> Today Check-ins</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(data.todaysSites || []).length === 0 ? <p className="text-sm text-gray-400">No check-ins yet</p> : data.todaysSites.map((s) => (
              <div key={s._id} className="px-3 py-2 bg-gray-50 rounded-lg text-sm">
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-gray-500">{s.siteCode} · OTP {s.otpVerified ? 'OK' : '—'}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Due Today</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(data.milestonesToday || []).length === 0 ? <p className="text-sm text-gray-400">No milestones due</p> : data.milestonesToday.map((m) => (
              <div key={m._id} className="px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-sm">
                <p className="font-medium text-gray-900">{m.title}</p>
                <p className="text-xs text-gray-500">{m.projectId?.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 text-center">Auto-refreshes every 30s · Socket-ready</p>
    </div>
  );
};

export default LiveOperations;
