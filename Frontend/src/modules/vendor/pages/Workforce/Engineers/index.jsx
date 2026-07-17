import React, { useState, useEffect, useCallback } from 'react';
import { Users, MapPin, Star, Briefcase, Ban, ArrowUpCircle, Power } from 'lucide-react';
import { fetchEngineers, updateEngineer, formatINR, statusColors } from '../../../services/workforceOpsService';
import { useWorkforceOps } from '../context/WorkforceContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 8;

const Engineers = () => {
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
      if (filters.availability) params.availability = filters.availability;
      const res = await fetchEngineers(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateEngineer(id, { action }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  return (
    <>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-56 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={Users} title="No engineers" description="Add engineers or seed demo data. Roles adapt to your approved services." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((e) => {
              const avail = statusColors[e.availability] || statusColors.offline;
              const st = statusColors[e.status] || statusColors.active;
              const initials = e.name.split(' ').map((w) => w[0]).join('').slice(0, 2);
              return (
                <div key={e._id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md p-5 flex flex-col">
                  <div className="flex gap-3 mb-3">
                    <div className="h-12 w-12 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-mono text-gray-400">{e.employeeId}</p>
                      <h3 className="font-bold text-gray-900 truncate">{e.name}</h3>
                      <p className="text-xs text-gray-500">{e.role} · {e.serviceCategoryName}</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${avail}`}>{e.availability?.replace('_', ' ')}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${st}`}>{e.status}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-600 mb-3">
                    <span className="px-2 py-0.5 bg-gray-100 rounded-full">{e.primarySkill}</span>
                    <span className="capitalize">{e.certificationLevel}</span>
                    <span>{e.experienceYears}y exp</span>
                    <span className="flex items-center gap-0.5"><Star className="h-3 w-3 text-amber-500" />{e.rating}</span>
                    <span>Score {e.performanceScore}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {e.city || '—'} · {e.currentLocation || 'No site'}
                  </p>
                  <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                    <Briefcase className="h-3 w-3" /> {e.todayTask || 'No task today'} · KYC {e.kycStatus}
                  </p>
                  <p className="text-xs text-gray-400 mb-3">Wallet {formatINR(e.walletBalance)}</p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <button onClick={() => act(e._id, 'promote')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">
                      <ArrowUpCircle className="h-3 w-3" /> Promote
                    </button>
                    {e.status === 'active' && (
                      <button onClick={() => act(e._id, 'suspend')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-amber-200 text-amber-700 rounded-lg">
                        <Ban className="h-3 w-3" /> Suspend
                      </button>
                    )}
                    {e.status === 'suspended' && (
                      <button onClick={() => act(e._id, 'activate')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg">
                        <Power className="h-3 w-3" /> Activate
                      </button>
                    )}
                    {e.status === 'active' && (
                      <button onClick={() => act(e._id, 'deactivate')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-500">
                        Deactivate
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

export default Engineers;
