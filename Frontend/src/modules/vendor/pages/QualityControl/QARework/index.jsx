import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Check, X, Wrench, UserPlus, CalendarClock } from 'lucide-react';
import { fetchReviews, updateReview, statusColors } from '../../../services/qualityControlService';
import { useQuality } from '../context/QualityContext';
import FilterBar from '../components/FilterBar';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 8;
const STATUS = [
  { value: 'pending', label: 'Pending' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' }
];

const QARework = () => {
  const { search, filters, refreshKey, triggerRefresh } = useQuality();
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({ avgScore: 0, passed: 0, failed: 0, reworkPending: 0, reworkDone: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE };
      if (search) params.search = search;
      if (filters.category) params.category = filters.category;
      if (filters.status) params.status = filters.status;
      const res = await fetchReviews(params);
      setData(res.data.data || []);
      setStats(res.data.stats || stats);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateReview(id, { action, engineer: action === 'assign_rework' ? 'Field Engineer' : undefined }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  const summary = [
    { label: 'QA Passed', value: stats.passed, color: 'text-emerald-700 bg-emerald-50' },
    { label: 'QA Failed', value: stats.failed, color: 'text-red-700 bg-red-50' },
    { label: 'Rework Pending', value: stats.reworkPending, color: 'text-amber-700 bg-amber-50' },
    { label: 'Rework Done', value: stats.reworkDone, color: 'text-blue-700 bg-blue-50' },
    { label: 'Avg Quality', value: `${stats.avgScore}%`, color: 'text-violet-700 bg-violet-50' }
  ];

  return (
    <div className="space-y-4">
      <FilterBar onApply={triggerRefresh} statusOptions={STATUS} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {summary.map((s) => (
          <div key={s.label} className={`rounded-xl p-3 ${s.color}`}>
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-xs font-medium opacity-80">{s.label}</p>
          </div>
        ))}
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-52 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No QA reviews" description="Inspection checklists are generated per service (panel alignment, API, cooling test...)." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((q) => {
              const sc = statusColors[q.qaStatus] || statusColors.pending;
              return (
                <div key={q._id} className="border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col">
                  <div className="flex justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{q.reviewCode}</p>
                      <h3 className="font-bold text-gray-900">{q.projectName}</h3>
                      <p className="text-xs text-gray-500 mt-1">{q.clientName} · {q.serviceCategoryName} · {q.engineerName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${sc}`}>{q.qaStatus}</span>
                      <span className="text-sm font-bold text-gray-800">{q.qualityScore}%</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(q.checklist || []).map((c) => (
                      <span key={c.label} className={`text-[10px] px-2 py-0.5 rounded-full ${c.passed === true ? 'bg-emerald-50 text-emerald-700' : c.passed === false ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.label}
                      </span>
                    ))}
                  </div>
                  {q.reworkStatus !== 'none' && (
                    <p className="text-xs text-amber-700 mb-2">Rework: {q.reworkStatus}{q.reworkEngineer ? ` · ${q.reworkEngineer}` : ''}</p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2">
                    {q.qaStatus === 'pending' && (
                      <>
                        <button onClick={() => act(q._id, 'pass')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg"><Check className="h-3 w-3" /> Pass</button>
                        <button onClick={() => act(q._id, 'fail')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded-lg"><X className="h-3 w-3" /> Fail</button>
                      </>
                    )}
                    {q.qaStatus === 'failed' && q.reworkStatus === 'none' && (
                      <button onClick={() => act(q._id, 'create_rework')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-lg"><Wrench className="h-3 w-3" /> Create Rework</button>
                    )}
                    {q.reworkStatus === 'pending' && (
                      <button onClick={() => act(q._id, 'assign_rework')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><UserPlus className="h-3 w-3" /> Assign</button>
                    )}
                    {q.reworkStatus === 'assigned' && (
                      <>
                        <button onClick={() => act(q._id, 'schedule_revisit')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><CalendarClock className="h-3 w-3" /> Revisit</button>
                        <button onClick={() => act(q._id, 'complete_rework')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg">Complete</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
        </>
      )}
    </div>
  );
};

export default QARework;
