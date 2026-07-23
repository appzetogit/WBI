import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Award, BarChart3, Star, TrendingUp, Users } from 'lucide-react';
import { useVendorConfig } from '../../context/VendorConfigContext';
import { fetchPerformance, formatINR, statusColors } from '../../services/globalModulesService';

const Metric = ({ label, value, hint }) => (
  <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
    <p className="text-2xl font-bold text-gray-900">{value}</p>
    <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
    {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
  </div>
);

const Performance = () => {
  const { approvedServices = [] } = useVendorConfig() || {};
  const [category, setCategory] = useState('');
  const [data, setData] = useState({ summary: {}, services: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPerformance(category ? { category } : {});
      setData(res.data.data || { summary: {}, services: [] });
    } catch {
      setData({ summary: {}, services: [] });
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { load(); }, [load]);

  const s = data.summary || {};
  const charts = s.charts || [];
  const maxRevenue = Math.max(...charts.map((c) => c.revenue || 0), 1);

  return (
    <div className="min-h-full p-6 bg-gray-50/80 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-xl"><Activity className="w-5 h-5 text-white" /></span>
            Performance
          </h1>
          <p className="mt-1.5 ml-[46px] text-sm text-gray-500">Dynamic KPIs, engineer productivity, revenue, quality and growth by service.</p>
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg">
          <option value="">All Services</option>
          {approvedServices.map((service) => <option key={service.categoryCode || service.code} value={service.categoryCode || service.code}>{service.categoryName || service.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="h-72 bg-white border border-gray-200 rounded-xl animate-pulse" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Metric label="Performance Score" value={`${s.performanceScore || 0}%`} hint={`Rank #${s.leaderboardRank || '-'}`} />
            <Metric label="Vendor Rating" value={`${(s.vendorRating || 0).toFixed?.(1) || s.vendorRating}/5`} />
            <Metric label="SLA Compliance" value={`${s.slaCompliance || 0}%`} />
            <Metric label="Project Success" value={`${s.projectSuccessRate || 0}%`} />
            <Metric label="Revenue" value={formatINR(s.revenue)} />
            <Metric label="Profit" value={formatINR(s.profit)} />
            <Metric label="Team Productivity" value={`${s.teamProductivity || 0}%`} />
            <Metric label="Customer Satisfaction" value={`${s.customerSatisfaction || 0}%`} />
            <Metric label="Repeat Clients" value={s.repeatClients || 0} />
            <Metric label="Bid Win Rate" value={`${s.bidWinRate || 0}%`} />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm xl:col-span-2">
              <h2 className="flex items-center gap-2 mb-4 text-sm font-semibold text-gray-800"><BarChart3 className="w-4 h-4" /> Revenue Trend & SLA</h2>
              {charts.length === 0 ? (
                <p className="flex items-center justify-center h-52 text-sm text-gray-400">No revenue history yet. Charts populate from completed finance transactions.</p>
              ) : (
                <div className="flex items-end h-52 gap-3">
                  {charts.map((point) => (
                    <div key={point.label} className="flex flex-col items-center justify-end flex-1 h-full gap-2">
                      <div className="w-full bg-blue-100 rounded-t-lg" style={{ height: `${Math.max(8, ((point.revenue || 0) / maxRevenue) * 100)}%` }} title={`₹${point.revenue || 0} · SLA ${point.sla || 0}%`} />
                      <span className="text-[10px] text-gray-400">{point.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
              <h2 className="flex items-center gap-2 mb-4 text-sm font-semibold text-gray-800"><Award className="w-4 h-4" /> Dynamic Service KPIs</h2>
              <div className="space-y-3">
                {(s.dynamicKpis || []).length === 0 ? (
                  <p className="text-sm text-gray-400">No service KPIs configured yet.</p>
                ) : (s.dynamicKpis || []).map((kpi) => (
                  <div key={kpi.label} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{kpi.label}</p>
                      <p className="text-xs text-gray-500">Target {kpi.target}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-md border ${statusColors[kpi.status] || statusColors.good}`}>{kpi.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
            <h2 className="flex items-center gap-2 mb-4 text-sm font-semibold text-gray-800"><Users className="w-4 h-4" /> Engineer Performance</h2>
            {(s.engineers || []).length === 0 ? (
              <p className="py-8 text-sm text-center text-gray-400">No workforce engineers yet. Performance appears when engineers are added under Workforce.</p>
            ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-left text-gray-500 uppercase bg-gray-50">
                  <tr><th className="px-4 py-3">Engineer</th><th className="px-4 py-3">Jobs</th><th className="px-4 py-3">Quality</th><th className="px-4 py-3">Attendance</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3">Safety</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(s.engineers || []).map((engineer) => (
                    <tr key={engineer.name}>
                      <td className="px-4 py-3"><p className="font-semibold text-gray-900">{engineer.name}</p><p className="text-xs text-gray-500">{engineer.role}</p></td>
                      <td className="px-4 py-3">{engineer.completedJobs}</td>
                      <td className="px-4 py-3">{engineer.qualityScore}%</td>
                      <td className="px-4 py-3">{engineer.attendancePercent}%</td>
                      <td className="px-4 py-3 flex items-center gap-1"><Star className="w-3 h-3 text-amber-500 fill-amber-400" /> {engineer.customerRating}</td>
                      <td className="px-4 py-3">{engineer.safetyScore}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Performance;
