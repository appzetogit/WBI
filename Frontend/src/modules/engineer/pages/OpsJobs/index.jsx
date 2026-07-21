import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, IndianRupee, CheckCircle2, XCircle, Play, Flag, ChevronRight } from 'lucide-react';
import api from '../../../../services/api';

/**
 * Engineer Ops Jobs — requests assigned by vendor after Business Intake accept.
 */
const OpsJobs = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [acting, setActing] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filter === 'pending') params.status = 'pending';
      else if (filter === 'active') params.status = 'active';
      const res = await api.get('/engineers/ops-jobs', { params });
      setJobs(res.data?.data || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Live assign push
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('ops:job_assigned', handler);
    return () => window.removeEventListener('ops:job_assigned', handler);
  }, [load]);

  const act = async (id, action) => {
    setActing(id);
    try {
      await api.post(`/engineers/ops-jobs/${id}/${action}`, action === 'reject' ? { reason: 'Unavailable' } : {});
      await load();
    } catch (e) {
      alert(e.response?.data?.message || 'Action failed');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Vendor Jobs</h1>
      <p className="text-sm text-gray-500 mb-4">Jobs assigned to you after vendor accepts a client request</p>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          { key: 'pending', label: 'New Requests' },
          { key: 'active', label: 'Active' },
          { key: 'all', label: 'All' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap ${
              filter === f.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-32 bg-white rounded-xl animate-pulse" />)}</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">
          No jobs here yet. Jab vendor aapko assign karega, request yahan aayegi.
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job._id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/engineer/ops-jobs/${job._id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/engineer/ops-jobs/${job._id}`)}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm cursor-pointer hover:border-blue-200"
            >              <div className="flex justify-between gap-2 mb-2">
                <div>
                  <p className="text-[11px] font-mono text-gray-400">{job.jobCode}</p>
                  <h3 className="font-bold text-gray-900">{job.title}</h3>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-blue-50 text-blue-700 h-fit">
                  {String(job.status).replace(/_/g, ' ')}
                </span>
              </div>
              <div className="text-sm text-gray-600 space-y-1 mb-3">
                <p>{job.clientName || 'Client'}</p>
                {(job.city || job.address) && (
                  <p className="flex items-center gap-1 text-xs">
                    <MapPin className="h-3.5 w-3.5" /> {job.address || job.city}
                  </p>
                )}
                {job.budget > 0 && (
                  <p className="flex items-center gap-1 text-xs font-semibold text-blue-700">
                    <IndianRupee className="h-3.5 w-3.5" /> {job.budget.toLocaleString('en-IN')}
                  </p>
                )}
              </div>

              {job.status === 'pending_acceptance' && (
                <div className="flex gap-2">
                  <button
                    disabled={acting === job._id}
                    onClick={(e) => { e.stopPropagation(); act(job._id, 'accept'); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Accept
                  </button>
                  <button
                    disabled={acting === job._id}
                    onClick={(e) => { e.stopPropagation(); act(job._id, 'reject'); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-red-700 border border-red-200 rounded-xl"
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                </div>
              )}
              {job.status === 'accepted' && (
                <button
                  disabled={acting === job._id}
                  onClick={(e) => { e.stopPropagation(); act(job._id, 'start'); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl"
                >
                  <Play className="h-4 w-4" /> Start Job
                </button>
              )}
              {job.status === 'in_progress' && (
                <button
                  disabled={acting === job._id}
                  onClick={(e) => { e.stopPropagation(); act(job._id, 'complete'); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-xl"
                >
                  <Flag className="h-4 w-4" /> Mark Complete
                </button>
              )}
              <p className="text-xs text-blue-600 font-medium flex items-center justify-end gap-1 pt-2">
                View progress & payment <ChevronRight className="h-3.5 w-3.5" />
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OpsJobs;
