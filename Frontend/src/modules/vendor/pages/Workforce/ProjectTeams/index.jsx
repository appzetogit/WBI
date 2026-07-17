import React, { useState, useEffect, useCallback } from 'react';
import { UsersRound, MapPin } from 'lucide-react';
import { fetchTeams, statusColors } from '../../../services/workforceOpsService';
import { useWorkforceOps } from '../context/WorkforceContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 8;

const ProjectTeams = () => {
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
      const res = await fetchTeams(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={UsersRound} title="No project teams" description="Teams are generated from your service templates (Survey, Install, QA, etc.)." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((t) => {
              const sc = statusColors[t.status] || statusColors.active;
              return (
                <div key={t._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{t.teamCode}</p>
                      <h3 className="font-bold text-gray-900">{t.name}</h3>
                      <p className="text-xs text-gray-500 mt-1">{t.serviceCategoryName}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border h-fit ${sc}`}>{t.status}</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">Lead: <span className="font-semibold">{t.leaderName || '—'}</span></p>
                  <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {t.city || t.location || '—'} · {t.members?.length || 0} members · Cap {t.capacity}
                  </p>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Utilization</span>
                      <span className="font-semibold text-gray-800">{t.utilization}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, t.utilization || 0)}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(t.currentProjects || []).map((p) => (
                      <span key={p.projectCode} className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{p.name}</span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(t.members || []).slice(0, 5).map((m) => (
                      <span key={m.employeeId || m.name} className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{m.name}</span>
                    ))}
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

export default ProjectTeams;
