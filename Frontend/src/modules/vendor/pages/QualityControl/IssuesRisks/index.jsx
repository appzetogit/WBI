import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, UserPlus, ArrowUpCircle, Check, Archive } from 'lucide-react';
import { fetchIssues, updateIssue, statusColors } from '../../../services/qualityControlService';
import { useQuality } from '../context/QualityContext';
import FilterBar from '../components/FilterBar';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 10;
const STATUS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' }
];

const IssuesRisks = () => {
  const { search, filters, refreshKey, triggerRefresh } = useQuality();
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({ open: 0, critical: 0, slaBreaches: 0 });
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
      const res = await fetchIssues(params);
      setData(res.data.data || []);
      setStats(res.data.stats || stats);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateIssue(id, { action, owner: action === 'assign' ? 'Ops Owner' : undefined }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  const summary = [
    { label: 'Open Issues', value: stats.open, color: 'text-amber-700 bg-amber-50' },
    { label: 'Critical', value: stats.critical, color: 'text-red-700 bg-red-50' },
    { label: 'SLA Breaches', value: stats.slaBreaches, color: 'text-orange-700 bg-orange-50' }
  ];

  return (
    <div className="space-y-4">
      <FilterBar onApply={triggerRefresh} statusOptions={STATUS} />
      <div className="grid grid-cols-3 gap-3">
        {summary.map((s) => (
          <div key={s.label} className={`rounded-xl p-3 ${s.color}`}>
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-xs font-medium opacity-80">{s.label}</p>
          </div>
        ))}
      </div>
      {loading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No issues" description="Central issue & risk tracking across technical, safety, delay & compliance." />
      ) : (
        <>
          <div className="space-y-3">
            {data.map((it) => {
              const sc = statusColors[it.status] || statusColors.open;
              const pc = statusColors[it.priority] || statusColors.medium;
              return (
                <div key={it._id} className="border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[11px] font-mono text-gray-400">{it.issueCode}</p>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${pc}`}>{it.priority}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-gray-100 rounded-full capitalize">{it.issueType}</span>
                      {it.slaBreached && <span className="text-[10px] px-2 py-0.5 bg-red-50 text-red-700 rounded-full">SLA breach</span>}
                    </div>
                    <h3 className="font-semibold text-gray-900 mt-1 truncate">{it.title}</h3>
                    <p className="text-xs text-gray-500">{it.projectName} · {it.serviceCategoryName} · {it.owner || 'Unassigned'}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>{it.status?.replace(/_/g, ' ')}</span>
                  <div className="flex flex-wrap gap-2">
                    {it.status === 'open' && (
                      <button onClick={() => act(it._id, 'assign')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><UserPlus className="h-3 w-3" /> Assign</button>
                    )}
                    {it.status !== 'escalated' && it.status !== 'resolved' && it.status !== 'closed' && (
                      <button onClick={() => act(it._id, 'escalate')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded-lg"><ArrowUpCircle className="h-3 w-3" /> Escalate</button>
                    )}
                    {it.status !== 'resolved' && it.status !== 'closed' && (
                      <button onClick={() => act(it._id, 'resolve')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg"><Check className="h-3 w-3" /> Resolve</button>
                    )}
                    {it.status === 'resolved' && (
                      <button onClick={() => act(it._id, 'close')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><Archive className="h-3 w-3" /> Close</button>
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

export default IssuesRisks;
