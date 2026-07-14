import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiMapPin, FiActivity, FiDollarSign, FiClock, FiAlertCircle, FiMessageCircle, FiTrendingUp } from 'react-icons/fi';
import api from '../../../../services/api';

const B2BDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview'); // overview, heatmap, ledger, repeat
  const [metrics, setMetrics] = useState({
    sla: null,
    ledger: null,
    repeat: []
  });
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [slaRes, ledgerRes, repeatRes] = await Promise.all([
        api.get('/b2b-dashboard/sla').catch(() => ({ data: { success: false }})),
        api.get('/b2b-dashboard/ledger').catch(() => ({ data: { success: false }})),
        api.get('/b2b-dashboard/repeat-calls').catch(() => ({ data: { success: false }}))
      ]);
      
      setMetrics({
        sla: slaRes.data?.success ? slaRes.data.data : { slaPercentage: 0, totalJobs: 0, completedJobs: 0 },
        ledger: ledgerRes.data?.success ? ledgerRes.data.data : { balance: 0, escrowBalance: 0, transactions: [] },
        repeat: repeatRes.data?.success ? repeatRes.data.data : []
      });
    } catch (error) {
      console.error('Failed to fetch B2B metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0f172a]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#00a6a6]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-4 pb-24 md:p-8">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#00a6a6] to-teal-200">
            Enterprise Command Center
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Live Operational Intelligence & SLA Tracking</p>
        </div>
        <div className="hidden md:flex items-center space-x-4">
          <div className="px-4 py-2 bg-slate-800 rounded-full border border-slate-700 flex items-center shadow-inner">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-2"></div>
            <span className="text-sm text-slate-300">System Online</span>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex overflow-x-auto space-x-2 mb-8 no-scrollbar pb-2">
        {['overview', 'heatmap', 'repeat', 'ledger'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${
              activeTab === tab 
              ? 'bg-[#00a6a6] text-white shadow-[0_0_15px_rgba(0,166,166,0.5)]' 
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {/* SLA Radial Gauge */}
          <div className="col-span-1 bg-slate-800/50 backdrop-blur-md border border-slate-700 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00a6a6]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <h3 className="text-lg font-semibold text-slate-200 mb-6 w-full flex items-center">
              <FiActivity className="mr-2 text-[#00a6a6]" /> SLA Performance
            </h3>
            <div className="relative w-48 h-48">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle className="text-slate-700 stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent"></circle>
                <circle 
                  className="text-[#00a6a6] progress-ring stroke-current" 
                  strokeWidth="8" 
                  strokeLinecap="round" 
                  cx="50" 
                  cy="50" 
                  r="40" 
                  fill="transparent"
                  strokeDasharray={`${(metrics.sla?.slaPercentage || 0) * 2.51} 251`}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dasharray 1s ease-out' }}
                ></circle>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-white">{metrics.sla?.slaPercentage || 0}%</span>
                <span className="text-xs text-slate-400 mt-1">On-Time Arrival</span>
              </div>
            </div>
            <div className="mt-6 w-full flex justify-between text-sm text-slate-400 px-4">
              <div className="text-center">
                <div className="text-lg font-bold text-slate-200">{metrics.sla?.totalJobs || 0}</div>
                <div>Total Jobs</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-[#00a6a6]">{metrics.sla?.completedJobs || 0}</div>
                <div>Completed</div>
              </div>
            </div>
          </div>

          {/* Financial Escrow Widget */}
          <div className="col-span-1 md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-3xl p-6 relative overflow-hidden shadow-xl">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <FiDollarSign size={80} />
              </div>
              <h3 className="text-lg font-semibold text-slate-300 mb-2">Escrow Held</h3>
              <div className="text-4xl font-black text-white tracking-tight mb-2">
                ₹{(metrics.ledger?.escrowBalance || 0).toLocaleString()}
              </div>
              <p className="text-sm text-emerald-400 flex items-center mt-4">
                <FiTrendingUp className="mr-1" /> Safe and secured for active jobs
              </p>
            </div>
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-3xl p-6 relative overflow-hidden shadow-xl">
              <h3 className="text-lg font-semibold text-slate-300 mb-2">Total Spent (30 Days)</h3>
              <div className="text-4xl font-black text-white tracking-tight mb-2">
                ₹{(metrics.ledger?.totalSpent || 0).toLocaleString()}
              </div>
              <p className="text-sm text-slate-400 mt-4">Includes hardware & service costs</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Financial Ledger Tab */}
      {activeTab === 'ledger' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-800/50 backdrop-blur-md border border-slate-700 rounded-3xl p-6">
          <h2 className="text-xl font-bold mb-6 flex items-center text-white">
            <FiDollarSign className="mr-2 text-[#00a6a6]" /> Financial Ledger
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-sm uppercase tracking-wider">
                  <th className="p-4 font-medium">Date</th>
                  <th className="p-4 font-medium">Description</th>
                  <th className="p-4 font-medium">Type</th>
                  <th className="p-4 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {metrics.ledger?.transactions?.map((tx, idx) => (
                  <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="p-4 text-sm text-slate-300 whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-sm text-slate-300">{tx.description}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${tx.type === 'CREDIT' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className={`p-4 text-sm font-bold text-right ${tx.type === 'CREDIT' ? 'text-emerald-400' : 'text-white'}`}>
                      {tx.type === 'CREDIT' ? '+' : '-'}₹{tx.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {(!metrics.ledger?.transactions || metrics.ledger.transactions.length === 0) && (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-500">No transactions found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Repeat Call Tracker */}
      {activeTab === 'repeat' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-800/50 backdrop-blur-md border border-slate-700 rounded-3xl p-6">
          <h2 className="text-xl font-bold mb-2 flex items-center text-white">
            <FiAlertCircle className="mr-2 text-rose-400" /> Chronic Repeat-Call Tracker
          </h2>
          <p className="text-slate-400 text-sm mb-6">Tracing hardware failures and repeat complaints within 30 days.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metrics.repeat?.map((item, idx) => (
              <div key={idx} className={`p-5 rounded-2xl border ${item.riskLevel === 'Critical' ? 'border-rose-500/50 bg-rose-500/10' : 'border-amber-500/50 bg-amber-500/10'} flex flex-col`}>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center text-white font-medium text-lg">
                    <FiMapPin className={`mr-2 ${item.riskLevel === 'Critical' ? 'text-rose-400' : 'text-amber-400'}`} />
                    {item.location}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${item.riskLevel === 'Critical' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>
                    {item.riskLevel}
                  </span>
                </div>
                <div className="mt-auto flex justify-between items-end border-t border-slate-700 pt-4">
                  <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Repeat Count</div>
                    <div className="text-2xl font-black text-white">{item.repeatCount} Times</div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Last Issue</div>
                    <div className="text-sm font-medium text-slate-300">
                      {new Date(item.lastIssueDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {(!metrics.repeat || metrics.repeat.length === 0) && (
              <div className="col-span-full p-8 text-center text-emerald-400 bg-emerald-500/10 rounded-2xl border border-emerald-500/30">
                <FiActivity size={32} className="mx-auto mb-3" />
                <h3 className="text-lg font-medium">All Systems Healthy</h3>
                <p className="text-sm opacity-80 mt-1">No chronic repeat calls detected in the last 30 days.</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Heatmap Tab */}
      {activeTab === 'heatmap' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-800/50 backdrop-blur-md border border-slate-700 rounded-3xl p-6 h-[600px] flex flex-col relative overflow-hidden">
           <h2 className="text-xl font-bold mb-4 flex items-center text-white">
            <FiMapPin className="mr-2 text-[#00a6a6]" /> Request Density Heatmap (India)
          </h2>
          {/* Simulated aesthetic Map UI since actual Map integration requires setup */}
          <div className="flex-1 bg-slate-900 rounded-xl border border-slate-700 relative overflow-hidden flex items-center justify-center">
             <div className="absolute inset-0 opacity-30" style={{
                backgroundImage: 'radial-gradient(circle at center, #00a6a6 1px, transparent 1px)',
                backgroundSize: '30px 30px'
             }}></div>
             
             {/* Map Mock Data Points */}
             <div className="absolute top-1/4 left-1/3 w-32 h-32 bg-rose-500/20 rounded-full blur-2xl animate-pulse"></div>
             <div className="absolute top-1/3 left-1/3 w-4 h-4 bg-rose-500 rounded-full shadow-[0_0_15px_#f43f5e]"></div>
             
             <div className="absolute bottom-1/3 right-1/3 w-40 h-40 bg-amber-500/20 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1s' }}></div>
             <div className="absolute bottom-1/3 right-1/3 w-5 h-5 bg-amber-500 rounded-full shadow-[0_0_15px_#f59e0b]"></div>
             
             <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-[#00a6a6]/30 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '2s' }}></div>
             <div className="absolute top-1/2 right-1/4 w-3 h-3 bg-[#00a6a6] rounded-full shadow-[0_0_15px_#00a6a6]"></div>

             <div className="z-10 bg-slate-800/80 backdrop-blur px-4 py-2 rounded-lg border border-slate-600 shadow-xl text-center">
                <p className="text-sm font-medium text-white mb-1">Live Heatmap Engine Active</p>
                <p className="text-xs text-slate-400">Monitoring high-density request zones</p>
             </div>
          </div>
        </motion.div>
      )}

      {/* Floating Chatbot */}
      <div className="fixed bottom-24 right-6 md:bottom-8 md:right-8 z-50">
        <AnimatePresence>
          {chatOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="absolute bottom-16 right-0 w-80 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-96"
            >
              <div className="bg-gradient-to-r from-[#00a6a6] to-teal-500 p-4 flex justify-between items-center text-white">
                <span className="font-bold flex items-center"><FiMessageCircle className="mr-2"/> Command Support</span>
                <button onClick={() => setChatOpen(false)} className="text-white hover:text-slate-200">✕</button>
              </div>
              <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-800">
                <div className="bg-slate-700 rounded-2xl rounded-tl-none p-3 text-sm text-slate-200 inline-block max-w-[85%]">
                  Hello! How can I help with your enterprise operations today?
                </div>
                <div className="bg-[#00a6a6]/20 border border-[#00a6a6]/30 rounded-2xl rounded-tr-none p-3 text-sm text-teal-100 inline-block max-w-[85%] ml-auto">
                  Can you trace technician for Project Rollout #991?
                </div>
                <div className="bg-slate-700 rounded-2xl rounded-tl-none p-3 text-sm text-slate-200 inline-block max-w-[85%]">
                  Yes, Technician Rahul is currently 2.5km away from ATM Site #442. ETA: 12 minutes.
                </div>
              </div>
              <div className="p-3 bg-slate-900 border-t border-slate-700 flex">
                <input type="text" placeholder="Type a message..." className="flex-1 bg-slate-800 border border-slate-700 rounded-l-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00a6a6]" />
                <button className="bg-[#00a6a6] text-white px-4 py-2 rounded-r-lg hover:bg-teal-600 transition-colors">Send</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <button 
          onClick={() => setChatOpen(!chatOpen)}
          className="bg-[#00a6a6] hover:bg-teal-600 text-white w-14 h-14 rounded-full shadow-[0_0_20px_rgba(0,166,166,0.5)] flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
        >
          <FiMessageCircle size={24} />
        </button>
      </div>

    </div>
  );
};

export default B2BDashboard;
