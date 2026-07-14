import React, { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiSearch, FiPlus, FiDownload, FiUsers, FiUserCheck, FiBriefcase, 
  FiCalendar, FiLayers, FiStar, FiEye, FiEdit2, FiMoreVertical, 
  FiGrid, FiList, FiTrendingUp, FiTrendingDown, FiClock, FiCheckCircle, FiActivity, FiMail
} from 'react-icons/fi';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip 
} from 'recharts';
import api from '../../../../services/api';
import LogoLoader from '../../../../components/common/LogoLoader';
import toast from 'react-hot-toast';
import DashboardTab from './components/DashboardTab';
import DepartmentsTab from './components/DepartmentsTab';
import RolesTab from './components/RolesTab';
import TeamMembersTab from './components/TeamMembersTab';
import SkillMatrixTab from './components/SkillMatrixTab';
import ProjectAssignmentTab from './components/ProjectAssignmentTab';
import PerformanceTab from './components/PerformanceTab';
import AvailabilityTab from './components/AvailabilityTab';
import LeaveCalendarTab from './components/LeaveCalendarTab';

const DigitalTeamEngineers = memo(() => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  // Data States
  const [overviewData, setOverviewData] = useState(null);

  // UI States
  const [activeTab, setActiveTab] = useState('Dashboard');

  const tabs = ['Dashboard', 'Team Members', 'Departments', 'Roles', 'Skill Matrix', 'Project Assignment', 'Performance', 'Availability', 'Leave & Calendar'];

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const overviewRes = await api.get('/vendors/team/overview');
        if(overviewRes.data?.success) setOverviewData(overviewRes.data.data);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  if (!overviewData && loading) return <LogoLoader />;
  if (!overviewData) return null;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-2xl font-black text-[#0B1E36]">Team & Engineers</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Home &gt; Team & Engineers</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 transition-colors flex items-center gap-2">
            <FiDownload className="text-gray-400" /> Export Team Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto no-scrollbar gap-6 border-b border-gray-200 pb-px">
        {tabs.map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-1 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === tab ? 'text-[#0D8A72] border-[#0D8A72]' : 'text-gray-500 border-transparent hover:text-gray-800'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      {activeTab === 'Dashboard' && <DashboardTab data={overviewData} />}
      {activeTab === 'Team Members' && <TeamMembersTab />}
      {activeTab === 'Departments' && <DepartmentsTab />}
      {activeTab === 'Roles' && <RolesTab />}
      {activeTab === 'Skill Matrix' && <SkillMatrixTab />}
      {activeTab === 'Project Assignment' && <ProjectAssignmentTab />}
      {activeTab === 'Performance' && <PerformanceTab />}
      {activeTab === 'Availability' && <AvailabilityTab />}
      {activeTab === 'Leave & Calendar' && <LeaveCalendarTab />}
      

      

    </div>
  );
});

export default DigitalTeamEngineers;
