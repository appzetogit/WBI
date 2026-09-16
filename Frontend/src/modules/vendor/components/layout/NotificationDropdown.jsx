import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  Briefcase,
  Building2,
  CheckCircle2,
  XCircle,
  Wrench,
  Activity,
  Wallet,
  Landmark,
  ShieldCheck,
  FileText,
  AlertCircle,
  HelpCircle,
  Clock,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import {
  fetchGlobalNotifications,
  updateGlobalNotification,
  markAllNotificationsRead
} from '../../services/globalModulesService';

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
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
};

// Canonical Event Icon and Style Resolver
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
        badge: 'User Project',
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
      };
    case 'NEW_B2B_JOB':
    case 'CLIENT_REQUEST':
    case 'OPPORTUNITY_NEW':
    case 'NEW_OPPORTUNITY':
      return {
        icon: Building2,
        iconBg: 'bg-indigo-500/10 text-indigo-600 border-indigo-200',
        badge: 'B2B Job',
        badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200'
      };
    case 'JOB_ACCEPTED':
    case 'BOOKING_ACCEPTED':
    case 'OPS_JOB_ACCEPTED':
      return {
        icon: CheckCircle2,
        iconBg: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
        badge: 'Accepted',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      };
    case 'JOB_REJECTED':
    case 'BOOKING_CANCELLED':
    case 'OPS_JOB_REJECTED':
      return {
        icon: XCircle,
        iconBg: 'bg-rose-500/10 text-rose-600 border-rose-200',
        badge: 'Rejected',
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
        badge: 'Status Update',
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200'
      };
    case 'JOB_COMPLETED':
    case 'BOOKING_COMPLETED':
    case 'OPS_JOB_COMPLETED':
    case 'WORKER_COMPLETED':
      return {
        icon: ShieldCheck,
        iconBg: 'bg-teal-500/10 text-teal-600 border-teal-200',
        badge: 'Completed',
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
        badge: 'Payout Settled',
        badgeColor: 'bg-purple-50 text-purple-700 border-purple-200'
      };
    default:
      if (module === 'finance') {
        return {
          icon: Wallet,
          iconBg: 'bg-green-500/10 text-green-600 border-green-200',
          badge: 'Finance',
          badgeColor: 'bg-green-50 text-green-700 border-green-200'
        };
      }
      if (module === 'support') {
        return {
          icon: HelpCircle,
          iconBg: 'bg-sky-500/10 text-sky-600 border-sky-200',
          badge: 'Support',
          badgeColor: 'bg-sky-50 text-sky-700 border-sky-200'
        };
      }
      return {
        icon: Bell,
        iconBg: 'bg-gray-500/10 text-gray-600 border-gray-200',
        badge: module || 'System',
        badgeColor: 'bg-gray-100 text-gray-700 border-gray-200'
      };
  }
};

