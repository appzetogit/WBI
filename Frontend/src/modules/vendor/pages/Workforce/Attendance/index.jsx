import React, { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { fetchAttendance, statusColors } from '../../../services/workforceOpsService';
import { useWorkforceOps } from '../context/WorkforceContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 15;

const fmt = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
};

const Attendance = () => {
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
      const res = await fetchAttendance(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />;
  if (!data.length) {
    return <EmptyState icon={Clock} title="No attendance records" description="Check-in / check-out from the Engineer app with GPS, OTP & face verification." />;
  }

  return (
    <>
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Engineer</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Check In</th>
              <th className="px-4 py-3">Check Out</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">OT</th>
              <th className="px-4 py-3">Verify</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((r) => {
              const sc = statusColors[r.status] || statusColors.present;
              return (
                <tr key={r._id} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{r.engineerName}</p>
                    <p className="text-[11px] text-gray-400">{r.employeeId}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3">{fmt(r.checkIn)}</td>
                  <td className="px-4 py-3">{fmt(r.checkOut)}</td>
                  <td className="px-4 py-3 font-semibold">{r.workingHours}h</td>
                  <td className="px-4 py-3">{r.overtimeHours || 0}h</td>
                  <td className="px-4 py-3 text-xs">
                    {r.faceVerified ? 'Face ✓' : '—'} {r.otpVerified ? 'OTP ✓' : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${sc}`}>{r.status?.replace('_', ' ')}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
    </>
  );
};

export default Attendance;
