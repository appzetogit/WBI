import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'react-router-dom';
import { 
  CheckCircle, Clock, UploadCloud, MapPin, 
  User, Truck, AlertCircle, PlayCircle, Building2, Map
} from 'lucide-react';

const MOCK_DETAILS = {
  _id: 'PRJ-1029',
  projectCode: 'CCTV-RL-1029',
  title: 'Enterprise CCTV Rollout - North Zone',
  serviceCategory: 'C01', // CCTV
  clientName: 'Reliance Retail',
  status: 'in_progress',
  sites: [
    { siteId: 'S-1', siteName: 'Reliance Fresh Malviya Nagar', status: 'completed', assignedEngineer: 'Eng-01' },
    { siteId: 'S-2', siteName: 'Reliance Smart Mansarovar', status: 'in_progress', assignedEngineer: 'Eng-02' },
    { siteId: 'S-3', siteName: 'Reliance Trends Vaishali', status: 'pending', assignedEngineer: null }
  ],
  milestones: [
    { id: 'M1', title: 'Site Survey & Layout', status: 'completed' },
    { id: 'M2', title: 'Hardware Delivery', status: 'completed' },
    { id: 'M3', title: 'Cabling & Mounting', status: 'in_progress' },
    { id: 'M4', title: 'DVR Configuration', status: 'pending' },
    { id: 'M5', title: 'Client Sign-off', status: 'pending' }
  ],
  dynamicUI: {
    themeColor: '#2563eb', // CCTV blue
    requiredTools: ['Drill Machine', 'Multimeter', 'Crimping Tool', 'Ladder']
  }
};

const ProjectDetails = () => {
  const { projectId } = useParams();
  const [project, setProject] = useState(MOCK_DETAILS);
  const [activeTab, setActiveTab] = useState('kanban');

  // Dynamic UI theme derived from backend config
  const themeColor = project.dynamicUI.themeColor;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      
      {/* HEADER */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">{project.projectCode}</span>
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">In Progress</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
            <p className="text-sm text-gray-500 flex items-center mt-1">
              <Building2 className="w-4 h-4 mr-1" /> {project.clientName}
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex space-x-3">
            <button className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 shadow-sm text-sm font-medium">
              View Contract
            </button>
            <button 
              style={{ backgroundColor: themeColor }}
              className="px-4 py-2 text-white rounded-lg shadow-sm text-sm font-medium flex items-center"
            >
              <Truck className="w-4 h-4 mr-2" /> Dispatch Engineer
            </button>
          </div>
        </div>
      </div>

      {/* OS NAVIGATION */}
      <div className="flex space-x-1 bg-white border border-gray-200 p-1 rounded-lg mb-6 w-full md:w-max">
        {['kanban', 'sites', 'dispatch', 'finance'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md capitalize transition-colors ${
              activeTab === tab
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tab === 'kanban' ? 'Milestone Kanban' : tab === 'sites' ? 'Sites & Rollout' : tab}
          </button>
        ))}
      </div>

      {/* DYNAMIC CONTENT AREA */}
      
      {activeTab === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Pending */}
          <div className="bg-gray-100 p-4 rounded-xl">
            <h3 className="font-semibold text-gray-700 mb-4 flex justify-between">
              Pending <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs">2</span>
            </h3>
            <div className="space-y-3">
              {project.milestones.filter(m => m.status === 'pending').map(m => (
                <div key={m.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 cursor-grab hover:border-gray-300">
                  <h4 className="font-medium text-gray-900">{m.title}</h4>
                  <button className="mt-3 text-xs text-blue-600 font-medium hover:underline">Start Milestone</button>
                </div>
              ))}
            </div>
          </div>
          
          {/* In Progress */}
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <h3 className="font-semibold text-blue-800 mb-4 flex justify-between">
              In Progress <span className="bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full text-xs">1</span>
            </h3>
            <div className="space-y-3">
              {project.milestones.filter(m => m.status === 'in_progress').map(m => (
                <div key={m.id} className="bg-white p-4 rounded-lg shadow-sm border border-blue-200">
                  <h4 className="font-medium text-gray-900">{m.title}</h4>
                  <div className="mt-3 flex space-x-2">
                    <button className="flex-1 text-xs bg-blue-600 text-white py-1.5 rounded flex justify-center items-center">
                      <UploadCloud className="w-3 h-3 mr-1" /> Upload Proof
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Completed */}
          <div className="bg-green-50 p-4 rounded-xl border border-green-100">
            <h3 className="font-semibold text-green-800 mb-4 flex justify-between">
              Completed <span className="bg-green-200 text-green-800 px-2 py-0.5 rounded-full text-xs">2</span>
            </h3>
            <div className="space-y-3">
              {project.milestones.filter(m => m.status === 'completed').map(m => (
                <div key={m.id} className="bg-white p-4 rounded-lg shadow-sm border border-green-200 opacity-70">
                  <h4 className="font-medium text-gray-900 flex items-center">
                    <CheckCircle className="w-4 h-4 mr-2 text-green-500" /> {m.title}
                  </h4>
                  <p className="mt-2 text-xs text-green-600">Approved by Client</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sites' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Site Rollout Management</h2>
            <button className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center">
              <Map className="w-4 h-4 mr-1" /> Map View
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Site ID</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Assigned Eng.</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {project.sites.map(site => (
                  <tr key={site.siteId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{site.siteId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{site.siteName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {site.assignedEngineer ? (
                        <span className="flex items-center"><User className="w-4 h-4 mr-1 text-gray-400"/> {site.assignedEngineer}</span>
                      ) : (
                        <span className="text-red-500 text-xs font-medium">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        site.status === 'completed' ? 'bg-green-100 text-green-800' :
                        site.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {site.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button className="text-blue-600 hover:text-blue-900">Manage</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'dispatch' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Required Tool Kit (Dynamic)</h2>
            <ul className="space-y-2">
              {project.dynamicUI.requiredTools.map((tool, idx) => (
                <li key={idx} className="flex items-center text-sm text-gray-700 bg-gray-50 p-2 rounded">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2" /> {tool}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col items-center justify-center text-center">
            <Truck className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Dispatch Center</h3>
            <p className="text-sm text-gray-500 mt-2 mb-4 max-w-sm">Assign available engineers to pending sites and dispatch required toolkits dynamically.</p>
            <button className="px-4 py-2 bg-blue-600 text-white rounded shadow-sm text-sm font-medium">
              Start Dispatch Wizard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetails;
