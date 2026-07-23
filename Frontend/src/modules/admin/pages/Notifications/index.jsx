import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiBell, FiRefreshCw, FiCheck, FiCheckCircle, FiTrash2,
  FiDollarSign, FiUserCheck, FiSend, FiActivity
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import api from '../../../../services/api';
import adminNotificationService from '../../../../services/adminNotificationService';

const ROLE_OPTS = ['vendor', 'user', 'engineer', 'b2b', 'admin'];

const Notifications = () => {
  const [tab, setTab] = useState('inbox'); // inbox | announce | logs
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const [announceForm, setAnnounceForm] = useState({
    title: '',
    message: '',
    actionUrl: '',
    roles: ['vendor', 'user', 'engineer', 'b2b'],
    channels: ['in_app', 'push']
  });
  const [announcing, setAnnouncing] = useState(false);

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilter, setLogFilter] = useState({ eventKey: '', status: '', channel: '' });
  const [logPagination, setLogPagination] = useState({ page: 1, pages: 1, total: 0 });

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/notifications/admin', { params: { limit: 50 } });
      if (res.data.success) setNotifications(res.data.data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const params = { page, limit: 40 };
      if (logFilter.eventKey) params.eventKey = logFilter.eventKey;
      if (logFilter.status) params.status = logFilter.status;
      if (logFilter.channel) params.channel = logFilter.channel;
      const res = await adminNotificationService.getDeliveryLogs(params);
      if (res.success) {
        setLogs(res.data || []);
        setLogPagination(res.pagination || { page: 1, pages: 1, total: 0 });
      }
    } catch {
      toast.error('Failed to load delivery logs');
    } finally {
      setLogsLoading(false);
    }
  }, [logFilter]);

  useEffect(() => {
    if (tab === 'inbox') fetchNotifications();
    if (tab === 'logs') fetchLogs(1);
  }, [tab, fetchNotifications, fetchLogs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (tab === 'inbox') await fetchNotifications();
    if (tab === 'logs') await fetchLogs(logPagination.page || 1);
    setRefreshing(false);
    toast.success('Refreshed');
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const deleteNotification = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
      toast.success('Notification deleted');
    } catch {
      toast.error('Failed to delete notification');
    }
  };

  const submitAnnounce = async (e) => {
    e.preventDefault();
    if (!announceForm.title.trim() || !announceForm.message.trim()) {
      toast.error('Title and message are required');
      return;
    }
    setAnnouncing(true);
    try {
      const res = await adminNotificationService.announce({
        title: announceForm.title.trim(),
        message: announceForm.message.trim(),
        actionUrl: announceForm.actionUrl.trim() || null,
        roles: announceForm.roles,
        channels: announceForm.channels
      });
      if (res.success) {
        toast.success('Announcement queued');
        setAnnounceForm((f) => ({ ...f, title: '', message: '', actionUrl: '' }));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Announce failed');
    } finally {
      setAnnouncing(false);
    }
  };

  const toggleRole = (role) => {
    setAnnounceForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role]
    }));
  };

  const getIcon = (type) => {
    switch (type) {
      case 'vendor_withdrawal_request':
        return <FiDollarSign className="text-green-500" />;
      case 'vendor_approval_request':
      case 'vendor_registered':
        return <FiUserCheck className="text-blue-500" />;
      case 'vendor_cash_limit_exceeded':
        return <FiDollarSign className="text-red-500" />;
      default:
        return <FiBell className="text-gray-500" />;
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'read') return n.isRead;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const statusColor = (s) => {
    if (s === 'sent') return 'bg-emerald-100 text-emerald-700';
    if (s === 'failed') return 'bg-red-100 text-red-700';
    if (s === 'skipped') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <FiBell className="text-blue-600 text-lg" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Notifications</h1>
              <p className="text-xs text-gray-500">
                Inbox, system announce, and delivery audit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={refreshing}
          >
            <FiRefreshCw className={`text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          {[
            { id: 'inbox', label: 'Inbox', icon: FiBell },
            { id: 'announce', label: 'Announce', icon: FiSend },
            { id: 'logs', label: 'Delivery logs', icon: FiActivity }
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 ${
                tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <t.icon className="text-sm" />
              {t.label}
              {t.id === 'inbox' && unreadCount > 0 && (
                <span className={`ml-1 px-1.5 rounded-full text-[10px] ${tab === t.id ? 'bg-white/20' : 'bg-blue-100 text-blue-700'}`}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'inbox' && (
        <>
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {['all', 'unread', 'read'].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                    filter === f ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg flex items-center gap-1"
                >
                  <FiCheckCircle className="text-sm" />
                  Mark All Read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Delete all notifications?')) return;
                    try {
                      await api.delete('/notifications/delete-all');
                      setNotifications([]);
                      toast.success('All notifications cleared');
                    } catch {
                      toast.error('Failed to clear notifications');
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1"
                >
                  <FiTrash2 className="text-sm" />
                  Clear All
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                <p className="text-xs text-gray-500 mt-2">Loading notifications...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <FiBell className="text-4xl text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No notifications found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                <AnimatePresence>
                  {filteredNotifications.map((notification) => (
                    <motion.div
                      key={notification._id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={`p-4 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                        !notification.isRead ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        {getIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={`text-sm ${!notification.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                              {notification.title}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
                          </div>
                          <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          {!notification.isRead && (
                            <button
                              type="button"
                              onClick={() => markAsRead(notification._id)}
                              className="text-[10px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <FiCheck className="text-xs" />
                              Mark as read
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteNotification(notification._id)}
                            className="text-[10px] font-semibold text-red-500 hover:underline flex items-center gap-1"
                          >
                            <FiTrash2 className="text-xs" />
                            Delete
                          </button>
                        </div>
                      </div>
                      {!notification.isRead && <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-2" />}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'announce' && (
        <form onSubmit={submitAnnounce} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
            <input
              value={announceForm.title}
              onChange={(e) => setAnnounceForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Maintenance window"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Message</label>
            <textarea
              value={announceForm.message}
              onChange={(e) => setAnnounceForm((f) => ({ ...f, message: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[100px]"
              placeholder="Platform downtime Sunday 2–4 AM IST"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Deep link (optional)</label>
            <input
              value={announceForm.actionUrl}
              onChange={(e) => setAnnounceForm((f) => ({ ...f, actionUrl: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="/status"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Audiences</label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTS.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                    announceForm.roles.includes(role)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={announcing}
            className="px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
          >
            <FiSend />
            {announcing ? 'Sending…' : 'Send announcement'}
          </button>
        </form>
      )}

      {tab === 'logs' && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-wrap gap-2">
            <input
              value={logFilter.eventKey}
              onChange={(e) => setLogFilter((f) => ({ ...f, eventKey: e.target.value }))}
              placeholder="eventKey"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs"
            />
            <select
              value={logFilter.status}
              onChange={(e) => setLogFilter((f) => ({ ...f, status: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs"
            >
              <option value="">All statuses</option>
              {['queued', 'sent', 'failed', 'skipped', 'read'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={logFilter.channel}
              onChange={(e) => setLogFilter((f) => ({ ...f, channel: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs"
            >
              <option value="">All channels</option>
              {['in_app', 'push', 'email', 'sms', 'whatsapp'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => fetchLogs(1)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 text-white rounded-lg"
            >
              Apply
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {logsLoading ? (
              <div className="p-8 text-center text-xs text-gray-500">Loading logs…</div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No delivery logs</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 font-semibold">When</th>
                      <th className="px-3 py-2 font-semibold">Event</th>
                      <th className="px-3 py-2 font-semibold">Role</th>
                      <th className="px-3 py-2 font-semibold">Channel</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Title</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {logs.map((log) => (
                      <tr key={log._id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                          {log.createdAt
                            ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                            : '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px]">{log.eventKey}</td>
                        <td className="px-3 py-2">{log.recipientRole}</td>
                        <td className="px-3 py-2">{log.channel}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded font-semibold ${statusColor(log.status)}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 max-w-[220px] truncate" title={log.message}>
                          {log.title}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {logPagination.pages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-xs">
                <span className="text-slate-500">{logPagination.total} total</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={logPagination.page <= 1}
                    onClick={() => fetchLogs(logPagination.page - 1)}
                    className="px-2 py-1 border rounded disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="px-2 py-1">
                    {logPagination.page} / {logPagination.pages}
                  </span>
                  <button
                    type="button"
                    disabled={logPagination.page >= logPagination.pages}
                    onClick={() => fetchLogs(logPagination.page + 1)}
                    className="px-2 py-1 border rounded disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default Notifications;
