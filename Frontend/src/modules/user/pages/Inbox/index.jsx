import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiBell, FiMessageCircle } from 'react-icons/fi';
import api from '../../../../services/api';

/**
 * Inbox — production empty state until booking chat list API is productized.
 * Surfaces unread notifications as the primary message center.
 */
const Inbox = () => {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/notifications/user', { params: { limit: 1, unreadOnly: true } });
        if (!cancelled && res.data?.success) {
          setUnread(res.data.unreadCount ?? res.data.pagination?.total ?? 0);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-brand-bg min-h-screen pb-[env(safe-area-inset-bottom)] pt-4 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 font-poppins">Inbox</h1>
      </div>

      <div className="w-full flex items-center bg-white rounded-full h-[50px] px-5 mb-8 shadow-sm">
        <FiSearch className="text-gray-400 mr-3" size={20} />
        <input
          type="text"
          placeholder="Search messages..."
          disabled
          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-400 placeholder-gray-400"
        />
      </div>

      <div className="flex flex-col items-center justify-center text-center px-6 py-16 bg-white rounded-3xl shadow-sm">
        <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center mb-4">
          <FiMessageCircle className="text-teal-600" size={28} />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">No chats yet</h2>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          Messages with technicians appear here during an active booking. Check notifications for updates.
        </p>
        {!loading && unread > 0 && (
          <p className="text-sm text-teal-700 font-medium mb-4">{unread} unread notification{unread === 1 ? '' : 's'}</p>
        )}
        <button
          type="button"
          onClick={() => navigate('/user/notifications')}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-teal-600 text-white text-sm font-semibold"
        >
          <FiBell size={16} /> Open notifications
        </button>
        <button
          type="button"
          onClick={() => navigate('/user/my-bookings')}
          className="mt-3 text-sm font-medium text-teal-700"
        >
          View my bookings
        </button>
      </div>
    </div>
  );
};

export default Inbox;
