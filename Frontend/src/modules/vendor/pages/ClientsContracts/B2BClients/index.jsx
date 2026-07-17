import React, { useState, useEffect, useCallback } from 'react';
import { Building2, X } from 'lucide-react';
import { fetchClients, fetchClientById, formatINR, statusColors } from '../../../services/clientsContractsService';
import { useClientsContracts } from '../context/ClientsContractsContext';
import B2BClientCard from '../components/B2BClientCard';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE_SIZE = 6;

const B2BDrawer = ({ client, onClose }) => {
  if (!client) return null;
  const sc = statusColors[client.status] || statusColors.active;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{client.company}</h2>
            <p className="text-sm text-gray-500">{client.industry} · GST {client.gstNumber || '—'}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${sc}`}>{client.status}</span>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-gray-500">Total value</p><p className="font-bold text-blue-700 text-lg">{formatINR(client.totalSpend)}</p></div>
            <div><p className="text-xs text-gray-500">Pending payments</p><p className="font-semibold">{formatINR(client.pendingPayments)}</p></div>
            <div><p className="text-xs text-gray-500">Running projects</p><p className="font-medium">{client.activeProjects}</p></div>
            <div><p className="text-xs text-gray-500">Sites</p><p className="font-medium">{client.totalSites}</p></div>
            <div><p className="text-xs text-gray-500">SLA</p><p className="font-medium capitalize">{client.slaTier}</p></div>
            <div><p className="text-xs text-gray-500">Priority</p><p className="font-medium capitalize">{client.priority}</p></div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Cities</p>
            <p className="text-sm text-gray-700">{(client.cities || []).join(', ') || client.city}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Services</p>
            <div className="flex flex-wrap gap-1.5">
              {(client.serviceCategoryNames || []).map((s) => (
                <span key={s} className="text-xs px-2 py-1 rounded-full bg-violet-50 text-violet-700">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const B2BClients = () => {
  const { search, filters, refreshKey } = useClientsContracts();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { type: 'b2b', page, limit: PAGE_SIZE, sort: filters.sort || 'lastActivityAt' };
      if (search) params.search = search;
      if (filters.category) params.category = filters.category;
      if (filters.city) params.city = filters.city;
      if (filters.status) params.status = filters.status;
      const res = await fetchClients(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load B2B clients');
    } finally {
      setLoading(false);
    }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const handleView = async (client) => {
    setSelected(client);
    try {
      const res = await fetchClientById(client._id);
      setSelected(res.data.data);
    } catch { /* keep */ }
  };

  return (
    <>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Building2} title="No B2B clients" description="Enterprise clients matching your services will appear here." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((c) => <B2BClientCard key={c._id} client={c} onView={handleView} />)}
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
        </>
      )}
      {selected && <B2BDrawer client={selected} onClose={() => setSelected(null)} />}
    </>
  );
};

export default B2BClients;
