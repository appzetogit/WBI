import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const BookingsBarChart = ({ data = [] }) => {
  const chartData = useMemo(() => {
    return (data || []).map((item) => ({
      ...item,
      dateLabel: item.dateLabel || item.date || '',
      bookings: Number(item.orders ?? item.bookings ?? 0)
    }));
  }, [data]);

  const maxBookings = useMemo(() => {
    return Math.max(0, ...chartData.map(d => d.bookings));
  }, [chartData]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const item = payload[0]?.payload || {};
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="text-sm font-semibold text-gray-800 mb-1">{label}</p>
          <p className="text-sm text-emerald-600 font-bold">
            Total Bookings: {payload[0]?.value || 0}
          </p>
          {item.completed !== undefined && (
            <p className="text-xs text-gray-500 mt-1">
              Completed: {item.completed} • Cancelled: {item.cancelled || 0}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-gray-800">Booking Volume</h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Daily booking creation volume</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" />
          <span className="text-xs font-semibold text-gray-600">Bookings</span>
        </div>
      </div>

      <div className="w-full overflow-x-auto scrollbar-admin">
        <ResponsiveContainer width="100%" height={260} minHeight={200}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorBookingsAdmin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.9} />
                <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.7} />
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
              domain={[0, maxBookings > 0 ? 'auto' : 5]}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="bookings" fill="url(#colorBookingsAdmin)" radius={[6, 6, 0, 0]} name="Bookings" maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default BookingsBarChart;



