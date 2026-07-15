import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FolderKanban, Search, Filter, ArrowRight, Clock, 
  MapPin, User, Activity, AlertTriangle, ShieldCheck
} from 'lucide-react';

// Using mock data for demo since we just built the UI. 
// In production, this calls the new /api/vendors/projects-os endpoint
const MOCK_PROJECTS = [
  {
    _id: 'PRJ-1029',
    projectCode: 'CCTV-RL-1029',
    title: 'Enterprise CCTV Rollout - North Zone',
    serviceCategory: 'C01',
    clientName: 'Reliance Retail',
    totalSites: 45,
    completedSites: 12,
    status: 'in_progress',
    timeline: {
      startDate: '2026-07-01',
      expectedEndDate: '2026-08-15'
    },
    sla: {
      agreedDays: 45,
      currentDay: 15,
      breached: false
    }
  },
  {
    _id: 'PRJ-1030',
    projectCode: 'NET-1030',
    title: 'Branch Office Network Setup',
    serviceCategory: 'C03',
    clientName: 'HDFC Bank',
    totalSites: 5,
    completedSites: 5,
    status: 'quality_check',
    timeline: {
      startDate: '2026-07-10',
      expectedEndDate: '2026-07-14'
    },
    sla: {
      agreedDays: 5,
      currentDay: 5,
      breached: false
    }
  }
];

const ProjectList = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [projects, setProjects] = useState(MOCK_PROJECTS);

  const TABS = [
    { id: 'all', label: 'All Projects' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'quality_check', label: 'Under Review' },
    { id: 'completed', label: 'Completed' }
  ];

  const getStatusColor = (status) => {
    switch(status) {
      case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'quality_check': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'delayed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSlaStatus = (sla) => {
    if (sla.breached) return <span className="text-red-600 flex items-center"><AlertTriangle className="w-4 h-4 mr-1"/> SLA Breached</span>;
    const remaining = sla.agreedDays - sla.currentDay;
    if (remaining <= 3) return <span className="text-orange-500 flex items-center"><Clock className="w-4 h-4 mr-1"/> {remaining} Days Left (Risk)</span>;
    return <span className="text-green-600 flex items-center"><ShieldCheck className="w-4 h-4 mr-1"/> On Track</span>;
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Project Operations</h1>
        <p className="text-gray-500">Manage all your active deployments, sites, and SLAs.</p>
      </div>

      {/* FILTERS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <div className="flex space-x-1 bg-gray-200 p-1 rounded-lg overflow-x-auto w-full sm:w-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="flex space-x-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search projects by ID..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* PROJECT LIST */}
      <div className="space-y-4">
        {projects.filter(p => activeTab === 'all' || p.status === activeTab).map(project => (
          <motion.div 
            key={project._id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
          >
            <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between">
              
              <div className="flex-1 mb-4 lg:mb-0">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-xs font-bold text-gray-500">{project.projectCode}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${getStatusColor(project.status)}`}>
                    {project.status.replace('_', ' ')}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">{project.title}</h3>
                <p className="text-sm text-gray-500 flex items-center">
                  <User className="w-4 h-4 mr-1 text-gray-400" /> Client: <span className="font-medium text-gray-700 ml-1">{project.clientName}</span>
                </p>
              </div>

              <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between lg:justify-around space-y-4 sm:space-y-0">
                <div className="flex flex-col">
                  <span className="text-sm text-gray-500 mb-1">Site Progress</span>
                  <div className="flex items-center">
                    <span className="text-lg font-bold text-gray-900 mr-2">{project.completedSites} / {project.totalSites}</span>
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500" 
                        style={{ width: `${(project.completedSites / project.totalSites) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col">
                  <span className="text-sm text-gray-500 mb-1">SLA Health</span>
                  <div className="text-sm font-medium">
                    {getSlaStatus(project.sla)}
                  </div>
                </div>
              </div>

              <div className="mt-4 lg:mt-0 lg:ml-6 flex items-center">
                <button 
                  onClick={() => window.location.href = `/vendor/projects/${project._id}`}
                  className="w-full sm:w-auto flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Manage Operations
                  <ArrowRight className="ml-2 -mr-1 h-4 w-4" />
                </button>
              </div>
              
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ProjectList;
