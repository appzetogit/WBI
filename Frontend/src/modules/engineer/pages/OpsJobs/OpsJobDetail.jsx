import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, IndianRupee, CheckCircle2, Play, Flag } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../services/api';
import LogoLoader from '../../../../components/common/LogoLoader';

const OpsJobDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/engineers/ops-jobs/${id}`);
      setJob(res.data?.data || null);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load job');
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action) => {
    setActing(true);
    try {
      const res = await api.post(
        `/engineers/ops-jobs/${id}/${action}`,
        action === 'reject' ? { reason: 'Unavailable' } : {}
      );
      if (res.data?.message) toast.success(res.data.message);
      await load();
      if (action === 'complete') {
        window.dispatchEvent(new Event('workerJobsUpdated'));
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Action failed');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LogoLoader />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-4 text-center text-gray-500">
        Job not found.
        <button type="button" className="block mx-auto mt-4 text-blue-600" onClick={() => navigate('/engineer/ops-jobs')}>
          Back to vendor jobs
        </button>
      </div>
    );
  }

  const payment = job.payment || {};
  const project = job.projectId && typeof job.projectId === 'object' ? job.projectId : null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-28">
      <button type="button" onClick={() => navigate('/engineer/ops-jobs')} className="flex items-center gap-2 text-sm text-gray-600 mb-4">
        <ArrowLeft className="h-4 w-4" /> Vendor jobs
      </button>

      <div className="bg-white rounded-2xl border p-5 shadow-sm space-y-4">
        <div>
          <p className="text-xs font-mono text-gray-400">{job.jobCode}</p>
          <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
          <p className="text-sm text-gray-500 capitalize">{String(job.status).replace(/_/g, ' ')}</p>
        </div>

        <div className="text-sm space-y-2 text-gray-700">
          <p><strong>Client:</strong> {job.clientName || '—'}</p>
          {job.clientPhone && <p><strong>Phone:</strong> {job.clientPhone}</p>}
          {(job.address || job.city) && (
            <p className="flex items-start gap-1">
              <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
              {job.address || job.city}
            </p>
          )}
          {project && (
            <p>
              <strong>Project:</strong> {project.projectCode} — {project.title} ({project.progress || 0}%)
            </p>
          )}
        </div>

        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
          <p className="text-xs font-semibold text-emerald-800 uppercase mb-2">Payment</p>
          <p className="flex items-center gap-1 text-lg font-bold text-emerald-900">
            <IndianRupee className="h-5 w-5" />
            {payment.payoutStatus === 'credited'
              ? (payment.engineerPayout || 0).toLocaleString('en-IN')
              : (payment.estimatedPayout || 0).toLocaleString('en-IN')}
            <span className="text-xs font-normal text-emerald-700 ml-1">
              {payment.payoutStatus === 'credited' ? 'credited' : `est. (${payment.payoutPercent || 70}% of job value)`}
            </span>
          </p>
          <p className="text-xs text-emerald-800 mt-1">Job value: ₹{(payment.jobBudget || 0).toLocaleString('en-IN')}</p>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Progress</p>
          <ul className="space-y-2">
            {(job.progressSteps || []).map((step) => (
              <li
                key={step.key}
                className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
                  step.current ? 'bg-blue-50 text-blue-800 font-medium' : step.done ? 'text-gray-600' : 'text-gray-400'
                }`}
              >
                <CheckCircle2 className={`h-4 w-4 ${step.done ? 'text-emerald-500' : 'text-gray-300'}`} />
                {step.label}
              </li>
            ))}
          </ul>
        </div>

        {job.status === 'pending_acceptance' && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={acting}
              onClick={() => act('accept')}
              className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl"
            >
              Accept
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => act('reject')}
              className="flex-1 py-3 border border-red-200 text-red-700 rounded-xl"
            >
              Reject
            </button>
          </div>
        )}
        {job.status === 'accepted' && (
          <button
            type="button"
            disabled={acting}
            onClick={() => act('start')}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-xl"
          >
            <Play className="h-4 w-4" /> Start job
          </button>
        )}
        {job.status === 'in_progress' && (
          <button
            type="button"
            disabled={acting}
            onClick={() => act('complete')}
            className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white font-semibold rounded-xl"
          >
            <Flag className="h-4 w-4" /> Complete & get paid
          </button>
        )}
        {job.status === 'completed' && (
          <button
            type="button"
            onClick={() => navigate('/engineer/wallet')}
            className="w-full py-3 border border-emerald-200 text-emerald-800 font-semibold rounded-xl"
          >
            View wallet
          </button>
        )}
      </div>
    </div>
  );
};

export default OpsJobDetail;
