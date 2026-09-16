import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  ExternalLink,
  Filter,
  Mail,
  Search,
  Settings2,
  Trash2,
  X,
  Sparkles,
  Building2,
  CheckCircle2,
  XCircle,
  Wrench,
  Activity,
  Wallet,
  Landmark,
  ShieldCheck,
  Clock,
  Volume2,
  SlidersHorizontal,
  Inbox,
  Calendar
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

const PAGE = 15;

const CATEGORY_TABS = [
  { id: 'all', label: 'All Notifications', countKey: 'all' },
  { id: 'user_projects', label: 'User Projects', module: 'my-jobs' },
  { id: 'b2b_jobs', label: 'B2B Jobs', module: 'my-jobs' },
  { id: 'engineer_updates', label: 'Engineer Updates', module: 'engineers' },
  { id: 'finance', label: 'Finance & Settlements', module: 'finance' }
];

const resolveDeepLink = (basePath, actionUrl) => {
  if (!actionUrl) return null;
  if (actionUrl.startsWith('http')) return actionUrl;
  if (actionUrl.startsWith('/vendor/')) return actionUrl;
  const rest = String(actionUrl).replace(/^\//, '');
  return `${basePath}/${rest}`;
};

// Format relative time helper
const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Date Grouping logic
const getDateGroup = (dateStr) => {
  if (!dateStr) return 'Older';
  const now = new Date();
  const date = new Date(dateStr);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  if (date >= startOfToday) return 'Today';
  if (date >= startOfYesterday) return 'Yesterday';
  if (date >= startOfWeek) return 'Earlier this week';
  return 'Older';
};

// Canonical Event Visuals Resolver
const getEventVisuals = (type, module) => {
  const t = String(type || '').toUpperCase();
  switch (t) {
    case 'NEW_USER_PROJECT':
    case 'BOOKING_REQUEST':
    case 'BOOKING_CREATED':
    case 'NEW_BOOKING_REQUEST':
      return {
        icon: Sparkles,
        iconBg: 'bg-blue-500/10 text-blue-600 border-blue-200',
        badge: 'New User Project',
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
      };
    case 'NEW_B2B_JOB':
    case 'CLIENT_REQUEST':
    case 'OPPORTUNITY_NEW':
    case 'NEW_OPPORTUNITY':
      return {
        icon: Building2,
        iconBg: 'bg-indigo-500/10 text-indigo-600 border-indigo-200',
        badge: 'New B2B Job',
        badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200'
      };
    case 'JOB_ACCEPTED':
    case 'BOOKING_ACCEPTED':
    case 'OPS_JOB_ACCEPTED':
      return {
        icon: CheckCircle2,
        iconBg: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
        badge: 'Job Accepted',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      };
    case 'JOB_REJECTED':
    case 'BOOKING_CANCELLED':
    case 'OPS_JOB_REJECTED':
      return {
        icon: XCircle,
        iconBg: 'bg-rose-500/10 text-rose-600 border-rose-200',
        badge: 'Job Rejected',
        badgeColor: 'bg-rose-50 text-rose-700 border-rose-200'
      };
    case 'ENGINEER_ASSIGNED':
    case 'OPS_ENGINEER_ASSIGNED':
    case 'WORKER_ASSIGNED':
    case 'PROJECT_ASSIGNED':
      return {
        icon: Wrench,
        iconBg: 'bg-cyan-500/10 text-cyan-600 border-cyan-200',
        badge: 'Engineer Assigned',
        badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200'
      };
    case 'ENGINEER_STATUS_UPDATED':
    case 'WORKER_STARTED':
    case 'JOB_ENGINEER_ACCEPTED':
      return {
        icon: Activity,
        iconBg: 'bg-amber-500/10 text-amber-600 border-amber-200',
        badge: 'Status Updated',
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200'
      };
    case 'JOB_COMPLETED':
    case 'BOOKING_COMPLETED':
    case 'OPS_JOB_COMPLETED':
    case 'WORKER_COMPLETED':
      return {
        icon: ShieldCheck,
        iconBg: 'bg-teal-500/10 text-teal-600 border-teal-200',
        badge: 'Job Completed',
        badgeColor: 'bg-teal-50 text-teal-700 border-teal-200'
      };
    case 'PAYMENT_CREDITED':
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_SUCCESS':
    case 'ESCROW_RELEASED':
      return {
        icon: Wallet,
        iconBg: 'bg-green-500/10 text-green-600 border-green-200',
        badge: 'Payment Credited',
        badgeColor: 'bg-green-50 text-green-700 border-green-200'
      };
    case 'PAYOUT_PROCESSED':
    case 'WITHDRAWAL_PAID':
    case 'WITHDRAWAL_APPROVED':
    case 'SETTLEMENT_COMPLETED':
      return {
        icon: Landmark,
        iconBg: 'bg-purple-500/10 text-purple-600 border-purple-200',
        badge: 'Payout Processed',
        badgeColor: 'bg-purple-50 text-purple-700 border-purple-200'
      };
    default:
      if (module === 'finance') {
        return {
          icon: Wallet,
          iconBg: 'bg-green-500/10 text-green-600 border-green-200',
          badge: 'Finance Alert',
          badgeColor: 'bg-green-50 text-green-700 border-green-200'
        };
      }
      return {
        icon: Bell,
        iconBg: 'bg-gray-500/10 text-gray-600 border-gray-200',
        badge: module ? module.replace(/-/g, ' ') : 'System',
        badgeColor: 'bg-gray-100 text-gray-700 border-gray-200'
      };
  }
};

const Notifications = () => {
  const navigate = useNavigate();
  const { basePath } = useVendorBasePath();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ read: '', priority: '', archived: '' });
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
      let moduleFilter = undefined;
      if (activeTab === 'requests') moduleFilter = 'requests';
      else if (activeTab === 'jobs') moduleFilter = 'my-jobs';
      else if (activeTab === 'finance') moduleFilter = 'finance';
      else if (activeTab === 'system') moduleFilter = 'compliance';

      const res = await fetchGlobalNotifications({
        page,
        limit: PAGE,
        search: search || undefined,
        read: filters.read || undefined,
        module: moduleFilter,
        priority: filters.priority || undefined,
        archived: filters.archived || undefined
      });
      setData(res.data?.data || []);
      setPagination(res.data?.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
      setUnreadCount(res.data?.meta?.unreadCount || 0);
      setSelected([]);
    } catch (err) {
      console.warn('[Notifications] fetch failed:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters, activeTab]);

  useEffect(() => {
    setPage(1);
  }, [search, filters, activeTab]);

  useEffect(() => {
    load();
  }, [load]);

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
      toast.success(
        action === 'read'
          ? 'Marked as read'
          : action === 'unread'
          ? 'Marked as unread'
          : action === 'archive'
          ? 'Notification archived'
          : action === 'unarchive'
          ? 'Notification unarchived'
          : 'Notification deleted'
      );
      window.dispatchEvent(new CustomEvent('vendorNotificationsUpdated'));
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Action failed');
    }
  };

  const bulk = async (action) => {
    if (!selected.length) return toast.error('Select notifications first');
    try {
      await bulkUpdateNotifications({ ids: selected, action });
      toast.success(`Bulk ${action} applied to ${selected.length} notifications`);
      window.dispatchEvent(new CustomEvent('vendorNotificationsUpdated'));
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Bulk action failed');
    }
  };

  const markAll = async () => {
    try {
      await markAllNotificationsRead();
      toast.success('All notifications marked as read');
      window.dispatchEvent(new CustomEvent('vendorNotificationsUpdated'));
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to mark read');
    }
  };

  const openItem = async (item) => {
    if (!item.read) {
      try {
        await updateGlobalNotification(item._id, { action: 'read' });
        window.dispatchEvent(new CustomEvent('vendorNotificationsUpdated'));
      } catch {
        /* ignore */
      }
    }
    const link = resolveDeepLink(basePath, item.actionUrl);
    if (link) {
      if (link.startsWith('http')) {
        window.open(link, '_blank');
      } else {
        navigate(link);
      }
    } else {
      load();
    }
  };

  const openPrefs = async () => {
    setPrefsOpen(true);
    try {
      const res = await fetchNotificationPreferences();
      setPrefs(res.data?.data || null);
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
      toast.success('Notification preferences updated');
      setPrefsOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Save failed');
    } finally {
      setSavingPrefs(false);
    }
  };

  // Group current page data by Date Group
  const groupedData = useMemo(() => {
    const groups = {
      Today: [],
      Yesterday: [],
      'Earlier this week': [],
      Older: []
    };

    data.forEach((item) => {
      const groupKey = getDateGroup(item.createdAt);
      if (groups[groupKey]) {
        groups[groupKey].push(item);
      } else {
        groups['Older'].push(item);
      }
    });

    return groups;
  }, [data]);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 bg-gradient-to-b from-gray-50/50 to-gray-100/40">
      {/* Top Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/20 text-white">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">Notifications</h1>
              {unreadCount > 0 ? (
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-50 text-rose-600 border border-rose-200 ring-2 ring-rose-100/50 animate-pulse">
                  {unreadCount} unread
                </span>
              ) : (
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                  All caught up
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs sm:text-sm text-gray-500">
              Live event stream across User Requests, B2B Projects, Engineer Status, and Finance.
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAll}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95"
            >
              <CheckCheck className="w-4 h-4 text-blue-600" />
              <span>Mark all read</span>
            </button>
          )}

          <button
            type="button"
            onClick={openPrefs}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95"
          >
            <Settings2 className="w-4 h-4 text-gray-500" />
            <span>Preferences</span>
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600/30'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search and Secondary Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 p-3.5 mb-4 bg-white border border-gray-200/80 rounded-2xl shadow-sm">
        <div className="relative lg:col-span-5">
          <Search className="absolute w-4 h-4 text-gray-400 left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, message, reference..."
            className="w-full py-2 pl-9 pr-3 text-xs sm:text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50"
          />
        </div>

        <div className="lg:col-span-2">
          <select
            value={filters.read}
            onChange={(e) => setFilters((f) => ({ ...f, read: e.target.value }))}
            className="w-full px-3 py-2 text-xs sm:text-sm bg-gray-50/50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-700"
          >
            <option value="">Status: All</option>
            <option value="false">Unread Only</option>
            <option value="true">Read Only</option>
          </select>
        </div>

        <div className="lg:col-span-3">
          <select
            value={filters.priority}
            onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
            className="w-full px-3 py-2 text-xs sm:text-sm bg-gray-50/50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-700"
          >
            <option value="">Priority: All</option>
            <option value="critical">Critical / Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="lg:col-span-2">
          <select
            value={filters.archived}
            onChange={(e) => setFilters((f) => ({ ...f, archived: e.target.value }))}
            className="w-full px-3 py-2 text-xs sm:text-sm bg-gray-50/50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-700"
          >
            <option value="">Inbox</option>
            <option value="true">Archived</option>
            <option value="all">All History</option>
          </select>
        </div>
      </div>

      {/* Floating Bulk Actions Bar */}
      {selected.length > 0 && (
        <div className="sticky top-20 z-20 flex flex-wrap items-center gap-2 mb-4 p-3 bg-blue-900 text-white rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-2">
          <span className="font-bold text-xs bg-blue-800 px-2.5 py-1 rounded-lg">
            {selected.length} selected
          </span>
          <div className="h-4 w-[1px] bg-blue-700 mx-1" />
          <button
            type="button"
            onClick={() => bulk('read')}
            className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
          >
            <Check className="w-3.5 h-3.5" /> Mark read
          </button>
          <button
            type="button"
            onClick={() => bulk('unread')}
            className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
          >
            <Mail className="w-3.5 h-3.5" /> Mark unread
          </button>
          <button
            type="button"
            onClick={() => bulk('archive')}
            className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
          >
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
          <button
            type="button"
            onClick={() => bulk('delete')}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="ml-auto text-xs text-blue-200 hover:text-white px-2 py-1"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-24 bg-white border border-gray-100 rounded-2xl shadow-sm p-4 animate-pulse flex items-center gap-4"
            >
              <div className="w-10 h-10 bg-gray-200 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications found"
          description="Operational notifications and event updates will appear here in real-time."
        />
      ) : (
        <>
          {/* Select all bar */}
          <div className="flex items-center justify-between px-2 mb-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-500">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              Select all on this page ({data.length})
            </label>
            <span className="text-xs text-gray-400 font-medium">
              Showing {data.length} of {pagination.total} notifications
            </span>
          </div>

          {/* Grouped Notifications List */}
          <div className="space-y-6">
            {Object.entries(groupedData).map(([groupTitle, items]) => {
              if (!items.length) return null;
              return (
                <div key={groupTitle} className="space-y-2.5">
                  {/* Date Section Header */}
                  <div className="flex items-center gap-2 px-1 pt-2">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      {groupTitle}
                    </h2>
                    <div className="h-[1px] flex-1 bg-gray-200/70 ml-1" />
                  </div>

                  {/* Cards inside Group */}
                  <div className="space-y-2.5">
                    {items.map((item) => {
                      const { icon: IconComponent, iconBg, badge, badgeColor } = getEventVisuals(
                        item.type,
                        item.module
                      );
                      const isSelected = selected.includes(item._id);

                      return (
                        <div
                          key={item._id}
                          className={`group relative p-4 border rounded-2xl transition-all duration-200 ${
                            isSelected
                              ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20 shadow-sm'
                              : !item.read
                              ? 'bg-white border-blue-200/90 shadow-sm hover:shadow-md hover:border-blue-300'
                              : 'bg-white/80 border-gray-200/80 shadow-xs hover:shadow-sm hover:border-gray-300'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            {/* Checkbox + Icon + Message Body */}
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(item._id)}
                                className="w-4 h-4 mt-2.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                              />

                              {/* Visual Icon */}
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${iconBg} shadow-xs`}
                              >
                                <IconComponent className="w-5 h-5" />
                              </div>

                              {/* Main Info */}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span
                                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${badgeColor}`}
                                  >
                                    {badge}
                                  </span>

                                  {item.priority && item.priority !== 'normal' && (
                                    <span
                                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                                        statusColors[item.priority] || statusColors.normal
                                      }`}
                                    >
                                      {item.priority}
                                    </span>
                                  )}

                                  {!item.read && (
                                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 text-blue-700 bg-blue-100/80 rounded-full">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                                      New
                                    </span>
                                  )}

                                  {item.archived && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 text-gray-600 bg-gray-100 rounded-md border border-gray-200">
                                      Archived
                                    </span>
                                  )}
                                </div>

                                <h3
                                  className={`text-sm font-bold leading-snug cursor-pointer ${
                                    !item.read ? 'text-gray-900' : 'text-gray-700'
                                  }`}
                                  onClick={() => openItem(item)}
                                >
                                  {item.title}
                                </h3>

                                <p className="mt-1 text-xs text-gray-600 leading-relaxed max-w-3xl">
                                  {item.message}
                                </p>

                                {/* Footer Metadata */}
                                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-gray-400" />
                                    {formatRelativeTime(item.createdAt)} (
                                    {new Date(item.createdAt).toLocaleTimeString('en-IN', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                    )
                                  </span>

                                  {item.channels?.length > 0 && (
                                    <span>Channels: {item.channels.join(', ')}</span>
                                  )}

                                  {item.relatedId && (
                                    <span className="font-mono text-[10px] bg-gray-100 px-1.5 py-0.2 rounded text-gray-500">
                                      Ref: {String(item.relatedId).slice(-6)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                              {/* Open Deep Link Button */}
                              {item.actionUrl && (
                                <button
                                  type="button"
                                  onClick={() => openItem(item)}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all active:scale-95"
                                >
                                  <span>Open</span>
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}

                              {/* Toggle Read */}
                              {!item.read ? (
                                <button
                                  type="button"
                                  onClick={() => act(item, 'read')}
                                  title="Mark as read"
                                  className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => act(item, 'unread')}
                                  title="Mark as unread"
                                  className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors"
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Toggle Archive */}
                              {!item.archived ? (
                                <button
                                  type="button"
                                  onClick={() => act(item, 'archive')}
                                  title="Archive notification"
                                  className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => act(item, 'unarchive')}
                                  title="Unarchive notification"
                                  className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors"
                                >
                                  <ArchiveRestore className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => act(item, 'delete')}
                                title="Delete notification"
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl border border-rose-100 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="mt-6">
            <Pagination
              page={pagination.page}
              pages={pagination.pages}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={setPage}
              loading={loading}
            />
          </div>
        </>
      )}

      {/* Preferences Modal */}
      {prefsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 space-y-5 border border-gray-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Settings2 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-gray-900">Notification Preferences</h3>
              </div>
              <button
                type="button"
                onClick={() => setPrefsOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!prefs ? (
              <div className="h-44 bg-gray-100 animate-pulse rounded-2xl" />
            ) : (
              <div className="space-y-4 text-sm">
                <div className="p-3 bg-gray-50 rounded-2xl space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer font-semibold text-gray-900">
                    <span>Enable All Notifications</span>
                    <input
                      type="checkbox"
                      checked={Boolean(prefs.master)}
                      onChange={(e) => setPrefs((p) => ({ ...p, master: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer font-semibold text-gray-900">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-gray-500" />
                      Sound Alerts on Live Events
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(prefs.soundAlerts)}
                      onChange={(e) => setPrefs((p) => ({ ...p, soundAlerts: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>
                </div>

                {/* Delivery Channels */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Delivery Channels
                  </p>
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-2xl">
                    {Object.keys(prefs.channels || {}).map((key) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 capitalize text-xs font-semibold text-gray-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(prefs.channels[key])}
                          onChange={(e) =>
                            setPrefs((p) => ({
                              ...p,
                              channels: { ...p.channels, [key]: e.target.checked }
                            }))
                          }
                          className="w-3.5 h-3.5 text-blue-600 rounded"
                        />
                        {key.replace(/([A-Z])/g, ' $1')}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Event Categories */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Event Categories
                  </p>
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-2xl">
                    {Object.keys(prefs.categories || {}).map((key) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 capitalize text-xs font-semibold text-gray-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(prefs.categories[key])}
                          onChange={(e) =>
                            setPrefs((p) => ({
                              ...p,
                              categories: { ...p.categories, [key]: e.target.checked }
                            }))
                          }
                          className="w-3.5 h-3.5 text-blue-600 rounded"
                        />
                        {key}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={savingPrefs}
                    onClick={savePrefs}
                    className="w-full py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 disabled:opacity-60 transition-all active:scale-95"
                  >
                    {savingPrefs ? 'Saving…' : 'Save Notification Preferences'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
