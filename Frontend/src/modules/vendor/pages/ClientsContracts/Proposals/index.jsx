import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Building2, Calendar } from 'lucide-react';
import { fetchCCProposals, formatINR } from '../../../services/clientsContractsService';
import { useClientsContracts } from '../context/ClientsContractsContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const STATUS_TABS = ['all', 'draft', 'sent', 'viewed', 'negotiating', 'accepted', 'rejected'];

const statusConfig = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-50 text-blue-700',
  viewed: 'bg-violet-50 text-violet-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  negotiating: 'bg-amber-50 text-amber-700'
};

const PAGE_SIZE = 8;

const Proposals = () => {
  const { refreshKey } = useClientsContracts();
  const [proposals, setProposals] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (activeTab !== 'all') params.status = activeTab;
      const res = await fetchCCProposals(params);
      setProposals(res.data.data || []);
      setStatusCounts(res.data.statusCounts || {});
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
    } catch {
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => { setPage(1); }, [activeTab, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <>
      <div className="flex gap-1 overflow-x-auto mb-5 border-b border-gray-100">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              activeTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {(statusCounts[tab] || 0) > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {statusCounts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No proposals"
          description="Proposals linked to your clients appear here. Create proposals from Business Intake or New Proposal."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {proposals.map((p) => (
              <div key={p._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono text-gray-400">{p.proposalCode}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusConfig[p.status] || statusConfig.draft}`}>
                        {p.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 line-clamp-2">{p.title}</h3>
                    {(p.clientId?.company || p.clientId?.name || p.opportunityId?.clientInfo?.company) && (
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {p.clientId?.company || p.clientId?.name || p.opportunityId?.clientInfo?.company}
                      </p>
                    )}
                  </div>
                  <p className="text-lg font-bold text-blue-700 shrink-0">{formatINR(p.pricing?.totalAmount)}</p>
                </div>
                {p.timeline?.totalDays && (
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {p.timeline.totalDays} days
                  </p>
                )}
              </div>
            ))}
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
        </>
      )}
    </>
  );
};

export default Proposals;
