import React, { useState, useEffect, useCallback } from 'react';
import { GitPullRequest, IndianRupee, Clock, Check, X, PlayCircle, Archive } from 'lucide-react';
import { fetchChangeRequests, updateChangeRequest, formatINR, statusColors } from '../../../services/qualityControlService';
import { useQuality } from '../context/QualityContext';
import FilterBar from '../components/FilterBar';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 8;
const STATUS = [
  { value: 'requested', label: 'Requested' },
  { value: 'under_approval', label: 'Under Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'implementing', label: 'Implementing' },
  { value: 'closed', label: 'Closed' }
];

const ChangeRequests = () => {
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
      const res = await fetchChangeRequests(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateChangeRequest(id, { action }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="space-y-4">
      <FilterBar onApply={triggerRefresh} statusOptions={STATUS} />
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-52 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={GitPullRequest} title="No change requests" description="Track scope, cost & timeline changes from client, B2B, vendor or admin." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((c) => {
              const sc = statusColors[c.status] || statusColors.requested;
              return (
                <div key={c._id} className="border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col">
                  <div className="flex justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{c.changeCode}</p>
                      <h3 className="font-bold text-gray-900">{c.title}</h3>
                      <p className="text-xs text-gray-500 mt-1">{c.projectName} · {c.clientName} · by {c.requestedBy}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>{c.status?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-400 mb-0.5">Previous scope</p>
                      <p className="text-gray-700">{c.previousScope}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="text-blue-400 mb-0.5">Updated scope</p>
                      <p className="text-blue-800">{c.updatedScope}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-3">
                    <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" /> {formatINR(c.costDifference)}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> +{c.timelineDifferenceDays}d</span>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {c.status === 'requested' && (
                      <button onClick={() => act(c._id, 'submit')} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg">Send for Approval</button>
                    )}
                    {c.status === 'under_approval' && (
                      <>
                        <button onClick={() => act(c._id, 'approve')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg"><Check className="h-3 w-3" /> Approve</button>
                        <button onClick={() => act(c._id, 'reject')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded-lg"><X className="h-3 w-3" /> Reject</button>
                      </>
                    )}
                    {c.status === 'approved' && (
                      <button onClick={() => act(c._id, 'implement')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg"><PlayCircle className="h-3 w-3" /> Implement</button>
                    )}
                    {c.status === 'implementing' && (
                      <button onClick={() => act(c._id, 'close')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><Archive className="h-3 w-3" /> Close</button>
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

export default ChangeRequests;
