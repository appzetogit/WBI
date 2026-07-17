import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, CheckCircle, XCircle, AlertTriangle, Play } from 'lucide-react';
import { fetchAssignments, updateAssignment, statusColors } from '../../../services/workforceOpsService';
import { useWorkforceOps } from '../context/WorkforceContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 8;

const Assignments = () => {
  const { search, filters, refreshKey } = useWorkforceOps();
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
      if (filters.priority) params.priority = filters.priority;
      const res = await fetchAssignments(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateAssignment(id, { action }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  return (
    <>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assignments" description="Assignments link engineers to projects from Project Operations & Dispatch." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((a) => {
              const sc = statusColors[a.status] || statusColors.assigned;
              return (
                <div key={a._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col">
                  <div className="flex justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{a.assignmentCode}</p>
                      <h3 className="font-bold text-gray-900">{a.projectName}</h3>
                      <p className="text-xs text-gray-500 mt-1">{a.engineerName} · {a.employeeId}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border h-fit ${sc}`}>{a.status?.replace('_', ' ')}</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{a.task}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
                    <span className="capitalize px-2 py-0.5 bg-gray-100 rounded-full">{a.priority}</span>
                    <span>{a.serviceCategoryName}</span>
                    <span>{a.hoursLogged}h logged</span>
                    <span>{a.city}</span>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Progress</span>
                      <span className="font-semibold">{a.progress}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${a.progress}%` }} />
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {a.status === 'assigned' && (
                      <button onClick={() => act(a._id, 'start')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg">
                        <Play className="h-3 w-3" /> Start
                      </button>
                    )}
                    {['assigned', 'in_progress', 'escalated'].includes(a.status) && (
                      <button onClick={() => act(a._id, 'complete')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg">
                        <CheckCircle className="h-3 w-3" /> Complete
                      </button>
                    )}
                    {a.status !== 'rejected' && a.status !== 'completed' && (
                      <>
                        <button onClick={() => act(a._id, 'escalate')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded-lg">
                          <AlertTriangle className="h-3 w-3" /> Escalate
                        </button>
                        <button onClick={() => act(a._id, 'reject')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg">
                          <XCircle className="h-3 w-3" /> Reject
                        </button>
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
    </>
  );
};

export default Assignments;
