import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell } from 'react-icons/fi';
import api from '../../../../services/api';

const NotificationBell = ({ notificationCount = 0 }) => {
  const navigate = useNavigate();
  const [count, setCount] = useState(notificationCount);

  // Sync prop changes
  useEffect(() => {
    if (typeof notificationCount !== 'undefined') {
      setCount(notificationCount);
    }
  }, [notificationCount]);

  // Fetch unread count on mount and periodically
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
        if (!token) return;

        const res = await api.get('/notifications/user');
        if (res.data && res.data.success && typeof res.data.unreadCount === 'number') {
          setCount(res.data.unreadCount);
        }
      } catch (error) {
        // Silent fail if not logged in
      }
    };

    fetchUnreadCount();

    // Listen for real-time notification events
    const handleNotificationUpdate = () => fetchUnreadCount();
    window.addEventListener('userNotificationsUpdated', handleNotificationUpdate);
    window.addEventListener('appNotificationReceived', handleNotificationUpdate);

    const interval = setInterval(fetchUnreadCount, 60000);
    return () => {
      window.removeEventListener('userNotificationsUpdated', handleNotificationUpdate);
      window.removeEventListener('appNotificationReceived', handleNotificationUpdate);
      clearInterval(interval);
    };
  }, []);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate('/user/notifications');
      }}
      className="relative w-10 h-10 rounded-full bg-white border-2 border-[#00a6a6] flex items-center justify-center text-[#00a6a6] hover:bg-teal-50/50 active:scale-95 transition-all shadow-sm shrink-0"
      aria-label="Notifications"
      title="Notifications"
    >
      <FiBell className="w-5 h-5 text-[#00a6a6]" />

      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center border-2 border-white shadow-md"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
};

export default NotificationBell;
