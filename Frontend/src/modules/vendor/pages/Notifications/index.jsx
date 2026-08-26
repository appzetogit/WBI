import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, Bell, Check, CheckCheck, ExternalLink, Mail, Search, Settings2, Trash2, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  fetchGlobalNotifications,
  updateGlobalNotification,
  bulkUpdateNotifications,
  markAllNotificationsRead,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  statusColors
} from '../../services/globalModulesService';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import EmptyState from '../BusinessIntake/components/EmptyState';
import Pagination from '../BusinessIntake/components/Pagination';

const PAGE = 12;
const MODULES = [
  '',
  'business-intake',
  'clients-contracts',
  'project-ops',
  'workforce',
  'resources',
  'quality',
  'finance',
  'performance',
  'compliance',
  'support',
  'settings',
  'system'
];

const resolveDeepLink = (basePath, actionUrl) => {
  if (!actionUrl) return null;
  if (actionUrl.startsWith('http')) return actionUrl;
  if (actionUrl.startsWith('/vendor/')) return actionUrl;
  const rest = String(actionUrl).replace(/^\//, '');
  return `${basePath}/${rest}`;
};

const Notifications = () => {
  const navigate = useNavigate();
  const { basePath } = useVendorBasePath();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ read: '', module: '', priority: '', archived: '' });
  const [data, setData] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE });
  const [unreadCount, setUnreadCount] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchGlobalNotifications({
        page,
        limit: PAGE,
        search: search || undefined,
        read: filters.read || undefined,
        module: filters.module || undefined,
        priority: filters.priority || undefined,
        archived: filters.archived || undefined
      });
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
      setUnreadCount(res.data.meta?.unreadCount || 0);
      setSelected([]);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => { setPage(1); }, [search, filters]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onUpdate = () => load();
    window.addEventListener('vendorNotificationsUpdated', onUpdate);
    return () => window.removeEventListener('vendorNotificationsUpdated', onUpdate);
  }, [load]);

  const allSelected = useMemo(
    () => data.length > 0 && selected.length === data.length,
    [data, selected]
  );

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelected([]);
    else setSelected(data.map((d) => d._id));
  };

  const act = async (item, action) => {
    try {
      await updateGlobalNotification(item._id, { action });
      if (action === 'read' && item.actionUrl) {
        /* keep list */
      }
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Action failed');
    }
  };

  const bulk = async (action) => {
    if (!selected.length) return toast.error('Select notifications first');
    try {
      await bulkUpdateNotifications({ ids: selected, action });
      toast.success(`Bulk ${action} complete`);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Bulk action failed');
    }
  };

  const markAll = async () => {
    try {
      await markAllNotificationsRead();
      toast.success('All marked as read');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed');
    }
  };

  const openItem = async (item) => {
    if (!item.read) {
      try { await updateGlobalNotification(item._id, { action: 'read' }); } catch { /* ignore */ }
    }
    const link = resolveDeepLink(basePath, item.actionUrl);
    if (link) navigate(link);
    else load();
  };

  const openPrefs = async () => {
    setPrefsOpen(true);
    try {
      const res = await fetchNotificationPreferences();
      setPrefs(res.data.data || null);
    } catch {
      toast.error('Failed to load preferences');
    }
  };

  const savePrefs = async () => {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      await updateNotificationPreferences({
        channels: prefs.channels,
        categories: prefs.categories,
        master: prefs.master,
        soundAlerts: prefs.soundAlerts
      });
      toast.success('Preferences saved');
      setPrefsOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Save failed');
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <div className="min-h-full p-6 bg-gray-50/80 lg:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-xl"><Bell className="w-5 h-5 text-white" /></span>
            Notifications
            {unreadCount > 0 && (
              <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{unreadCount} unread</span>
            )}
          </h1>
          <p className="mt-1.5 ml-[46px] text-sm text-gray-500">
            Live alerts from Business Intake, Finance, Ops, Compliance, Support and more.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={markAll} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-gray-200 bg-white rounded-lg">
            <CheckCheck className="w-3.5 h-3.5" /> Mark all read
          </button>
          <button type="button" onClick={openPrefs} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-gray-200 bg-white rounded-lg">
            <Settings2 className="w-3.5 h-3.5" /> Preferences
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 p-4 mb-4 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute w-4 h-4 text-gray-400 left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notifications..." className="w-full py-2.5 pl-9 pr-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filters.read} onChange={(e) => setFilters((f) => ({ ...f, read: e.target.value }))} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
          <option value="">All</option><option value="false">Unread</option><option value="true">Read</option>
        </select>
        <select value={filters.module} onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value }))} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
          {MODULES.map((m) => <option key={m || 'all'} value={m}>{m ? m.replace(/-/g, ' ') : 'All Modules'}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
          <option value="">All Priority</option>
          {['low', 'normal', 'medium', 'high', 'urgent', 'critical'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filters.archived} onChange={(e) => setFilters((f) => ({ ...f, archived: e.target.value }))} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
          <option value="">Inbox</option>
          <option value="true">Archived</option>
          <option value="all">All history</option>
        </select>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm">
          <span className="font-semibold text-blue-800">{selected.length} selected</span>
          <button type="button" onClick={() => bulk('read')} className="px-2.5 py-1 bg-white border rounded-lg text-xs">Mark read</button>
          <button type="button" onClick={() => bulk('unread')} className="px-2.5 py-1 bg-white border rounded-lg text-xs">Mark unread</button>
          <button type="button" onClick={() => bulk('archive')} className="px-2.5 py-1 bg-white border rounded-lg text-xs">Archive</button>
          <button type="button" onClick={() => bulk('delete')} className="px-2.5 py-1 bg-white border border-red-200 text-red-600 rounded-lg text-xs">Delete</button>
          <button type="button" onClick={() => setSelected([])} className="ml-auto text-xs text-gray-500">Clear</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="Alerts from live vendor events will appear here." />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2 px-1">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            <span className="text-xs text-gray-500">Select page</span>
          </div>
          <div className="space-y-3">
            {data.map((item) => (
              <div key={item._id} className={`p-4 border rounded-xl shadow-sm ${item.read ? 'bg-white border-gray-200' : 'bg-blue-50/50 border-blue-100'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3 min-w-0 flex-1">
                    <input type="checkbox" className="mt-1" checked={selected.includes(item._id)} onChange={() => toggleSelect(item._id)} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{item.title}</h3>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${statusColors[item.priority] || statusColors.normal}`}>{item.priority}</span>
                        <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">{item.module}</span>
                        {!item.read && <span className="text-[10px] px-2 py-0.5 text-blue-700 bg-blue-100 rounded-full">Unread</span>}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{item.message}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {item.type} · {item.channels?.join(', ') || 'in_app'} · {new Date(item.createdAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!item.read ? (
                      <button type="button" onClick={() => act(item, 'read')} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg"><Check className="w-3 h-3" /> Read</button>
                    ) : (
                      <button type="button" onClick={() => act(item, 'unread')} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg"><Mail className="w-3 h-3" /> Unread</button>
                    )}
                    {item.actionUrl && (
                      <button type="button" onClick={() => openItem(item)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg">
                        <ExternalLink className="w-3 h-3" /> Open
                      </button>
                    )}
                    {!item.archived && (
                      <button type="button" onClick={() => act(item, 'archive')} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg"><Archive className="w-3 h-3" /> Archive</button>
                    )}
                    <button type="button" onClick={() => act(item, 'delete')} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-red-100 text-red-600 rounded-lg"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
        </>
      )}

      {prefsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Notification preferences</h3>
              <button type="button" onClick={() => setPrefsOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {!prefs ? (
              <div className="h-32 bg-gray-100 animate-pulse rounded-xl" />
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(prefs.master)} onChange={(e) => setPrefs((p) => ({ ...p, master: e.target.checked }))} />
                  Enable notifications
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(prefs.soundAlerts)} onChange={(e) => setPrefs((p) => ({ ...p, soundAlerts: e.target.checked }))} />
                  Sound alerts
                </label>
                <div>
                  <p className="text-xs font-bold uppercase text-gray-500 mb-2">Channels</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.keys(prefs.channels || {}).map((key) => (
                      <label key={key} className="flex items-center gap-2 capitalize">
                        <input
                          type="checkbox"
                          checked={Boolean(prefs.channels[key])}
                          onChange={(e) => setPrefs((p) => ({
                            ...p,
                            channels: { ...p.channels, [key]: e.target.checked }
                          }))}
                        />
                        {key}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-gray-500 mb-2">Categories</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.keys(prefs.categories || {}).map((key) => (
                      <label key={key} className="flex items-center gap-2 capitalize">
                        <input
                          type="checkbox"
                          checked={Boolean(prefs.categories[key])}
                          onChange={(e) => setPrefs((p) => ({
                            ...p,
                            categories: { ...p.categories, [key]: e.target.checked }
                          }))}
                        />
                        {key}
                      </label>
                    ))}
                  </div>
                </div>
                <button type="button" disabled={savingPrefs} onClick={savePrefs} className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-60">
                  {savingPrefs ? 'Saving…' : 'Save preferences'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
