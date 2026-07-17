import React, { useState, useEffect, useCallback } from 'react';
import { Package } from 'lucide-react';
import { fetchInventory, updateInventory, formatINR, statusColors } from '../../../services/resourcesOpsService';
import { useResourcesOps } from '../context/ResourcesContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 10;

const Inventory = () => {
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
      const res = await fetchInventory(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateInventory(id, { action }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  if (loading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  if (!data.length) return <EmptyState icon={Package} title="No inventory" description="Categories are generated from your approved services (Solar panels, CCTV cameras, etc.)." />;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((item) => {
          const sc = statusColors[item.stockStatus] || statusColors.in_stock;
          return (
            <div key={item._id} className="border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col">
              <div className="flex justify-between gap-2 mb-2">
                <div>
                  <p className="text-[11px] font-mono text-gray-400">{item.sku}</p>
                  <h3 className="font-bold text-gray-900">{item.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{item.category} · {item.serviceCategoryName}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>
                  {item.stockStatus?.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-gray-600 mb-3">
                <span className="font-semibold">Qty {item.quantity}</span>
                <span>Reserved {item.reservedQty}</span>
                <span>Allocated {item.allocatedQty}</span>
                <span>{formatINR(item.unitCost)}/{item.unit}</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{item.warehouseName} · BC {item.barcode || '—'}</p>
              <div className="mt-auto flex flex-wrap gap-2">
                <button onClick={() => act(item._id, 'reserve')} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">Reserve</button>
                <button onClick={() => act(item._id, 'allocate')} className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg">Allocate</button>
                <button onClick={() => act(item._id, 'return')} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg">Return</button>
                <button onClick={() => act(item._id, 'scrap')} className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded-lg">Scrap</button>
              </div>
            </div>
          );
        })}
      </div>
      <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
    </>
  );
};

export default Inventory;
