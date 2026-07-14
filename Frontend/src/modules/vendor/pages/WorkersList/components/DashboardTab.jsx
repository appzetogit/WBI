import React from 'react';
import { 
  FiUsers, FiUserCheck, FiBriefcase, FiCalendar, FiCheckCircle, 
  FiActivity, FiTrendingUp, FiTrendingDown, FiAlertCircle, FiClock, FiStar, FiAward, FiLayers
} from 'react-icons/fi';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line
} from 'recharts';

const StatCard = ({ title, value, icon, trend, up, bg, textColor }) => (
  <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-center transition-all hover:shadow-md">
    <div className="flex items-center gap-3 mb-2">
      <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center`}>{icon}</div>
      <div>
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-black text-gray-800 leading-none mt-1">{value}</p>
      </div>
    </div>
    {trend && (
      <p className={`text-[10px] font-bold flex items-center mt-1 ${up ? 'text-green-500' : 'text-red-500'}`}>
        {up ? <FiTrendingUp className="mr-1"/> : <FiTrendingDown className="mr-1"/>} {trend}
      </p>
    )}
  </div>
);

const DashboardTab = ({ data }) => {
  if (!data?.kpis) return null;
  const { kpis, charts } = data;

  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

  return (
    <div className="space-y-6">
      {/* KPI Section 1: Workforce Overview */}
      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2"><FiUsers className="text-[#0D8A72]" /> Workforce Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <StatCard title="Total Employees" value={kpis.totalEmployees} bg="bg-blue-50" icon={<FiUsers className="text-blue-600"/>} />
          <StatCard title="Active Engineers" value={kpis.activeEmployees} bg="bg-green-50" icon={<FiUserCheck className="text-green-600"/>} />
          <StatCard title="Available" value={kpis.available} bg="bg-teal-50" icon={<FiCheckCircle className="text-teal-600"/>} />
          <StatCard title="Busy / On Job" value={kpis.busy} bg="bg-orange-50" icon={<FiBriefcase className="text-orange-600"/>} />
          <StatCard title="On Leave" value={kpis.onLeave} bg="bg-red-50" icon={<FiCalendar className="text-red-600"/>} />
          <StatCard title="Travelling" value={kpis.travelling} bg="bg-purple-50" icon={<FiActivity className="text-purple-600"/>} />
          <StatCard title="Departments" value={kpis.departmentCount} bg="bg-indigo-50" icon={<FiLayers className="text-indigo-600"/>} />
          <StatCard title="Roles" value={kpis.roleCount} bg="bg-pink-50" icon={<FiAward className="text-pink-600"/>} />
        </div>
      </div>

      {/* KPI Section 2: Operations & Performance */}
      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2"><FiActivity className="text-[#0D8A72]" /> Operations & Performance</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <StatCard title="Active Projects" value={kpis.activeProjects} bg="bg-blue-50" icon={<FiBriefcase className="text-blue-600"/>} />
          <StatCard title="Completed Projects" value={kpis.completedProjects} bg="bg-green-50" icon={<FiCheckCircle className="text-green-600"/>} />
          <StatCard title="Workforce Util." value={`${kpis.workforceUtilization}%`} bg="bg-indigo-50" icon={<FiTrendingUp className="text-indigo-600"/>} trend="+5%" up={true} />
          <StatCard title="Avg Perf. Score" value={`${kpis.avgPerformanceScore}/100`} bg="bg-purple-50" icon={<FiAward className="text-purple-600"/>} trend="+2%" up={true} />
          <StatCard title="SLA Compliance" value={`${kpis.avgSlaCompliance}%`} bg="bg-teal-50" icon={<FiClock className="text-teal-600"/>} trend="+1%" up={true} />
          <StatCard title="Avg Rating" value={kpis.avgCustomerRating} bg="bg-yellow-50" icon={<FiStar className="text-yellow-600"/>} />
          <StatCard title="Expiring Docs" value={kpis.expiringDocuments} bg="bg-red-50" icon={<FiAlertCircle className="text-red-600"/>} />
          <StatCard title="Skill Gaps" value={kpis.skillGapAlerts} bg="bg-orange-50" icon={<FiAlertCircle className="text-orange-600"/>} />
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Availability Chart */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Current Workforce Availability</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={charts?.availabilityChart || []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {charts?.availabilityChart?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Department Distribution */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Department Distribution</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.deptDistribution || []} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="count" fill="#0D8A72">
                  {charts?.deptDistribution?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardTab;
