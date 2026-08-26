import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiUser, FiBriefcase, FiUsers, FiShoppingBag, FiDollarSign, FiActivity } from 'react-icons/fi';
import RevenueLineChart from '../../components/dashboard/RevenueLineChart';
import BookingsBarChart from '../../components/dashboard/BookingsBarChart';
import BookingStatusPieChart from '../../components/dashboard/BookingStatusPieChart';
import PaymentBreakdownPieChart from '../../components/dashboard/PaymentBreakdownPieChart';
import RevenueVsBookingsChart from '../../components/dashboard/RevenueVsBookingsChart';
import TimePeriodFilter from '../../components/dashboard/TimePeriodFilter';
import { formatCurrency } from '../../utils/adminHelpers';
import CustomerGrowthAreaChart from '../../components/dashboard/CustomerGrowthAreaChart';
import TopServices from '../../components/dashboard/TopServices';
import RecentBookings from '../../components/dashboard/RecentBookings';
import {
  getDashboardStats,
  getRevenueAnalytics,
  getBookingTrends
} from '../../../../services/adminDashboardService';

/**
 * Generate a continuous array of dates/months in the range with initial 0 metrics
 */
const generateTimelineBuckets = (startDate, endDate, period) => {
  const buckets = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (period === 'year') {
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (current <= endMonth) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const key = `${yyyy}-${mm}`;
      const label = current.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      buckets.push({
        date: key,
        dateLabel: label,
        revenue: 0,
        orders: 0,
        bookings: 0,
        completed: 0,
        cancelled: 0
      });
      current.setMonth(current.getMonth() + 1);
    }
  } else {
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(23, 59, 59, 999);

    while (current <= endDay) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      const label = current.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      buckets.push({
        date: key,
        dateLabel: label,
        revenue: 0,
        orders: 0,
        bookings: 0,
        completed: 0,
        cancelled: 0
      });
      current.setDate(current.getDate() + 1);
    }
  }
  return buckets;
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('month');
  const [customDates, setCustomDates] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [timelineData, setTimelineData] = useState([]);
  const [recentBookingsList, setRecentBookingsList] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalVendors: 0,
    totalWorkers: 0,
    activeBookings: 0,
    completedBookings: 0,
    totalRevenue: 0,
    platformCommission: 0,
    todayRevenue: 0,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        // 1. Calculate Start & End Dates
        let apiPeriod = 'daily';
        let startDate = new Date();
        let endDate = new Date();

        if (period === 'year') {
          apiPeriod = 'monthly';
          startDate = new Date(startDate.getFullYear() - 1, startDate.getMonth(), 1);
        } else if (period === 'week') {
          apiPeriod = 'daily';
          startDate.setDate(startDate.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
        } else if (period === 'month') {
          apiPeriod = 'daily';
          startDate.setDate(startDate.getDate() - 30);
          startDate.setHours(0, 0, 0, 0);
        } else if (period === 'custom') {
          apiPeriod = 'daily';
          startDate = new Date(customDates.start);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(customDates.end);
          endDate.setHours(23, 59, 59, 999);
        } else {
          // today
          apiPeriod = 'daily';
          startDate.setHours(0, 0, 0, 0);
          endDate.setHours(23, 59, 59, 999);
        }

        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();

        // 2. Concurrently fetch stats, revenue analytics, and booking trends
        const [statsRes, revRes, trendsRes] = await Promise.all([
          getDashboardStats({ startDate: startIso, endDate: endIso }).catch(err => {
            console.error('Stats fetch error:', err);
            return { success: false };
          }),
          getRevenueAnalytics({ period: apiPeriod, startDate: startIso, endDate: endIso }).catch(err => {
            console.error('Revenue fetch error:', err);
            return { success: false };
          }),
          getBookingTrends({ period: apiPeriod, startDate: startIso, endDate: endIso }).catch(err => {
            console.error('Trends fetch error:', err);
            return { success: false };
          })
        ]);

        if (!isMounted) return;

        // 3. Process Stats & Recent Bookings
        if (statsRes?.success && statsRes.data?.stats) {
          const s = statsRes.data.stats;
          setStats({
            totalUsers: s.totalUsers || 0,
            totalVendors: s.totalVendors || 0,
            totalWorkers: s.totalWorkers || 0,
            activeBookings: s.pendingBookings || 0,
            completedBookings: s.completedBookings || 0,
            totalRevenue: s.totalRevenue || 0,
            platformCommission: s.platformCommission || 0,
            todayRevenue: 0,
          });
          setRecentBookingsList(statsRes.data.recentBookings || []);
        }

        // 4. Generate continuous timeline and overlay revenue & booking trends
        const buckets = generateTimelineBuckets(startDate, endDate, period);
        const bucketMap = new Map();
        buckets.forEach(b => bucketMap.set(b.date, { ...b }));

        // Overlay Revenue
        if (revRes?.success && Array.isArray(revRes.data?.revenueData)) {
          revRes.data.revenueData.forEach(item => {
            if (bucketMap.has(item._id)) {
              const b = bucketMap.get(item._id);
              b.revenue = Number(item.revenue || 0);
            }
          });
        }

        // Overlay Booking Trends
        if (trendsRes?.success && Array.isArray(trendsRes.data?.trends)) {
          trendsRes.data.trends.forEach(item => {
            if (bucketMap.has(item._id)) {
              const b = bucketMap.get(item._id);
              b.orders = Number(item.count || 0);
              b.bookings = Number(item.count || 0);
              b.completed = Number(item.completed || 0);
              b.cancelled = Number(item.cancelled || 0);
            }
          });
        }

        const mergedTimeline = Array.from(bucketMap.values());
        setTimelineData(mergedTimeline);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [period, customDates.start, customDates.end]);

  const handleExportCsv = () => {
    try {
      const rows = timelineData.map((r) => ({
        date: r.date,
        bookings: r.orders || 0,
        completed: r.completed || 0,
        cancelled: r.cancelled || 0,
        revenue: r.revenue || 0,
      }));

      const headers = ['date', 'bookings', 'completed', 'cancelled', 'revenue'];
      const csv = [
        headers.join(','),
        ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin_dashboard_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('CSV export failed', e);
      alert('Export failed.');
    }
  };

  const onViewBooking = (booking) => {
    if (booking?._id || booking?.id) navigate(`/admin/bookings/${booking._id || booking.id}`);
  };

  const statsCards = [
    {
      title: period === 'month' ? 'Monthly Revenue' : period === 'year' ? 'Yearly Revenue' : period === 'today' ? 'Today\'s Revenue' : period === 'week' ? 'Weekly Revenue' : 'Revenue',
      value: formatCurrency(stats.totalRevenue || 0),
      change: 0,
      icon: FiDollarSign,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-green-500 to-emerald-600',
      cardBg: 'bg-gradient-to-br from-green-50 to-emerald-50',
      iconBg: 'bg-white/20',
      link: '/admin/reports/revenue'
    },
    {
      title: 'Pending Bookings',
      value: (stats.activeBookings || 0).toLocaleString(),
      change: 0,
      icon: FiShoppingBag,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-blue-500 to-indigo-600',
      cardBg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
      iconBg: 'bg-white/20',
      link: '/admin/reports/bookings'
    },
    {
      title: 'Completed Bookings',
      value: (stats.completedBookings || 0).toLocaleString(),
      change: 0,
      icon: FiActivity,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-purple-500 to-violet-600',
      cardBg: 'bg-gradient-to-br from-purple-50 to-violet-50',
      iconBg: 'bg-white/20',
      link: '/admin/reports/bookings'
    },
    {
      title: 'New Users',
      value: (stats.totalUsers || 0).toLocaleString(),
      change: 0,
      icon: FiUser,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-orange-500 to-amber-600',
      cardBg: 'bg-gradient-to-br from-orange-50 to-amber-50',
      iconBg: 'bg-white/20',
      link: '/admin/users/analytics'
    },
    {
      title: 'New Vendors',
      value: (stats.totalVendors || 0).toLocaleString(),
      change: 0,
      icon: FiBriefcase,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-teal-500 to-cyan-600',
      cardBg: 'bg-gradient-to-br from-teal-50 to-cyan-50',
      iconBg: 'bg-white/20',
      link: '/admin/vendors/analytics'
    },
    {
      title: 'New Workers',
      value: (stats.totalWorkers || 0).toLocaleString(),
      change: 0,
      icon: FiUsers,
      color: 'text-white',
      bgColor: 'bg-gradient-to-br from-rose-500 to-pink-600',
      cardBg: 'bg-gradient-to-br from-rose-50 to-pink-50',
      iconBg: 'bg-white/20',
      link: '/admin/workers/analytics'
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex flex-col gap-3">
        <div className="w-full">
          <TimePeriodFilter
            selectedPeriod={period}
            onPeriodChange={setPeriod}
            onExport={handleExportCsv}
            customDates={customDates}
            onCustomDateChange={setCustomDates}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statsCards.map((card, index) => {
          const Icon = card.icon;
          const isPositive = (card.change || 0) >= 0;

          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              onClick={() => card.link && navigate(card.link)}
              className={`${card.cardBg} rounded-xl p-3 sm:p-4 shadow-sm border border-transparent hover:shadow-md transition-all duration-300 relative overflow-hidden cursor-pointer group`}
            >
              <div className={`absolute top-0 right-0 w-24 h-24 ${card.bgColor} opacity-10 rounded-full -mr-12 -mt-12 group-hover:scale-110 transition-transform`} />

              <div className="flex items-center justify-between mb-2 sm:mb-3 relative z-10">
                <div className={`${card.bgColor} ${card.iconBg} p-1.5 sm:p-2 rounded-lg shadow-sm`}>
                  <Icon className={`${card.color} text-base sm:text-lg`} />
                </div>
                {card.change !== 0 && (
                  <div
                    className={`text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded-full ${isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                  >
                    {isPositive ? '+' : ''}
                    {Math.abs(card.change || 0)}%
                  </div>
                )}
              </div>

              <div className="relative z-10">
                <h3 className="text-gray-600 text-[10px] sm:text-xs font-medium mb-0.5">{card.title}</h3>
                <p className="text-gray-800 text-lg sm:text-xl font-bold">{card.value}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueLineChart data={timelineData} />
        <BookingsBarChart data={timelineData} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BookingStatusPieChart bookings={recentBookingsList} />
        <PaymentBreakdownPieChart bookings={recentBookingsList} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <RevenueVsBookingsChart data={timelineData} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <CustomerGrowthAreaChart timelineData={timelineData} bookings={recentBookingsList} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopServices
          bookings={recentBookingsList}
          periodLabel="Top Booked Services (Recent)"
        />
        <RecentBookings bookings={recentBookingsList} onViewBooking={onViewBooking} />
      </div>
    </motion.div>
  );
};

export default AdminDashboard;


