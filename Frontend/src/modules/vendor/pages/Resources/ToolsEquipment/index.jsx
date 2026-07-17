import React, { useState, useEffect, useCallback } from 'react';
import { Wrench } from 'lucide-react';
import { fetchTools, updateTool, statusColors } from '../../../services/resourcesOpsService';
import { useResourcesOps } from '../context/ResourcesContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 10;

const ToolsEquipment = () => {
  const { search, filters, refreshKey } = useResourcesOps();
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
      const res = await fetchTools(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try {
      await updateTool(id, {
        action,
        assignedEngineer: action === 'assign' ? 'Field Engineer' : undefined,
        assignedProject: action === 'assign' ? 'Active Project' : undefined
      });
      load();
    } catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  if (loading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  if (!data.length) return <EmptyState icon={Wrench} title="No tools" description="Tool categories adapt to your services — solar testers, network OTDR, HVAC gauges, etc." />;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((t) => {
          const sc = statusColors[t.status] || statusColors.available;
          return (
            <div key={t._id} className="border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col">
              <div className="flex justify-between gap-2 mb-2">
                <div>
                  <p className="text-[11px] font-mono text-gray-400">{t.toolCode}</p>
                  <h3 className="font-bold text-gray-900">{t.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{t.category} · {t.serviceCategoryName}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>{t.status}</span>
              </div>
              <p className="text-xs text-gray-500 mb-1">SN {t.serialNumber || '—'} · Condition {t.condition}</p>
              <p className="text-xs text-gray-600 mb-3">
                {t.assignedEngineer ? `Assigned: ${t.assignedEngineer}` : 'Unassigned'}
                {t.assignedProject ? ` · ${t.assignedProject}` : ''}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                {t.status === 'available' && (
                  <button onClick={() => act(t._id, 'assign')} className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg">Assign</button>
                )}
                {t.status === 'assigned' && (
                  <button onClick={() => act(t._id, 'return')} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg">Return</button>
                )}
                <button onClick={() => act(t._id, 'maintenance')} className="px-3 py-1.5 text-xs font-medium border border-amber-200 text-amber-700 rounded-lg">Maintenance</button>
                <button onClick={() => act(t._id, 'inspect')} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg">Inspect</button>
              </div>
            </div>
          );
        })}
      </div>
      <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
    </>
  );
};

export default ToolsEquipment;
