import React, { useState, useEffect, useCallback } from 'react';
import { FolderKanban, Play, Pause, CheckCircle, Archive, Users, IndianRupee, AlertTriangle } from 'lucide-react';
import { fetchProjects, updateProject, formatINR, statusColors } from '../../../services/projectOpsService';
import { useProjectOps } from '../context/ProjectOpsContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 8;

const ProjectOS = () => {
  const { search, filters, refreshKey } = useProjectOps();
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
      const res = await fetchProjects(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateProject(id, { action }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  return (
    <>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2,3,4].map((i) => <div key={i} className="h-56 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects" description="Projects matching your services will appear here." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((p) => {
              const sc = statusColors[p.status] || statusColors.planning;
              return (
                <div key={p._id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md p-5 flex flex-col">
                  <div className="flex justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{p.projectCode}</p>
                      <h3 className="font-bold text-gray-900 mt-0.5 line-clamp-2">{p.title}</h3>
                      <p className="text-xs text-gray-500 mt-1">{p.clientName} · {p.serviceCategoryName}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border h-fit ${sc}`}>{p.status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-600 mb-3">
                    <span className="px-2 py-0.5 bg-gray-100 rounded-full capitalize">{p.projectType?.replace('_', ' ')}</span>
                    <span className="font-semibold text-blue-700 flex items-center gap-0.5"><IndianRupee className="h-3 w-3" />{formatINR(p.budget)}</span>
                    {p.riskLevel === 'high' && <span className="text-red-600 flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" /> High risk</span>}
                    <span>SLA: {p.slaStatus?.replace('_', ' ')}</span>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{p.currentStage}</span>
                      <span className="font-semibold text-gray-800">{p.progress}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${p.progress}%` }} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                    <Users className="h-3 w-3" /> {p.assignedManager || 'Unassigned'} · {p.assignedEngineers?.length || 0} engineers · {p.city}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {p.status === 'planning' && (
                      <button onClick={() => act(p._id, 'start')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg"><Play className="h-3 w-3" /> Start</button>
                    )}
                    {p.status === 'in_progress' && (
                      <>
                        <button onClick={() => act(p._id, 'pause')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><Pause className="h-3 w-3" /> Pause</button>
                        <button onClick={() => act(p._id, 'complete')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg"><CheckCircle className="h-3 w-3" /> Complete</button>
                      </>
                    )}
                    {p.status === 'completed' && (
                      <button onClick={() => act(p._id, 'archive')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><Archive className="h-3 w-3" /> Archive</button>
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

export default ProjectOS;
