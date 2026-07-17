import React, { useCallback, useEffect, useState } from 'react';
import { HelpCircle, LifeBuoy, MessageSquare, Plus, Search } from 'lucide-react';
import { createSupportTicket, fetchSupportTickets, updateSupportTicket, statusColors } from '../../services/globalModulesService';
import EmptyState from '../BusinessIntake/components/EmptyState';
import Pagination from '../BusinessIntake/components/Pagination';

const PAGE = 10;

const Support = () => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', priority: '' });
  const [data, setData] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSupportTickets({ page, limit: PAGE, search: search || undefined, status: filters.status || undefined, priority: filters.priority || undefined });
      setData(res.data.data || []);
      setStats(res.data.stats || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => { setPage(1); }, [search, filters]);
  useEffect(() => { load(); }, [load]);

  const createTicket = async () => {
    const subject = window.prompt('Ticket subject');
    if (!subject) return;
    try {
      await createSupportTicket({ subject, description: 'Created from Vendor Portal', category: 'general', priority: 'medium' });
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to create ticket');
    }
  };

  const act = async (ticket, action) => {
    try {
      await updateSupportTicket(ticket._id, { action, message: action === 'resolve' ? 'Resolution accepted by vendor.' : '' });
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Action failed');
    }
  };

  const count = (status) => stats.find((row) => row._id === status)?.count || 0;

  return (
    <div className="min-h-full p-6 bg-gray-50/80 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-xl"><HelpCircle className="w-5 h-5 text-white" /></span>
            Support
          </h1>
          <p className="mt-1.5 ml-[46px] text-sm text-gray-500">Ticket workflow, comments, timelines and knowledge base for vendor help.</p>
        </div>
        <button onClick={createTicket} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg"><Plus className="w-4 h-4" /> Create Ticket</button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5 md:grid-cols-4">
        {['open', 'assigned', 'investigation', 'resolved'].map((status) => (
          <div key={status} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{count(status)}</p>
            <p className="text-xs text-gray-500 capitalize">{status.replace(/_/g, ' ')}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <div className="flex flex-wrap gap-3 p-4 mb-4 bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute w-4 h-4 text-gray-400 left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets..." className="w-full py-2.5 pl-9 pr-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
              <option value="">All Status</option>{['open', 'assigned', 'investigation', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
              <option value="">All Priority</option>{['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : data.length === 0 ? (
            <EmptyState icon={LifeBuoy} title="No support tickets" description="Create tickets for technical, payment, project, quality or inventory issues." />
          ) : (
            <>
              <div className="space-y-3">
                {data.map((ticket) => (
                  <div key={ticket._id} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] text-gray-400">{ticket.ticketCode}</p>
                        <h3 className="font-bold text-gray-900">{ticket.subject}</h3>
                        <p className="text-xs text-gray-500">{ticket.category.replace(/_/g, ' ')} · {ticket.assignedTeam} · {ticket.serviceCategoryName || 'Platform'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${statusColors[ticket.status] || statusColors.open}`}>{ticket.status}</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${statusColors[ticket.priority] || statusColors.medium}`}>{ticket.priority}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{ticket.description}</p>
                    <p className="mt-1 text-xs text-gray-400">{ticket.replies?.length || 0} comments · {ticket.attachmentsCount} attachments · Avg response {ticket.averageResponseMinutes}m</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {ticket.status === 'open' && <button onClick={() => act(ticket, 'assign')} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg">Assign Team</button>}
                      {ticket.status === 'assigned' && <button onClick={() => act(ticket, 'investigate')} className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg">Investigate</button>}
                      {ticket.status === 'investigation' && <button onClick={() => act(ticket, 'resolve')} className="px-3 py-1.5 text-xs text-white bg-emerald-600 rounded-lg">Resolve</button>}
                      {ticket.status === 'resolved' && <button onClick={() => act(ticket, 'close')} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg">Close</button>}
                    </div>
                  </div>
                ))}
              </div>
              <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
            </>
          )}
        </div>
        <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm h-fit">
          <h2 className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-800"><MessageSquare className="w-4 h-4" /> Knowledge Base</h2>
          {['Getting Started', 'Finance & Wallet', 'Project Execution', 'Quality Approvals', 'API Docs', 'Release Notes'].map((item) => (
            <div key={item} className="p-3 mb-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg">{item}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Support;