const resolveDeepLink = (basePath, actionUrl) => {
  if (!actionUrl) return `${basePath}/notifications`;
  if (actionUrl.startsWith('http')) return actionUrl;
  if (actionUrl.startsWith('/vendor/')) return actionUrl;
  const rest = String(actionUrl).replace(/^\//, '');
  return `${basePath}/${rest}`;
};

const NotificationDropdown = () => {
  const navigate = useNavigate();
  const { basePath } = useVendorBasePath();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const dropdownRef = useRef(null);

  const fetchRecent = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchGlobalNotifications({ page: 1, limit: 6 });
      if (res?.data?.data) {
        setNotifications(res.data.data);
      }
      if (typeof res?.data?.meta?.unreadCount === 'number') {
        setUnreadCount(res.data.meta.unreadCount);
      }
    } catch (err) {
      console.warn('[NotificationDropdown] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  // Listen for socket / window notification sync events
  useEffect(() => {
    const handleUpdate = () => {
      fetchRecent();
    };
    window.addEventListener('vendorNotificationsUpdated', handleUpdate);
    return () => window.removeEventListener('vendorNotificationsUpdated', handleUpdate);
  }, [fetchRecent]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      fetchRecent();
    }
  };

  const handleMarkAllRead = async (e) => {
    e.stopPropagation();
    try {
      setMarkingAll(true);
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      window.dispatchEvent(new CustomEvent('vendorNotificationsUpdated'));
    } catch (err) {
      console.warn('[NotificationDropdown] mark all read failed:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleItemClick = async (item) => {
    if (!item.read) {
      try {
        await updateGlobalNotification(item._id, { action: 'read' });
        setNotifications((prev) =>
          prev.map((n) => (n._id === item._id ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        window.dispatchEvent(new CustomEvent('vendorNotificationsUpdated'));
      } catch (err) {
        console.warn('[NotificationDropdown] item read failed:', err);
      }
    }
    setIsOpen(false);
    const link = resolveDeepLink(basePath, item.actionUrl);
    if (link.startsWith('http')) {
      window.open(link, '_blank');
    } else {
      navigate(link);
    }
  };

  const handleViewAll = () => {
    setIsOpen(false);
    navigate(`${basePath}/notifications`);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Open notifications dropdown"
        aria-expanded={isOpen}
        className={`relative p-2.5 rounded-xl transition-all duration-200 focus:outline-none ${
          isOpen
            ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500/20'
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/80 active:scale-95'
        }`}
      >
        <Bell className="w-5 h-5 transition-transform group-hover:scale-105" />

        {/* Dynamic Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center px-1 text-[10px] font-black text-white bg-rose-500 rounded-full shadow-sm ring-2 ring-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 z-50 overflow-hidden border border-gray-100 origin-top-right transform transition-all">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600 text-white shadow-sm">
                <Bell className="w-3.5 h-3.5" />
              </span>
              <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-bold text-blue-700 bg-blue-100 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark read</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-50">
            {loading && notifications.length === 0 ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-9 h-9 bg-gray-200 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-1.5 py-1">
                      <div className="h-3.5 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-5/6" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                  <Bell className="w-6 h-6 stroke-[1.5]" />
                </div>
                <p className="text-sm font-bold text-gray-800">All caught up!</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  No new operational notifications at the moment.
                </p>
              </div>
            ) : (
              notifications.map((item) => {
                const { icon: IconComponent, iconBg, badge, badgeColor } = getEventVisuals(
                  item.type,
                  item.module
                );
                return (
                  <div
                    key={item._id}
                    onClick={() => handleItemClick(item)}
                    className={`group relative flex items-start gap-3 p-3.5 cursor-pointer transition-colors hover:bg-blue-50/40 ${
                      !item.read ? 'bg-blue-50/20' : 'bg-white'
                    }`}
                  >
                    {/* Unread Indicator Dot */}
                    {!item.read && (
                      <span className="absolute left-1.5 top-5 w-1.5 h-1.5 rounded-full bg-blue-600 ring-2 ring-blue-100" />
                    )}

                    {/* Icon */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${iconBg}`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>

                    {/* Text Body */}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${badgeColor}`}
                        >
                          {badge}
                        </span>
                        <span className="text-[11px] text-gray-400 font-medium shrink-0 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-300" />
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>

                      <p
                        className={`text-xs leading-snug line-clamp-1 ${
                          !item.read ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'
                        }`}
                      >
                        {item.title}
                      </p>

                      <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5 leading-relaxed">
                        {item.message}
                      </p>
                    </div>

                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-600 transition-colors shrink-0 mt-3" />
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-gray-50/90 border-t border-gray-100">
            <button
              type="button"
              onClick={handleViewAll}
              className="w-full py-2 px-3 text-xs font-bold text-center text-blue-600 hover:text-blue-700 hover:bg-blue-100/50 rounded-xl transition-all flex items-center justify-center gap-1.5"
            >
              <span>View all notifications</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
