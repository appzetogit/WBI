import React from 'react';
import { motion } from 'framer-motion';
import { useVendorConfig } from '../../context/VendorConfigContext';
import { 
  Briefcase, CheckCircle, Clock, Wallet, AlertTriangle, 
  Video, Activity, Wifi, Sun, Shield, AlertCircle
} from 'lucide-react';

const DynamicDashboard = () => {
  const { 
    vendorProfile, 
    kpiDefinitions, 
    dashboardWidgets,
    activeProjectsCount,
    pendingOpportunitiesCount
  } = useVendorConfig();

  // Helper to get an icon based on KPI key
  const getKpiIcon = (key) => {
    if (key.includes('camera')) return <Video className="w-6 h-6 text-blue-500" />;
    if (key.includes('rack')) return <Wifi className="w-6 h-6 text-green-500" />;
    if (key.includes('solar') || key.includes('kw')) return <Sun className="w-6 h-6 text-yellow-500" />;
    if (key.includes('site') || key.includes('project')) return <Briefcase className="w-6 h-6 text-purple-500" />;
    return <Activity className="w-6 h-6 text-gray-500" />;
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome back! Here is what's happening today.</p>
      </div>

      {/* ALERT BANNER - Mocking for demo */}
      {vendorProfile?.complianceStatus?.kycStatus === 'pending' && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md flex items-start shadow-sm max-w-5xl"
        >
          <AlertCircle className="w-6 h-6 text-yellow-600 mr-3 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-yellow-800">Action Needed: KYC Verification</h3>
            <p className="mt-1 text-sm text-yellow-700">Your KYC documents are pending verification. Please complete them to start bidding on projects.</p>
          </div>
        </motion.div>
      )}

      {/* DYNAMIC KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Default / Core KPIs */}
        <motion.div whileHover={{ y: -5 }} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Active Projects</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{activeProjectsCount}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <Briefcase className="w-6 h-6 text-blue-600" />
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -5 }} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Wallet Balance</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">₹{vendorProfile?.walletBalance?.toLocaleString() || 0}</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <Wallet className="w-6 h-6 text-green-600" />
          </div>
        </motion.div>

        {/* Dynamic KPIs driven by backend service categories */}
        {kpiDefinitions?.map((kpi, idx) => (
          <motion.div key={idx} whileHover={{ y: -5 }} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
              {/* Mock value for demo based on key length for randomness */}
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {kpi.type === 'number' ? Math.floor(Math.random() * 500) + 20 : 'Active'}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              {getKpiIcon(kpi.key)}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT COLUMN: ACTIVE PROJECTS LIST */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Current Active Projects</h2>
              <button className="text-sm text-blue-600 font-medium hover:text-blue-800">View All</button>
            </div>
            
            {activeProjectsCount === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No active projects</h3>
                <p className="mt-1 text-sm text-gray-500">You don't have any ongoing projects at the moment.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {/* Mock Projects Rows based on widgets */}
                {[1, 2].map((i) => (
                  <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-center">
                      <div className={`p-2 rounded-lg ${i===1 ? 'bg-blue-50' : 'bg-purple-50'}`}>
                        {i === 1 ? <Video className="w-5 h-5 text-blue-600" /> : <Wifi className="w-5 h-5 text-purple-600" />}
                      </div>
                      <div className="ml-4">
                        <h4 className="text-sm font-semibold text-gray-900">{i===1 ? 'City Surveillance Setup' : 'Branch Office Network'}</h4>
                        <p className="text-xs text-gray-500">ABC Corp • 45 Sites</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end">
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                        On Track
                      </span>
                      <p className="text-xs text-gray-500 mt-1">SLA Day 12/45</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* RECENT ACTIVITY FEED */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
            <div className="flow-root">
              <ul className="-mb-8">
                {[
                  { title: 'New RFQ Received from XYZ Retail', time: '2 hours ago', icon: Briefcase, color: 'text-blue-500 bg-blue-50' },
                  { title: 'Milestone 2 Completed for Project PRJ-102', time: '5 hours ago', icon: CheckCircle, color: 'text-green-500 bg-green-50' },
                  { title: 'Payment of ₹45,000 released', time: '1 day ago', icon: Wallet, color: 'text-emerald-500 bg-emerald-50' }
                ].map((event, eventIdx) => (
                  <li key={eventIdx}>
                    <div className="relative pb-8">
                      {eventIdx !== 2 ? (
                        <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${event.color}`}>
                            <event.icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                          <div>
                            <p className="text-sm text-gray-600">{event.title}</p>
                          </div>
                          <div className="whitespace-nowrap text-right text-xs text-gray-500">
                            <time dateTime="2020-09-20">{event.time}</time>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* ENGINEER AVAILABILITY GRID */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Team Status</h2>
              <span className="text-sm font-medium text-gray-500">12 Total</span>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                  <span className="text-sm text-gray-700">Available</span>
                </div>
                <span className="font-semibold text-gray-900">4</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                  <span className="text-sm text-gray-700">On Job (Active)</span>
                </div>
                <span className="font-semibold text-gray-900">6</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>
                  <span className="text-sm text-gray-700">On Leave</span>
                </div>
                <span className="font-semibold text-gray-900">2</span>
              </div>
            </div>
            
            <button className="mt-6 w-full rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
              Manage Team
            </button>
          </div>

          {/* PERFORMANCE SNAPSHOT */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-sm p-6 text-white">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-blue-400" />
              Vendor Tier: {vendorProfile?.vendorTier?.toUpperCase() || 'BRONZE'}
            </h2>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300">SLA Adherence</span>
                  <span className="font-bold text-green-400">94%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div className="bg-green-400 h-2 rounded-full" style={{ width: '94%' }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300">Completion Rate</span>
                  <span className="font-bold text-blue-400">98%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div className="bg-blue-400 h-2 rounded-full" style={{ width: '98%' }}></div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-700 flex justify-between items-center">
                <span className="text-sm text-gray-300">Avg Rating</span>
                <span className="font-bold text-yellow-400 flex items-center">
                  {vendorProfile?.overallRating || '4.8'} ⭐
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DynamicDashboard;
