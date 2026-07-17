import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Check, X, MessageSquareWarning } from 'lucide-react';
import { fetchB2BApprovals, updateApproval, statusColors } from '../../../services/qualityControlService';
import { useQuality } from '../context/QualityContext';
import FilterBar from '../components/FilterBar';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 8;
const STATUS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'waiting_changes', label: 'Waiting Changes' }
];

const B2BApprovals = () => {
  const { search, filters, refreshKey, triggerRefresh } = useQuality();
  const [data, setData] = useState([]);
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
      const res = await fetchB2BApprovals(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateApproval(id, { action }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="space-y-4">
      <FilterBar onApply={triggerRefresh} statusOptions={STATUS} />
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-56 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={Building2} title="No B2B approvals" description="Multi-level enterprise validation: Engineer → Vendor QA → B2B Manager → Final Closure." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((a) => {
              const sc = statusColors[a.status] || statusColors.pending;
              return (
                <div key={a._id} className="border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col">
                  <div className="flex justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{a.approvalCode}</p>
                      <h3 className="font-bold text-gray-900">{a.projectName}</h3>
                      <p className="text-xs text-gray-500 mt-1">{a.clientName} · {a.serviceCategoryName}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>{a.status?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-gray-600 mb-3">
                    <span>SLA {a.slaCompliance === true ? '✓' : a.slaCompliance === false ? '✗' : '—'}</span>
                    <span>Docs {a.documentationOk ? '✓' : '—'}</span>
                    <span>Site {a.siteCompletion}%</span>
                  </div>
                  <div className="space-y-1.5 mb-3">
                    {(a.approvalLevels || []).map((l, idx) => (
                      <div key={l.level} className="flex items-center gap-2 text-xs">
                        <span className={`h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold ${l.status === 'approved' ? 'bg-emerald-500 text-white' : l.status === 'rejected' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                          {idx + 1}
                        </span>
                        <span className="text-gray-700">{l.level}</span>
                        <span className="text-gray-400">{l.status}{l.by ? ` · ${l.by}` : ''}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {a.status !== 'approved' && (
                      <button onClick={() => act(a._id, 'approve')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg"><Check className="h-3 w-3" /> Approve Level</button>
                    )}
                    {a.status === 'pending' && (
                      <>
                        <button onClick={() => act(a._id, 'request_changes')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-orange-200 text-orange-700 rounded-lg"><MessageSquareWarning className="h-3 w-3" /> Changes</button>
                        <button onClick={() => act(a._id, 'reject')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded-lg"><X className="h-3 w-3" /> Reject</button>
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

export default B2BApprovals;
