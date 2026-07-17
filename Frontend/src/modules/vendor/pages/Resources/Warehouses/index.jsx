import React, { useState, useEffect, useCallback } from 'react';
import { Warehouse, MapPin } from 'lucide-react';
import { fetchWarehouses, formatINR, statusColors } from '../../../services/resourcesOpsService';
import { useResourcesOps } from '../context/ResourcesContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 8;

const Warehouses = () => {
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
      if (filters.status) params.status = filters.status;
      const res = await fetchWarehouses(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3].map((i) => <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  if (!data.length) return <EmptyState icon={Warehouse} title="No warehouses" description="Add warehouses to sync stock across cities with live inventory." />;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((w) => {
          const sc = statusColors[w.status] || statusColors.active;
          const util = w.capacityUnits ? Math.round((w.currentStockUnits / w.capacityUnits) * 100) : 0;
          return (
            <div key={w._id} className="border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between gap-2 mb-2">
                <div>
                  <p className="text-[11px] font-mono text-gray-400">{w.warehouseCode}</p>
                  <h3 className="font-bold text-gray-900">{w.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {w.city} · Manager {w.manager}
                  </p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>{w.status}</span>
              </div>
              <p className="text-sm font-semibold text-gray-800 mb-2">{formatINR(w.stockValue)} stock value</p>
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Capacity {w.currentStockUnits}/{w.capacityUnits}</span>
                  <span>{util}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, util)}%` }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px]">
                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">Low {w.lowStockCount}</span>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">Reserved {w.reservedCount}</span>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">In {w.incomingCount}</span>
                <span className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full">Out {w.outgoingCount}</span>
                <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full">Damaged {w.damagedCount}</span>
              </div>
            </div>
          );
        })}
      </div>
      <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
    </>
  );
};

export default Warehouses;
