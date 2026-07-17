import React, { useState, useEffect, useCallback } from 'react';
import { GitBranch, Check, X, IndianRupee, Calendar } from 'lucide-react';
import {
  fetchScopeChanges, updateScopeChange, formatINR, statusColors, timeAgo
} from '../../../services/clientsContractsService';
import { useClientsContracts } from '../context/ClientsContractsContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE_SIZE = 8;

const ScopeChanges = () => {
  const { refreshKey } = useClientsContracts();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      const res = await fetchScopeChanges(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { setPage(1); }, [statusFilter, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const handleDecide = async (id, status) => {
    try {
      await updateScopeChange(id, { status, approvedBy: status === 'approved' ? 'Vendor' : null });
      load();
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to update');
    }
  };

  return (
    <>
      <div className="flex gap-1 mb-4">
        {['', 'pending', 'approved', 'rejected'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
              statusFilter === s ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-36 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={GitBranch} title="No scope changes" description="Project scope change requests will appear here with full audit trail." />
      ) : (
        <>
          <div className="space-y-4">
            {data.map((item) => {
              const sc = statusColors[item.status] || statusColors.pending;
              return (
                <div key={item._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{item.changeCode}</p>
                      <h3 className="font-bold text-gray-900 mt-0.5">{item.title}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {item.clientId?.company || item.clientId?.name} · {item.contractId?.contractCode || 'No contract'}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border ${sc}`}>{item.status}</span>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 mb-3">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Previous Scope</p>
                      <p className="text-sm text-gray-700">{item.previousScope}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Updated Scope</p>
                      <p className="text-sm text-gray-800">{item.updatedScope}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-gray-600 mb-3">
                    <span className="flex items-center gap-1 font-semibold text-blue-700">
                      <IndianRupee className="h-3.5 w-3.5" /> Cost delta: {formatINR(item.costDelta)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> Timeline: {item.timelineDeltaDays >= 0 ? '+' : ''}{item.timelineDeltaDays} days
                    </span>
                    <span>Requested by: {item.requestedBy}</span>
                    <span>{timeAgo(item.createdAt)}</span>
                  </div>

                  {item.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDecide(item._id, 'approved')}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => handleDecide(item._id, 'rejected')}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
                  )}
                  {item.approvedBy && (
                    <p className="text-xs text-gray-500 mt-2">Decided by {item.approvedBy}</p>
                  )}
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

export default ScopeChanges;
