import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiCheck, FiX, FiTrash2, FiBriefcase, FiCreditCard, FiInfo } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications
} from '../../services/notificationService';

const Notifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [filter, setFilter] = useState('All'); // All, Jobs, Payments, Alerts

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await getNotifications();
      setNotifications(data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    const handleUpdate = () => fetchNotifications();
    window.addEventListener('vendorNotificationsUpdated', handleUpdate);

    return () => {
      window.removeEventListener('vendorNotificationsUpdated', handleUpdate);
    };
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      toast.success('Notification marked as read');
    } catch (error) {
      console.error('Failed to mark as read', error);
      toast.error('Failed to mark as read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success('All marked as read');
    } catch (error) {
      console.error('Failed to mark all as read', error);
      toast.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success('Notification removed');
    } catch (error) {
      console.error('Failed to delete notification', error);
      toast.error('Failed to delete');
    }
  };

  const confirmClearAll = async () => {
    try {
      await deleteAllNotifications();
      setNotifications([]);
      toast.success('All notifications cleared');
      setShowClearConfirm(false);
    } catch (error) {
      console.error('Failed to clear notifications', error);
      toast.error('Failed to clear');
      setShowClearConfirm(false);
    }
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filter === 'All') return true;
    const type = (notif.type || '').toLowerCase();
    if (filter === 'Payments') return ['payment_', 'payout_', 'wallet_', 'refund_', 'settlement'].some(prefix => type.includes(prefix));
    if (filter === 'Jobs') return ['booking_', 'job_', 'worker_', 'visit_', 'work_', 'journey_', 'vendor_', 'service'].some(prefix => type.includes(prefix));
    if (filter === 'Alerts') return ['alert', 'general', 'security', 'account'].some(prefix => type.includes(prefix));
    return type === filter.toLowerCase();
  });

  const getNotificationIcon = (originalType) => {
    const type = (originalType || '').toLowerCase();
    if (['payment', 'refund', 'wallet', 'payout', 'settlement'].some(t => type.includes(t))) return <FiCreditCard className="w-5 h-5" />;
    if (['booking', 'job', 'work', 'visit', 'journey', 'vendor', 'service'].some(t => type.includes(t))) return <FiBriefcase className="w-5 h-5" />;
    if (['alert', 'general', 'security'].some(t => type.includes(t))) return <FiInfo className="w-5 h-5" />;
    return <FiBell className="w-5 h-5" />;
  };

  const getNotificationColor = (originalType) => {
    const type = (originalType || '').toLowerCase();
    if (['payment', 'refund', 'wallet', 'payout', 'settlement'].some(t => type.includes(t))) return 'bg-emerald-50 text-emerald-500 border-emerald-100';
    if (['booking', 'job', 'work', 'visit', 'journey', 'vendor', 'service'].some(t => type.includes(t))) return 'bg-blue-50 text-blue-500 border-blue-100';
    if (['alert', 'general', 'security'].some(t => type.includes(t))) return 'bg-amber-50 text-amber-500 border-amber-100';
    return 'bg-slate-50 text-slate-500 border-slate-100';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-[#00a78e]/30 border-t-[#00a78e] rounded-full animate-spin"></div>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Notifications</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Stay updated with your latest alerts, payments, and jobs.</p>
        </div>
        <div className="flex items-center space-x-3">
          {unreadCount > 0 && (
            <button 
              onClick={handleMarkAllRead}
              className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold text-[13px] rounded-xl hover:bg-slate-50 transition-colors flex items-center shadow-sm"
            >
              <FiCheck className="mr-2" /> Mark All as Read
            </button>
          )}
          {notifications.length > 0 && (
            <button 
              onClick={() => setShowClearConfirm(true)}
              className="px-5 py-2.5 bg-rose-50 text-rose-600 font-bold text-[13px] rounded-xl hover:bg-rose-100 transition-all border border-rose-100 flex items-center"
            >
              <FiTrash2 className="mr-2" /> Clear All
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-200 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center space-x-2 overflow-x-auto no-scrollbar bg-slate-50/50">
          {['All', 'Jobs', 'Payments', 'Alerts'].map(f => (
            <button 
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-[13px] font-bold rounded-lg transition-colors whitespace-nowrap ${
                filter === f 
                ? 'bg-[#00a78e] text-white shadow-sm' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {f} {f === 'All' && unreadCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-white/20">{unreadCount}</span>}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="flex-1 min-h-[400px]">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-12">
              <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-4 border border-slate-100 shadow-inner">
                <FiBell className="w-10 h-10" />
              </div>
              <h3 className="text-[17px] font-bold text-[#0f172a] mb-1">No Notifications</h3>
              <p className="text-[14px] text-slate-500 max-w-xs">You're all caught up! New updates regarding your services and wallet will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredNotifications.map((notif) => (
                <div 
                  key={notif.id} 
                  className={`group relative p-6 transition-all hover:bg-slate-50 ${!notif.read ? 'bg-emerald-50/20' : ''}`}
                >
                  {/* Unread Indicator */}
                  {!notif.read && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#00a78e]"></div>
                  )}

                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${getNotificationColor(notif.type)}`}>
                      {getNotificationIcon(notif.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0 pr-16">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className={`text-[15px] text-[#0f172a] truncate ${!notif.read ? 'font-black' : 'font-bold'}`}>
                          {notif.title}
                        </h4>
                        <span className="text-[12px] font-medium text-slate-400 shrink-0 ml-4">
                          {notif.time || (notif.createdAt && new Date(notif.createdAt).toLocaleString())}
                        </span>
                      </div>
                      
                      <p className={`text-[14px] leading-relaxed mb-3 ${!notif.read ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
                        {notif.message}
                      </p>

                      {/* Action Links */}
                      {(notif.action || notif.relatedType === 'booking' || notif.type === 'payout_requested') && (
                        <button
                          onClick={() => {
                            if (notif.relatedType === 'booking' && notif.relatedId) navigate(`/vendor/booking/${notif.relatedId}`);
                            else if (notif.action === 'view_booking' && notif.bookingId) navigate(`/vendor/booking/${notif.bookingId}`);
                            else if (notif.action === 'view_wallet') navigate('/vendor/digital-solution/earnings');
                          }}
                          className="inline-flex items-center text-[13px] font-bold text-[#00a78e] hover:text-[#008f79] transition-colors"
                        >
                          View Details
                          <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Hover Actions */}
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!notif.read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notif.id); }}
                        className="w-8 h-8 rounded-full bg-white border border-emerald-200 text-emerald-500 flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-300 transition-colors shadow-sm"
                        title="Mark as read"
                      >
                        <FiCheck className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(e, notif.id)}
                      className="w-8 h-8 rounded-full bg-white border border-rose-200 text-rose-500 flex items-center justify-center hover:bg-rose-50 hover:border-rose-300 transition-colors shadow-sm"
                      title="Delete"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-scale-in">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4 border border-rose-100">
                <FiTrash2 className="w-8 h-8 text-rose-500" />
              </div>
              <h3 className="text-[19px] font-black text-[#0f172a]">Clear All Notifications?</h3>
              <p className="text-[14px] text-slate-500 mt-2">This action cannot be undone and will remove all your notification history.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="py-2.5 rounded-xl text-[14px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearAll}
                className="py-2.5 rounded-xl text-[14px] font-bold text-white bg-rose-500 hover:bg-rose-600 shadow-[0_4px_12px_rgba(244,63,94,0.25)] transition-all"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
