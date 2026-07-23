import React, { useCallback, useEffect, useState } from 'react';
import { FiBell, FiCheck, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../services/api';

const B2BNotifications = () => {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications/b2b', { params: { limit: 50 } });
      setItems(res.data?.data || []);
      setUnreadCount(res.data?.unreadCount || 0);
    } catch {
      setItems([]);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onUpd = () => load();
    window.addEventListener('b2bNotificationsUpdated', onUpd);
    return () => window.removeEventListener('b2bNotificationsUpdated', onUpd);
  }, [load]);

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      load();
    } catch {
      toast.error('Failed to mark read');
    }
  };

  const markAll = async () => {
    try {
      await api.put('/notifications/read-all');
      load();
      toast.success('All marked as read');
    } catch {
      toast.error('Failed');
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Delete all notifications?')) return;
    try {
      await api.delete('/notifications/delete-all');
      load();
    } catch {
      toast.error('Failed');
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FiBell className="text-teal-600" /> Notifications
            {unreadCount > 0 && (
              <span className="text-xs font-bold bg-teal-600 text-white px-2 py-0.5 rounded-full">{unreadCount}</span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-1">Quotes, invoices, project updates and support</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={markAll} className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
            <FiCheck /> Read all
          </button>
          <button type="button" onClick={clearAll} className="px-3 py-2 text-xs font-semibold border border-red-100 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-1">
            <FiTrash2 /> Clear
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl">
          <FiBell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No notifications yet</p>
          <p className="text-sm text-slate-400 mt-1">You will see real-time updates here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <button
              key={n._id}
              type="button"
              onClick={() => !n.isRead && markRead(n._id)}
              className={`w-full text-left p-4 rounded-xl border transition ${
                n.isRead ? 'bg-white border-slate-100' : 'bg-teal-50/50 border-teal-100'
              }`}
            >
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{n.title}</p>
                  <p className="text-sm text-slate-600 mt-1">{n.message}</p>
                  <p className="text-[11px] text-slate-400 mt-2">{new Date(n.createdAt).toLocaleString('en-IN')}</p>
                </div>
                {!n.isRead && <span className="h-2 w-2 rounded-full bg-teal-500 mt-1.5 shrink-0" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default B2BNotifications;
