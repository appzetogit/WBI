import React, { useState, useEffect, useCallback } from 'react';
import { FileSignature, Calendar, IndianRupee, Shield, RefreshCw, Ban } from 'lucide-react';
import {
  fetchContracts, updateContract, formatINR, statusColors, timeAgo
} from '../../../services/clientsContractsService';
import { useClientsContracts } from '../context/ClientsContractsContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE_SIZE = 8;

const ContractCard = ({ contract, onAction }) => {
  const sc = statusColors[contract.status] || statusColors.draft;
  const clientName = contract.clientId?.company || contract.clientId?.name || '—';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-5 flex flex-col h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[11px] font-mono text-gray-400">{contract.contractCode}</p>
          <h3 className="font-bold text-gray-900 mt-1 leading-snug line-clamp-2">{contract.title}</h3>
          <p className="text-xs text-gray-500 mt-1">{clientName}</p>
        </div>
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border shrink-0 ${sc}`}>
          {contract.status.replace('_', ' ')}
        </span>
      </div>

      <div className="space-y-2 text-sm text-gray-600 mb-4">
        <div className="flex items-center gap-2 font-semibold text-blue-700">
          <IndianRupee className="h-3.5 w-3.5" /> {formatINR(contract.value)}
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          {new Date(contract.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          {' – '}
          {new Date(contract.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
        {contract.amc?.enabled && (
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-gray-400" /> AMC {formatINR(contract.amc.annualValue)}/yr
          </div>
        )}
        <p className="text-xs text-gray-400">v{contract.version} · Updated {timeAgo(contract.updatedAt)}</p>
      </div>

      <div className="mt-auto flex gap-2 flex-wrap">
        {contract.status === 'active' && (
          <>
            <button
              onClick={() => onAction(contract._id, { action: 'renew' })}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Renew
            </button>
            <button
              onClick={() => onAction(contract._id, { action: 'terminate' })}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              <Ban className="h-3.5 w-3.5" /> Terminate
            </button>
          </>
        )}
        {contract.status === 'draft' && (
          <button
            onClick={() => onAction(contract._id, { status: 'pending_signature' })}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Send for Signature
          </button>
        )}
        {contract.status === 'pending_signature' && (
          <button
            onClick={() => onAction(contract._id, { status: 'active', signatures: [
              { party: 'vendor', name: 'Vendor', signedAt: new Date() },
              { party: 'client', name: clientName, signedAt: new Date() }
            ] })}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
          >
            Mark Signed
          </button>
        )}
      </div>
    </div>
  );
};

const Contracts = () => {
  const { search, refreshKey } = useClientsContracts();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await fetchContracts(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { setPage(1); }, [statusFilter, search, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const handleAction = async (id, body) => {
    try {
      await updateContract(id, body);
      load();
    } catch (e) {
      alert(e.response?.data?.message || 'Action failed');
    }
  };

  return (
    <>
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {['', 'draft', 'pending_signature', 'active', 'expired', 'terminated'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
              statusFilter === s ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={FileSignature} title="No contracts" description="Digital contracts with your clients will appear here." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((c) => <ContractCard key={c._id} contract={c} onAction={handleAction} />)}
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
        </>
      )}
    </>
  );
};

export default Contracts;
