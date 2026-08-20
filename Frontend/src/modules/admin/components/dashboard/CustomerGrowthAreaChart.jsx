import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const getCustomerKey = (booking) => {
  const phone = booking?.user?.phone;
  const email = booking?.user?.email;
  const name = booking?.user?.name;
  return phone || email || name || booking?.userId || null;
};

const CustomerGrowthAreaChart = ({ timelineData = [], bookings = [] }) => {
  const customerData = useMemo(() => {
    const byDate = new Map();
    bookings.forEach((b) => {
      const createdAt = b.createdAt || b.acceptedAt || b.assignedAt || b.visitedAt || b.completedAt;
      if (!createdAt) return;
      const dateKey = new Date(createdAt).toISOString().slice(0, 10);
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey).push(b);
    });

    const seen = new Set();
    let cumulative = 0;

    return (timelineData || []).map((d) => {
      const dayBookings = byDate.get(d.date) || [];
      let newCustomers = 0;
      dayBookings.forEach((b) => {
        const k = getCustomerKey(b);
        if (!k) return;
        if (!seen.has(k)) {
          seen.add(k);
          newCustomers += 1;
        }
      });
      cumulative += newCustomers;
      return {
        date: d.date,
        dateLabel: d.dateLabel || d.date,
        customers: cumulative,
        newCustomers,
      };
    });
  }, [timelineData, bookings]);

  const maxCustomers = useMemo(() => {
    return Math.max(0, ...customerData.map(d => d.customers));
  }, [customerData]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
        <p className="text-sm font-semibold text-gray-800 mb-1">{label}</p>
        <p className="text-sm text-pink-600 font-bold">
          Active Customers: {payload[0]?.value || 0}
        </p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3 sm:gap-0">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-800">Customer Growth</h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Unique active customers over time</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-pink-500 to-rose-500"></div>
          <span className="text-xs font-semibold text-gray-600">Customers</span>
        </div>
      </div>

      <div className="w-full overflow-x-auto scrollbar-admin">
        <ResponsiveContainer width="100%" height={260} minHeight={200}>
          <AreaChart data={customerData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCustomersAdmin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              angle={-45}
              textAnchor="end"
              height={55}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              domain={[0, maxCustomers > 0 ? 'auto' : 5]}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="customers"
              stroke="#ec4899"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorCustomersAdmin)"
              name="Total Customers"
              dot={customerData.length <= 15 ? { r: 3, fill: '#ec4899' } : false}
              activeDot={{ r: 6, fill: '#db2777' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default CustomerGrowthAreaChart;



