import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '../../utils/adminHelpers';

const RevenueVsBookingsChart = ({ data = [] }) => {
  const chartData = useMemo(() => {
    return (data || []).map((item) => ({
      ...item,
      dateLabel: item.dateLabel || item.date || '',
      revenue: Number(item.revenue || 0),
      orders: Number(item.orders ?? item.bookings ?? 0)
    }));
  }, [data]);

  const maxRevenue = useMemo(() => {
    return Math.max(0, ...chartData.map(d => d.revenue));
  }, [chartData]);

  const maxOrders = useMemo(() => {
    return Math.max(0, ...chartData.map(d => d.orders));
  }, [chartData]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const revenue = payload.find((p) => p.dataKey === 'revenue')?.value ?? 0;
    const orders = payload.find((p) => p.dataKey === 'orders')?.value ?? 0;
    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
        <p className="text-sm font-semibold text-gray-800 mb-2">{label}</p>
        <p className="text-sm text-blue-600 font-semibold">
          Revenue: {formatCurrency(revenue)}
        </p>
        <p className="text-sm text-emerald-600 font-semibold mt-0.5">
          Bookings: {orders}
        </p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-gray-800">Revenue vs Bookings</h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Compare revenue and booking count over time</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xs text-gray-600 font-medium">Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500" />
            <span className="text-xs text-gray-600 font-medium">Bookings</span>
          </div>
        </div>
      </div>

      <div className="w-full overflow-x-auto scrollbar-admin">
        <ResponsiveContainer width="100%" height={280} minHeight={200}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
              yAxisId="left"
              stroke="#3b82f6"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)}
              domain={[0, maxRevenue > 0 ? 'auto' : 1000]}
              width={55}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#10b981"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              domain={[0, maxOrders > 0 ? 'auto' : 5]}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar yAxisId="right" dataKey="orders" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={35} name="Bookings" />
            <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} dot={chartData.length <= 15 ? { r: 3, fill: '#3b82f6' } : false} activeDot={{ r: 6 }} name="Revenue" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default RevenueVsBookingsChart;



