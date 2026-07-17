import React, { useState, useEffect, useCallback } from 'react';
import { CalendarOff, Check, X } from 'lucide-react';
import { fetchLeaves, updateLeave, statusColors } from '../../../services/workforceOpsService';
import { useWorkforceOps } from '../context/WorkforceContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 12;

const LeaveCalendar = () => {
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
      if (filters.status) params.status = filters.status;
      const res = await fetchLeaves(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateLeave(id, { action }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  if (loading) return <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />;
  if (!data.length) {
    return <EmptyState icon={CalendarOff} title="No leave requests" description="Leave requests flow through manager → admin approval for resource planning." />;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((l) => {
          const sc = statusColors[l.status] || statusColors.pending;
          return (
            <div key={l._id} className="border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-bold text-gray-900">{l.engineerName}</h3>
                  <p className="text-xs text-gray-500">{l.employeeId}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>
                  {l.status?.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm capitalize text-gray-700 mb-1">{l.leaveType} leave · {l.days} day(s)</p>
              <p className="text-xs text-gray-500 mb-2">
                {new Date(l.startDate).toLocaleDateString('en-IN')} → {new Date(l.endDate).toLocaleDateString('en-IN')}
              </p>
              <p className="text-sm text-gray-600 mb-3">{l.reason}</p>
              {l.status === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => act(l._id, 'approve')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg">
                    <Check className="h-3 w-3" /> Approve
                  </button>
                  <button onClick={() => act(l._id, 'reject')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded-lg">
                    <X className="h-3 w-3" /> Reject
                  </button>
                </div>
              )}
              {l.status === 'manager_approved' && (
                <button onClick={() => act(l._id, 'approve')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg">
                  Admin Approve
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
    </>
  );
};

export default LeaveCalendar;
