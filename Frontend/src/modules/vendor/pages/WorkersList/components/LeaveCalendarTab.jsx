import React, { useState, useEffect } from 'react';
import { FiCalendar, FiPlus, FiCheck, FiX, FiAlertCircle } from 'react-icons/fi';
import { useWorkforce } from '../../../hooks/useWorkforce';
import LogoLoader from '../../../../../components/common/LogoLoader';

const LeaveCalendarTab = () => {
  const { getLeaves, applyLeave, updateLeaveStatus, getTeamMembers, loading } = useWorkforce();
  
  const [leaves, setLeaves] = useState([]);
  const [members, setMembers] = useState([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({ 
    memberId: '', leaveType: 'Sick', startDate: '', endDate: '', reason: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [leavesRes, memberRes] = await Promise.all([
        getLeaves(),
        getTeamMembers({ limit: 1000 })
      ]);
      if (leavesRes?.success) setLeaves(leavesRes.data || []);
      if (memberRes?.success) setMembers(memberRes.data?.data || memberRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await applyLeave(formData);
      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await updateLeaveStatus(id, status);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading && leaves.length === 0) return <div className="py-20"><LogoLoader /></div>;

  return (
    <div className="space-y-6">
      
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-800">Leave Management & Calendar</h3>
        <button onClick={() => setIsModalOpen(true)} className="bg-[#0D8A72] text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#0a6b58] transition-colors">
          <FiPlus /> Apply Leave
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Pending Approvals */}
        <div className="lg:col-span-1 space-y-4">
          <h4 className="font-bold text-gray-600 uppercase text-xs tracking-wider">Pending Approvals</h4>
          {leaves.filter(l => l.status === 'Pending').map(l => (
            <div key={l._id} className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 shadow-sm flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <img src={l.memberId?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(l.memberId?.name || 'U')}`} className="w-8 h-8 rounded-full border border-yellow-100" />
                  <div>
                    <p className="font-bold text-yellow-900 text-sm">{l.memberId?.name}</p>
                    <p className="text-[10px] font-medium text-yellow-700 bg-yellow-100/50 px-1.5 py-0.5 rounded w-max mt-0.5">{l.leaveType}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">{l.days} Days</span>
              </div>
              
              <div className="text-xs text-yellow-800">
                <p><strong>Dates:</strong> {new Date(l.startDate).toLocaleDateString()} - {new Date(l.endDate).toLocaleDateString()}</p>
                <p className="mt-1 line-clamp-2 italic text-[11px] opacity-80">"{l.reason}"</p>
              </div>

              <div className="flex gap-2 mt-1">
                <button onClick={() => handleUpdateStatus(l._id, 'Approved')} className="flex-1 bg-white border border-green-500 text-green-600 font-bold text-xs py-1.5 rounded flex items-center justify-center gap-1 hover:bg-green-50"><FiCheck/> Approve</button>
                <button onClick={() => handleUpdateStatus(l._id, 'Rejected')} className="flex-1 bg-white border border-red-500 text-red-600 font-bold text-xs py-1.5 rounded flex items-center justify-center gap-1 hover:bg-red-50"><FiX/> Reject</button>
              </div>
            </div>
          ))}
          {leaves.filter(l => l.status === 'Pending').length === 0 && (
            <div className="p-6 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-center text-gray-500 text-xs">
              <FiCheck className="mx-auto text-xl mb-2 text-green-400" />
              No pending leave requests.
            </div>
          )}
        </div>

        {/* Calendar / Approved Leaves */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="font-bold text-gray-600 uppercase text-xs tracking-wider">Upcoming & Approved Leaves</h4>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/50 text-[10px] uppercase font-bold text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3">Member</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Duration</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs">
                {leaves.filter(l => l.status !== 'Pending').slice(0, 15).map(l => (
                  <tr key={l._id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <img src={l.memberId?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(l.memberId?.name || 'U')}`} className="w-6 h-6 rounded-full" />
                        <span className="font-bold text-gray-800">{l.memberId?.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-600">{l.leaveType}</td>
                    <td className="px-5 py-3 text-gray-600">
                      <div>
                        <span>{new Date(l.startDate).toLocaleDateString()} &rarr; {new Date(l.endDate).toLocaleDateString()}</span>
                        <p className="text-[10px] text-gray-400">{l.days} days</p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        l.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">Apply Leave</h3>
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

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Leave Type</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.leaveType} onChange={(e) => setFormData({...formData, leaveType: e.target.value})}>
                  <option value="Annual">Annual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Unpaid">Unpaid Leave</option>
                  <option value="Maternity">Maternity/Paternity</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                  <input required type="date" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.startDate} onChange={(e) => setFormData({...formData, startDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">End Date <span className="text-red-500">*</span></label>
                  <input required type="date" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.endDate} onChange={(e) => setFormData({...formData, endDate: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Reason (Optional)</label>
                <textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows="3" value={formData.reason} onChange={(e) => setFormData({...formData, reason: e.target.value})} placeholder="Reason for leave request" />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-50">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-bold text-white bg-[#0D8A72] hover:bg-[#0a6b58] rounded-lg">
                  {loading ? 'Submitting...' : 'Apply Leave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default LeaveCalendarTab;
