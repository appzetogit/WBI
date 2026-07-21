import React, { useState, useEffect, useCallback } from 'react';
import { ListChecks, CheckCircle2, ShieldCheck } from 'lucide-react';
import { fetchMilestones, updateMilestone, approveMilestoneQa, statusColors } from '../../../services/projectOpsService';
import { useProjectOps } from '../context/ProjectOpsContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 10;

const MilestonesTasks = () => {
  const { refreshKey } = useProjectOps();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE };
      if (status) params.status = status;
      const res = await fetchMilestones(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [page, status]);

  useEffect(() => { setPage(1); }, [status, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const completeTask = async (msId, taskId) => {
    try { await updateMilestone(msId, { taskId, taskStatus: 'done' }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  const runQaApprove = async (msId) => {
    try {
      const res = await approveMilestoneQa(msId);
      const pending = res.data?.pending;
      if (pending) {
        alert(res.data?.data?.message || 'QA recorded — waiting for client sign-off before escrow release.');
      }
      load();
    } catch (e) {
      alert(e.response?.data?.message || 'QA approval failed');
    }
  };

  const signoffBadge = (label, value) => {
    const map = {
      not_required: 'bg-gray-100 text-gray-500',
      pending: 'bg-amber-50 text-amber-700',
      approved: 'bg-emerald-50 text-emerald-700',
      rejected: 'bg-red-50 text-red-700',
      passed: 'bg-emerald-50 text-emerald-700',
      failed: 'bg-red-50 text-red-700'
    };
    const cls = map[value] || map.pending;
    return (
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${cls}`}>
        {label}: {(value || '—').replace('_', ' ')}
      </span>
    );
  };

  return (
    <>
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {['', 'pending', 'in_progress', 'completed', 'overdue'].map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg ${status === s ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={ListChecks} title="No milestones" description="Service templates generate milestones automatically per project." />
      ) : (
        <>
          <div className="space-y-4">
            {data.map((ms) => {
              const sc = statusColors[ms.status] || statusColors.pending;
              return (
                <div key={ms._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{ms.milestoneCode} · Seq {ms.sequence}</p>
                      <h3 className="font-bold text-gray-900">{ms.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{ms.projectId?.projectCode} — {ms.projectId?.title}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border h-fit ${sc}`}>{ms.status.replace('_', ' ')}</span>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {signoffBadge('QA', ms.qaStatus)}
                    {ms.customerSignoff !== 'not_required' && signoffBadge('Customer', ms.customerSignoff)}
                    {ms.b2bSignoff !== 'not_required' && signoffBadge('B2B', ms.b2bSignoff)}
                  </div>
                  {(ms.qaStatus === 'pending' || ms.qaStatus === 'in_review') &&
                    (ms.status === 'completed' || ms.progress >= 100) && (
                    <button
                      type="button"
                      onClick={() => runQaApprove(ms._id)}
                      className="mb-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" /> Pass QA & request release
                    </button>
                  )}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Progress</span><span>{ms.progress}%</span></div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-600 rounded-full" style={{ width: `${ms.progress}%` }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(ms.tasks || []).map((t) => (
                      <div key={t._id} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                          <p className="text-[11px] text-gray-500">{t.assignedEngineer || 'Unassigned'} · {t.priority}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColors[t.status] || ''}`}>{t.status}</span>
                          {t.status !== 'done' && (
                            <button onClick={() => completeTask(ms._id, t._id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Complete">
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
        </>
      )}
    </>
  );
};

export default MilestonesTasks;
