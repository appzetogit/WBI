import React, { useState, useEffect } from 'react';
import { FiTrendingUp, FiAward, FiStar, FiClock, FiCheckCircle } from 'react-icons/fi';
import { useWorkforce } from '../../../hooks/useWorkforce';
import LogoLoader from '../../../../../components/common/LogoLoader';

const PerformanceTab = () => {
  const { getPerformance, getTeamMembers, getSkills, logPerformance, loading } = useWorkforce();
  
  const [performance, setPerformance] = useState([]);
  const [members, setMembers] = useState([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({ 
    memberId: '', type: 'KPI', metric: 'Job Completion', 
    score: 0, maxScore: 100, comments: '', date: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    try {
      const [perfRes, memberRes] = await Promise.all([
        getPerformance({}),
        getTeamMembers({ limit: 1000 })
      ]);
      if (perfRes?.success) setPerformance(perfRes.data || []);
      if (memberRes?.success) setMembers(memberRes.data?.data || memberRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const period = formData.date.substring(0, 7); // Extract YYYY-MM
      
      const payload = {
        memberId: formData.memberId,
        period,
        periodType: 'Monthly',
        managerFeedback: formData.comments,
      };

      if (formData.metric === 'Job Completion') payload.jobsCompleted = formData.score;
      if (formData.metric === 'Customer Satisfaction') payload.customerRating = formData.score;
      if (formData.metric === 'Safety Compliance') payload.qualityScore = formData.score;
      if (formData.metric === 'Quality of Work') payload.qualityScore = formData.score;
      if (formData.metric === 'Punctuality') payload.attendancePercent = formData.score;

      await logPerformance(payload);
      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const renderStars = (rating) => {
    return Array(5).fill(0).map((_, i) => (
      <FiStar key={i} className={`w-3 h-3 ${i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
    ));
  };

  if (loading && performance.length === 0) return <div className="py-20"><LogoLoader /></div>;

  return (
    <div className="space-y-6">
      
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-800">Performance & KPI Dashboard</h3>
        <button onClick={() => setIsModalOpen(true)} className="bg-[#0D8A72] text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#0a6b58] transition-colors">
          <FiTrendingUp /> Log KPI Score
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        
        {performance.map((p, i) => (
          <div key={p._id} className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow relative overflow-hidden">
            {/* Rank Badge */}
            <div className={`absolute top-0 right-0 w-12 h-12 flex items-start justify-end p-2 ${i===0?'bg-yellow-100/50 text-yellow-600':i===1?'bg-gray-100/50 text-gray-500':i===2?'bg-orange-100/50 text-orange-600':'bg-transparent text-transparent'} rounded-bl-3xl`}>
              {i < 3 && <FiAward size={18} />}
            </div>

            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <img src={p.memberId?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.memberId?.name || 'U')}`} className="w-12 h-12 rounded-full border border-gray-100" />
                <div>
                  <h4 className="font-bold text-gray-800 text-sm leading-tight">{p.memberId?.name}</h4>
                  <p className="text-[10px] font-medium text-gray-500">{p.memberId?.roleId?.title}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-50">
                <div className="text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Overall</p>
                  <div className="flex items-center gap-1 justify-center">
                    {renderStars(p.rating)}
                  </div>
                  <p className="text-xs font-bold text-gray-800 mt-0.5">{p.rating} / 5.0</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Auto Score</p>
                  <p className={`text-xl font-black ${p.autoScore >= 80 ? 'text-green-500' : p.autoScore >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>{p.autoScore}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-1.5 text-gray-600"><FiCheckCircle className="text-green-500"/> First-Time Fix Rate</span>
                  <span className="font-bold text-gray-800">{p.firstTimeFixRate}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-1.5 text-gray-600"><FiClock className="text-blue-500"/> SLA Compliance</span>
                  <span className="font-bold text-gray-800">{p.slaCompliance}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-1.5 text-gray-600"><FiCheckCircle className="text-indigo-500"/> Jobs Completed</span>
                  <span className="font-bold text-gray-800">{p.completedTasks}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-1.5 text-gray-600"><FiTrendingUp className="text-teal-500"/> Productivity</span>
                  <span className="font-bold text-gray-800">{p.productivityPercentage}%</span>
                </div>
              </div>
            </div>
            
            <button className="mt-auto w-full py-2.5 bg-gray-50 text-gray-600 font-bold text-xs border-t border-gray-100 hover:bg-gray-100 transition-colors">
              View Detailed Metrics &rarr;
            </button>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">Log KPI Score</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Team Member <span className="text-red-500">*</span></label>
                <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.memberId} onChange={(e) => setFormData({...formData, memberId: e.target.value})}>
                  <option value="">Select a team member</option>
                  {members.map(m => (
                    <option key={m._id} value={m._id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Metric / Type</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.metric} onChange={(e) => {
                    const metric = e.target.value;
                    let maxScore = 100;
                    if (metric === 'Customer Satisfaction' || metric === 'Quality of Work') maxScore = 5;
                    setFormData({...formData, metric, maxScore, score: 0});
                  }}>
                    <option value="Job Completion">Job Completion (%)</option>
                    <option value="Customer Satisfaction">Customer Satisfaction (/5)</option>
                    <option value="Safety Compliance">Safety Compliance (%)</option>
                    <option value="Quality of Work">Quality of Work (/5)</option>
                    <option value="Punctuality">Punctuality (%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Date</label>
                  <input required type="date" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Score Obtained <span className="text-red-500">*</span></label>
                  <input required type="number" step="0.1" min="0" max={formData.maxScore} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.score} onChange={(e) => setFormData({...formData, score: e.target.value === '' ? '' : parseFloat(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Max Possible Score <span className="text-red-500">*</span></label>
                  <input required type="number" step="1" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={formData.maxScore} readOnly />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Feedback / Comments</label>
                <textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows="3" value={formData.comments} onChange={(e) => setFormData({...formData, comments: e.target.value})} placeholder="Any additional context for this score" />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-50">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-bold text-white bg-[#0D8A72] hover:bg-[#0a6b58] rounded-lg">
                  {loading ? 'Logging...' : 'Log Score'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default PerformanceTab;
