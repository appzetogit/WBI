import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, LogIn, LogOut, Navigation } from 'lucide-react';
import { fetchSites, siteCheckIn, siteCheckOut, statusColors } from '../../../services/projectOpsService';
import { useProjectOps } from '../context/ProjectOpsContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 9;

const SitesLocations = () => {
  const { search, refreshKey } = useProjectOps();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE };
      if (search) params.search = search;
      const res = await fetchSites(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { setPage(1); }, [search, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const checkIn = async (id) => { try { await siteCheckIn(id); load(); } catch (e) { alert(e.response?.data?.message || 'Failed'); } };
  const checkOut = async (id) => { try { await siteCheckOut(id); load(); } catch (e) { alert(e.response?.data?.message || 'Failed'); } };

  return (
    <>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[1,2,3,4,5,6].map((i) => <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={MapPin} title="No sites" description="Execution sites linked to your projects will appear here." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map((s) => {
              const sc = statusColors[s.status] || statusColors.pending;
              return (
                <div key={s._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex justify-between mb-2">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{s.siteCode}</p>
                      <h3 className="font-bold text-gray-900">{s.name}</h3>
                      <p className="text-xs text-gray-500">{s.clientName}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border h-fit ${sc}`}>{s.status.replace('_', ' ')}</span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2 flex items-start gap-1">
                    <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" /> {s.address || `${s.city}, ${s.state}`}
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 mb-3">
                    <span>GPS: {s.gpsStatus}</span>
                    <span>OTP: {s.otpVerified ? 'Verified' : 'Pending'}</span>
                    <span>Photos: {s.photoCount}</span>
                    {s.lat && <span className="flex items-center gap-0.5"><Navigation className="h-3 w-3" />{s.lat.toFixed(2)}, {s.lng?.toFixed(2)}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mb-3">Project: {s.projectId?.projectCode || '—'} · {s.projectId?.title}</p>
                  <div className="flex gap-2">
                    {s.status !== 'completed' && !s.checkInAt && (
                      <button onClick={() => checkIn(s._id)} className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg">
                        <LogIn className="h-3.5 w-3.5" /> Check In
                      </button>
                    )}
                    {s.checkInAt && !s.checkOutAt && (
                      <button onClick={() => checkOut(s._id)} className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">
                        <LogOut className="h-3.5 w-3.5" /> Check Out
                      </button>
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

export default SitesLocations;
