import React, { useState, useEffect, useCallback } from 'react';
import { Box } from 'lucide-react';
import { fetchAssets, updateAsset, statusColors } from '../../../services/resourcesOpsService';
import { useResourcesOps } from '../context/ResourcesContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 10;

const InstalledAssets = () => {
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
      const res = await fetchAssets(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateAsset(id, { action }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  if (loading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  if (!data.length) return <EmptyState icon={Box} title="No installed assets" description="Client-site assets (panels, cameras, licenses) appear here after installation." />;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((a) => {
          const sc = statusColors[a.status] || statusColors.installed;
          return (
            <div key={a._id} className="border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col">
              <div className="flex justify-between gap-2 mb-2">
                <div>
                  <p className="text-[11px] font-mono text-gray-400">{a.assetCode}</p>
                  <h3 className="font-bold text-gray-900">{a.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{a.clientName} · {a.siteName}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>{a.status}</span>
              </div>
              <p className="text-xs text-gray-600 mb-1">{a.serviceCategoryName} · {a.projectName}</p>
              <p className="text-xs text-gray-500 mb-3">
                SN {a.serialNumber} · By {a.installedBy} · {a.city}
                {a.warrantyExpiry ? ` · Warranty ${new Date(a.warrantyExpiry).toLocaleDateString('en-IN')}` : ''}
              </p>
              {(a.serviceHistory || []).length > 0 && (
                <p className="text-[11px] text-gray-400 mb-3">
                  Last: {a.serviceHistory[a.serviceHistory.length - 1]?.action} · {a.serviceHistory.length} events
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-2">
                <button onClick={() => act(a._id, 'inspect')} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg">Inspect</button>
                <button onClick={() => act(a._id, 'maintenance')} className="px-3 py-1.5 text-xs font-medium border border-amber-200 text-amber-700 rounded-lg">Maintenance</button>
                <button onClick={() => act(a._id, 'repair')} className="px-3 py-1.5 text-xs font-medium border border-orange-200 text-orange-700 rounded-lg">Repair</button>
                <button onClick={() => act(a._id, 'retire')} className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-500 rounded-lg">Retire</button>
              </div>
            </div>
          );
        })}
      </div>
      <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
    </>
  );
};

export default InstalledAssets;
