import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Bell, Check, ExternalLink, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchGlobalNotifications, updateGlobalNotification, statusColors } from '../../services/globalModulesService';
import EmptyState from '../BusinessIntake/components/EmptyState';
import Pagination from '../BusinessIntake/components/Pagination';

const PAGE = 12;
const modules = ['', 'project-ops', 'finance', 'quality', 'compliance', 'support', 'system'];

const Notifications = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ read: '', module: '', priority: '' });
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchGlobalNotifications({
        page,
        limit: PAGE,
        search: search || undefined,
        read: filters.read || undefined,
        module: filters.module || undefined,
        priority: filters.priority || undefined
      });
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => { setPage(1); }, [search, filters]);
  useEffect(() => { load(); }, [load]);

  const act = async (item, action) => {
    try {
      await updateGlobalNotification(item._id, { action });
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Action failed');
    }
  };

  return (
    <div className="min-h-full p-6 bg-gray-50/80 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <span className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-xl"><Bell className="w-5 h-5 text-white" /></span>
          Notifications
        </h1>
        <p className="mt-1.5 ml-[46px] text-sm text-gray-500">Central notification center across projects, finance, quality, compliance and system alerts.</p>
      </div>

      <div className="flex flex-wrap gap-3 p-4 mb-5 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute w-4 h-4 text-gray-400 left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notifications..." className="w-full py-2.5 pl-9 pr-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filters.read} onChange={(e) => setFilters((f) => ({ ...f, read: e.target.value }))} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
          <option value="">All</option><option value="false">Unread</option><option value="true">Read</option>
        </select>
        <select value={filters.module} onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value }))} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
          {modules.map((m) => <option key={m || 'all'} value={m}>{m ? m.replace(/-/g, ' ') : 'All Modules'}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
          <option value="">All Priority</option>{['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="Alerts from all modules will appear here." />
      ) : (
        <>
          <div className="space-y-3">
            {data.map((item) => (
              <div key={item._id} className={`p-4 border rounded-xl shadow-sm ${item.read ? 'bg-white border-gray-200' : 'bg-blue-50/50 border-blue-100'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900 capitalize">{item.title}</h3>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${statusColors[item.priority] || statusColors.normal}`}>{item.priority}</span>
                      {!item.read && <span className="text-[10px] px-2 py-0.5 text-blue-700 bg-blue-100 rounded-full">Unread</span>}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{item.message}</p>
                    <p className="mt-1 text-xs text-gray-400">{item.module} · {item.channels?.join(', ')} · {new Date(item.createdAt).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex gap-2">
                    {!item.read && <button onClick={() => act(item, 'read')} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg"><Check className="w-3 h-3" /> Read</button>}
                    {item.actionUrl && <button onClick={() => navigate(item.actionUrl)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg"><ExternalLink className="w-3 h-3" /> Open</button>}
                    <button onClick={() => act(item, 'archive')} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg"><Archive className="w-3 h-3" /> Archive</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
        </>
      )}
    </div>
  );
};

export default Notifications;
