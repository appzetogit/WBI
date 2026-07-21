import React, { useState, useEffect } from 'react';
import { FiActivity, FiUsers, FiCheckCircle, FiStar, FiLoader } from 'react-icons/fi';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import adminReportService from '../../../../services/adminReportService';

const EngineerAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await adminReportService.getEngineerReport();
      if (res.success) {
        setData(res.data);
      }
    } catch (error) {
      console.error('Engineer analytics error:', error);
      toast.error('Failed to load engineer analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <FiLoader className="w-10 h-10 text-primary-600 animate-spin" />
      </div>
    );
  }

  const COLORS = ['#10B981', '#EF4444', '#F59E0B', '#2874F0', '#6366F1'];
  const availability = data?.availabilityDistribution || [];
  const topEngineers = data?.topEngineers || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CardShell
          noHeader
          className="bg-gradient-to-br from-blue-600 to-blue-700 text-white border-none p-4 shadow-md"
          bodyClassName="space-y-0"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white/90 text-xs font-semibold uppercase tracking-wide">Total engineers</p>
              <h3 className="text-2xl font-bold mt-1 text-white tabular-nums">
                {(data?.totalEngineers ?? availability.reduce((acc, curr) => acc + curr.count, 0)) || 0}
              </h3>
            </div>
            <div className="bg-white/20 p-2.5 rounded-lg shrink-0 text-white">
              <FiUsers size={20} />
            </div>
          </div>
        </CardShell>

        <CardShell
          noHeader
          className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-none p-4 shadow-md"
          bodyClassName="space-y-0"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white/90 text-xs font-semibold uppercase tracking-wide">Jobs completed (top 10)</p>
              <h3 className="text-2xl font-bold mt-1 text-white tabular-nums">
                {topEngineers.reduce((acc, curr) => acc + (curr.completedJobs || 0), 0) || 0}
              </h3>
            </div>
            <div className="bg-white/20 p-2.5 rounded-lg shrink-0 text-white">
              <FiCheckCircle size={20} />
            </div>
          </div>
        </CardShell>

        <CardShell
          noHeader
          className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-none p-4 shadow-md"
          bodyClassName="space-y-0"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white/90 text-xs font-semibold uppercase tracking-wide">Average rating</p>
              <h3 className="text-2xl font-bold mt-1 text-white tabular-nums">{data?.averageRating ?? '—'}</h3>
            </div>
            <div className="bg-white/20 p-2.5 rounded-lg shrink-0 text-white">
              <FiStar size={20} />
            </div>
          </div>
        </CardShell>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardShell title="Top Performing Engineers" icon={FiActivity} className="p-3.5">
          <div className="h-[250px]">
            {topEngineers.length === 0 ? (
              <p className="text-sm text-gray-600 font-medium text-center py-16">No completed jobs yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topEngineers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 9 }} width={70} />
                  <Tooltip />
                  <Bar dataKey="completedJobs" name="Jobs Completed" fill="#10B981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardShell>

        <CardShell title="Engineer Status Distribution" icon={FiUsers} className="p-3.5">
          <div className="h-[250px]">
            {availability.length === 0 ? (
              <p className="text-sm text-gray-600 font-medium text-center py-16">No engineer records.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={availability}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey={(entry) => (entry._id ? 'Active' : 'Inactive')}
                  >
                    {availability.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardShell>
      </div>
    </div>
  );
};

export default EngineerAnalytics;
