import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  FiPhoneCall, FiActivity, FiBriefcase, FiAlertCircle, 
  FiCheckCircle, FiClock, FiDollarSign, FiTrendingUp,
  FiMapPin, FiTool, FiAlertTriangle, FiUserCheck, FiMessageSquare,
  FiX, FiSend, FiChevronRight, FiChevronDown
} from 'react-icons/fi';
import api from '../../../../services/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

// Helper for Circular Gauge SVG
const CircularProgress = ({ percentage, color = '#10AFA5', size = 80, strokeWidth = 8 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        stroke="#E6F4F2"
        fill="transparent"
        strokeWidth={strokeWidth}
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <circle
        stroke={color}
        fill="transparent"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference + ' ' + circumference}
        style={{ strokeDashoffset: offset, transition: 'stroke-dashoffset 0.5s ease-in-out' }}
        r={radius}
        cx={size / 2}
        cy={size / 2}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dy=".3em" textAnchor="middle" className="font-black text-sm fill-gray-800">
        {percentage}%
      </text>
    </svg>
  );
};

const B2BCommandCenter = () => {
  const [chatOpen, setChatOpen] = useState(false);
  const [timelineModal, setTimelineModal] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { text: 'Hello! I can help you check ticket status, review wallet deductions, or escalate issues. How can I assist you today?', isBot: true }
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  const handleSendChat = async (messageText) => {
    const msg = messageText || chatInput.trim();
    if (!msg) return;

    setChatMessages(prev => [...prev, { text: msg, isBot: false }]);
    setChatInput('');
    setChatLoading(true);

    try {
      // Extract jobId from text if it matches a pattern like #1234
      const jobMatch = msg.match(/#(\d+)/) || msg.match(/Job (\S+)/i) || msg.match(/Ticket (\S+)/i);
      const jobId = jobMatch ? jobMatch[1] : null;

      const response = await api.post('/b2b/support/chatbot', { message: msg, jobId });
      
      setChatMessages(prev => [...prev, { text: response.data.data.reply, isBot: true }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { text: "Sorry, I am having trouble connecting to the server.", isBot: true }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Queries for new intelligence modules
  const { data: execMetrics, isLoading: loadExec } = useQuery({
    queryKey: ['execMetrics'],
    queryFn: async () => (await api.get('/b2b/dashboard/executive-metrics')).data.data
  });

  const { data: geoAnalytics, isLoading: loadGeo } = useQuery({
    queryKey: ['geoAnalytics'],
    queryFn: async () => (await api.get('/b2b/dashboard/geo-task-analytics')).data.data
  });

  const { data: hardwareHealth, isLoading: loadHardware } = useQuery({
    queryKey: ['hardwareHealth'],
    queryFn: async () => (await api.get('/b2b/dashboard/hardware-health')).data.data
  });

  const { data: financeLogs, isLoading: loadFinance } = useQuery({
    queryKey: ['financeLogs'],
    queryFn: async () => (await api.get('/b2b/dashboard/financial-logs')).data.data
  });

  const { data: workforceQuality, isLoading: loadWorkforce } = useQuery({
    queryKey: ['workforceQuality'],
    queryFn: async () => (await api.get('/b2b/dashboard/workforce-quality')).data.data
  });

  return (
    <div className="space-y-6 font-sans antialiased text-gray-700 bg-gray-50/50 p-2 sm:p-4 min-h-screen relative pb-24">
      
      {/* Header */}
      <div className="flex justify-between items-center pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Command Center</h2>
          <p className="text-sm text-gray-500 font-medium">Operational Intelligence & Telemetry</p>
        </div>
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-sm text-xs font-bold text-gray-600">
          Viewing: <span className="text-[#10AFA5]">Last 30 Days</span>
        </div>
      </div>

      {/* Wallet / pending activation gate */}
      {!loadExec && execMetrics?.walletGate?.pendingJobCount > 0 && (
        <div className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
          execMetrics.walletGate.activationBlocked
            ? 'bg-amber-50 border-amber-200'
            : 'bg-emerald-50 border-emerald-200'
        }`}>
          <div className="flex items-start gap-3">
            <FiAlertTriangle className={`mt-0.5 shrink-0 ${execMetrics.walletGate.activationBlocked ? 'text-amber-600' : 'text-emerald-600'}`} />
            <div>
              <p className="text-sm font-bold text-gray-900">
                {execMetrics.walletGate.activationBlocked ? 'Activation blocked — low wallet balance' : 'Pending jobs ready to activate'}
              </p>
              <p className="text-xs text-gray-600 mt-1">{execMetrics.walletGate.message}</p>
              <p className="text-xs text-gray-500 mt-1">
                Balance ₹{Number(execMetrics.walletGate.walletBalance || 0).toLocaleString('en-IN')} · Pending cost ₹{Number(execMetrics.walletGate.pendingBatchCost || 0).toLocaleString('en-IN')}
                {execMetrics.walletGate.shortfall > 0 ? ` · Shortfall ₹${Number(execMetrics.walletGate.shortfall).toLocaleString('en-IN')}` : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {execMetrics.walletGate.activationBlocked ? (
              <Link to="/b2b/wallet" className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700">
                Top up wallet
              </Link>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await api.post('/b2b/wallet/activate-pending');
                    if (res.data.success) {
                      window.location.reload();
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-[#10AFA5] text-white text-xs font-bold hover:bg-[#0d9a91]"
              >
                Activate jobs
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1. Executive KPI Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI 1: Calls Completed */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Calls Completed</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><FiPhoneCall /></div>
          </div>
          {loadExec ? <div className="h-10 w-24 bg-gray-100 animate-pulse rounded"></div> : (
            <div>
              <p className="text-3xl font-black text-gray-900">{execMetrics?.callsCompleted.value.toLocaleString()}</p>
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs font-bold text-gray-500">{execMetrics?.callsCompleted.label}</span>
                <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{execMetrics?.callsCompleted.trend}</span>
              </div>
            </div>
          )}
        </div>

        {/* KPI 2: SLA Compliance */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><FiCheckCircle /></div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">SLA Compliance</span>
            </div>
            {loadExec ? <div className="h-6 w-20 bg-gray-100 animate-pulse mt-4 rounded"></div> : (
              <>
                <p className="text-xs font-bold text-gray-500 mb-1">{execMetrics?.slaCompliance.label}</p>
                <div className="flex items-center gap-3 text-xs font-bold mt-2">
                  <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{execMetrics?.slaCompliance.met} Met</span>
                  <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded-full">{execMetrics?.slaCompliance.breached} Breached</span>
                </div>
              </>
            )}
          </div>
          {execMetrics && <CircularProgress percentage={execMetrics.slaCompliance.rate} color="#10B981" />}
        </div>

        {/* KPI 3: Wallet Utilization */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Wallet Utilization</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><FiDollarSign /></div>
          </div>
          {loadExec ? <div className="h-10 w-24 bg-gray-100 animate-pulse rounded"></div> : (
            <div>
              <p className="text-3xl font-black text-gray-900">₹{execMetrics?.walletUtilization.currentBalance.toLocaleString()}</p>
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs font-bold text-gray-500">Runway: <span className="text-purple-600">{execMetrics?.walletUtilization.daysUntilTopup} Days left</span></span>
                <Link to="/b2b/wallet" className="text-xs font-bold bg-gray-900 text-white px-3 py-1 rounded-full hover:bg-black transition-colors">Top Up</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 2. Geographic & Task Analytics */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-50 bg-gray-50/30">
            <h3 className="font-black text-gray-800 flex items-center gap-2"><FiMapPin className="text-[#10AFA5]" /> Geographic & Task Analytics</h3>
          </div>
          <div className="p-5 flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Heatmap List */}
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Location Heatmap</h4>
              {loadGeo ? <div className="h-32 bg-gray-50 animate-pulse rounded"></div> : (
                <div className="space-y-3">
                  {geoAnalytics?.locationHeatmap.map((loc, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 w-4">{i+1}.</span>
                        <span className="text-sm font-bold text-gray-700">{loc.city}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-500">{loc.volume} calls</span>
                        <span className={`w-2 h-2 rounded-full ${loc.risk === 'High' ? 'bg-red-500' : loc.risk === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Task Breakdown Pie */}
            <div className="flex flex-col items-center justify-center">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 w-full text-left">Nature of Tasks</h4>
              {loadGeo ? <div className="h-32 bg-gray-50 animate-pulse rounded w-full"></div> : (
                <div className="w-full h-40 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={geoAnalytics?.taskBreakdown}
                        cx="50%" cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {geoAnalytics?.taskBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* Legend */}
              <div className="w-full flex flex-wrap gap-2 justify-center mt-2">
                {geoAnalytics?.taskBreakdown.map((t, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }}></span>
                    <span className="text-[10px] font-bold text-gray-500">{t.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Hardware Health & Repeated Call Deep-Dive */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-50 bg-red-50/30">
            <h3 className="font-black text-gray-800 flex items-center gap-2"><FiActivity className="text-red-500" /> Hardware Health Anomalies</h3>
          </div>
          <div className="p-5 flex-1">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Repeated Call Flagging (&lt;30 Days)</h4>
            {loadHardware ? <div className="h-40 bg-gray-50 animate-pulse rounded"></div> : (
              <div className="space-y-3">
                {hardwareHealth?.repeatedCalls.map((hw, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-gray-900 text-sm">{hw.deviceId}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${hw.status === 'Critical Alert' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {hw.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-medium">{hw.site}</p>
                    </div>
                    <div className="flex items-center gap-4 mt-3 sm:mt-0">
                      <div className="text-center">
                        <p className="text-lg font-black text-gray-800 leading-none">{hw.visitsIn30Days}</p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase">Visits</p>
                      </div>
                      <button 
                        onClick={() => setTimelineModal(hw)}
                        className="px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-black transition-colors flex items-center gap-1"
                      >
                        Root Cause Dig <FiChevronRight />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 4. Financial & Accountability Logs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-50 bg-amber-50/30">
            <h3 className="font-black text-gray-800 flex items-center gap-2"><FiAlertTriangle className="text-amber-500" /> Financial & Accountability Logs</h3>
          </div>
          <div className="p-5 flex-1">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Deductions on Incomplete Tasks</h4>
            
            {/* Reason Codes Summary */}
            {loadFinance ? <div className="h-16 bg-gray-50 animate-pulse rounded mb-4"></div> : (
              <div className="flex flex-wrap gap-2 mb-5">
                {financeLogs?.reasonCodes.map((rc, i) => (
                  <div key={i} className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg flex-1 min-w-[140px]">
                    <p className="text-[10px] font-bold text-gray-500 line-clamp-1">{rc.reason}</p>
                    <p className="text-sm font-black text-gray-800">₹{rc.amount} <span className="text-xs text-red-500 font-bold ml-1">({rc.count} drops)</span></p>
                  </div>
                ))}
              </div>
            )}

            {/* Ledger Table */}
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="p-3 font-bold">Job ID</th>
                    <th className="p-3 font-bold">Reason Code</th>
                    <th className="p-3 font-bold">Engineer</th>
                    <th className="p-3 font-bold text-right">Deduction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {financeLogs?.deductionLedger.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="p-3 font-bold text-[#10AFA5]">{row.jobId}</td>
                      <td className="p-3 font-medium text-gray-700">{row.reason}</td>
                      <td className="p-3 font-medium text-gray-500">{row.engineer}</td>
                      <td className="p-3 font-black text-red-600 text-right">-₹{row.charge}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 5. Workforce Quality Control */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-50 bg-blue-50/30">
            <h3 className="font-black text-gray-800 flex items-center gap-2"><FiUserCheck className="text-blue-500" /> Workforce Quality Control</h3>
          </div>
          <div className="p-5 flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Engineer Rating Aggregator */}
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Engineer Rating Matrix</h4>
              {loadWorkforce ? <div className="h-32 bg-gray-50 animate-pulse rounded"></div> : (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="text-3xl font-black text-gray-900">{workforceQuality?.engineerRatings.overallAverage}</div>
                    <div className="text-xs font-bold text-gray-500 uppercase">Overall Avg<br/>Out of 5.0</div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Behavior/Professionalism', val: workforceQuality?.engineerRatings.metrics.behavior },
                      { label: 'SLA Adherence', val: workforceQuality?.engineerRatings.metrics.slaAdherence },
                      { label: 'Tools Readiness', val: workforceQuality?.engineerRatings.metrics.toolsCarried },
                      { label: 'Ethics & Compliance', val: workforceQuality?.engineerRatings.metrics.ethics }
                    ].map((metric, i) => (
                      <div key={i} className="flex items-center justify-between text-xs font-bold">
                        <span className="text-gray-600">{metric.label}</span>
                        <span className={`px-2 py-0.5 rounded ${metric.val >= 4.5 ? 'bg-green-100 text-green-700' : metric.val >= 4.0 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {metric.val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Skill Gap Failures */}
            <div className="flex flex-col">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Skill Gap Aborts</h4>
              <p className="text-[10px] font-bold text-red-500 mb-2">Total aborted due to lack of expertise: {workforceQuality?.skillGaps.totalAborted}</p>
              {loadWorkforce ? <div className="flex-1 bg-gray-50 animate-pulse rounded"></div> : (
                <div className="flex-1 w-full min-h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={workforceQuality?.skillGaps.categories} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="skill" type="category" width={110} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#6b7280' }} interval={0} />
                      <RechartsTooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }} />
                      <Bar dataKey="occurrences" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* Root Cause Timeline Modal */}
      {timelineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-black text-gray-900 text-lg">{timelineModal.deviceId} Root Cause Dig</h3>
                <p className="text-xs font-bold text-gray-500">{timelineModal.site}</p>
              </div>
              <button onClick={() => setTimelineModal(null)} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full transition-colors">
                <FiX className="text-gray-600" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="relative border-l-2 border-gray-200 ml-3 space-y-8">
                {timelineModal.timeline.map((event, i) => (
                  <div key={i} className="relative pl-6">
                    <div className="absolute w-4 h-4 bg-red-500 border-4 border-white rounded-full -left-[9px] top-1"></div>
                    <p className="text-xs font-bold text-gray-400">{event.date} • Eng: {event.engineer}</p>
                    <h4 className="text-sm font-black text-gray-800 mt-1">{event.issue}</h4>
                    <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-100">
                      <FiTool /> Action: {event.partsReplaced}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 text-right">
              <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors">
                Escalate to OEM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Real-Time Resolution Center (Chatbot) */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
        {chatOpen && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-[320px] mb-4 overflow-hidden animate-fade-in flex flex-col h-[400px]">
            <div className="p-4 bg-gray-900 text-white flex justify-between items-center">
              <div>
                <h4 className="font-black flex items-center gap-2"><FiMessageSquare /> TaskY Bot</h4>
                <p className="text-[10px] text-gray-300">Real-Time Resolution Center</p>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-gray-400 hover:text-white"><FiChevronDown size={20}/></button>
            </div>
            <div className="flex-1 p-4 bg-gray-50 overflow-y-auto flex flex-col gap-3">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`p-3 rounded-xl border border-gray-100 text-sm font-medium shadow-sm max-w-[85%] ${
                  msg.isBot 
                    ? 'bg-white rounded-tl-none text-gray-700 self-start' 
                    : 'bg-[#10AFA5] text-white rounded-tr-none self-end'
                }`}>
                  {msg.text}
                </div>
              ))}
              {chatLoading && (
                <div className="bg-white p-3 rounded-xl rounded-tl-none border border-gray-100 shadow-sm self-start">
                  <div className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                  </div>
                </div>
              )}
              {chatMessages.length === 1 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <button onClick={() => handleSendChat("Where is engineer for Ticket #4092?")} className="text-[10px] font-bold bg-white border border-[#10AFA5] text-[#10AFA5] px-2.5 py-1 rounded-full hover:bg-teal-50">Where is engineer for Ticket #4092?</button>
                  <button onClick={() => handleSendChat("Dispute Deduction")} className="text-[10px] font-bold bg-white border border-[#10AFA5] text-[#10AFA5] px-2.5 py-1 rounded-full hover:bg-teal-50">Dispute Deduction</button>
                  <button onClick={() => handleSendChat("What is my wallet balance?")} className="text-[10px] font-bold bg-white border border-[#10AFA5] text-[#10AFA5] px-2.5 py-1 rounded-full hover:bg-teal-50">Check Wallet Balance</button>
                </div>
              )}
            </div>
            <div className="p-3 bg-white border-t border-gray-100 flex gap-2">
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder="Type your query..." 
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#10AFA5]" 
              />
              <button onClick={() => handleSendChat()} className="p-3 bg-[#10AFA5] text-white rounded-xl hover:bg-teal-700 transition-colors"><FiSend size={16}/></button>
            </div>
          </div>
        )}
        <button 
          onClick={() => setChatOpen(!chatOpen)}
          className="w-14 h-14 bg-gray-900 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform hover:bg-black relative"
        >
          {chatOpen ? <FiX size={24} /> : <FiMessageSquare size={24} />}
          {!chatOpen && <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full animate-ping"></span>}
          {!chatOpen && <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full"></span>}
        </button>
      </div>

    </div>
  );
};

export default B2BCommandCenter;
