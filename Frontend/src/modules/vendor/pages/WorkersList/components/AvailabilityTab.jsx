import React, { useState, useEffect } from 'react';
import { FiClock, FiCalendar, FiMapPin, FiActivity } from 'react-icons/fi';
import { useWorkforce } from '../../../hooks/useWorkforce';
import LogoLoader from '../../../../../components/common/LogoLoader';

const AvailabilityTab = () => {
  const { getAvailability, updateAvailability, getTeamMembers, loading } = useWorkforce();
  
  const [availability, setAvailability] = useState([]);
  const [members, setMembers] = useState([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [statusUpdates, setStatusUpdates] = useState({
    status: 'Available', currentLocation: { coordinates: [0, 0], address: '' }
  });

  const fetchData = async () => {
    try {
      const [availRes, memberRes] = await Promise.all([
        getAvailability(),
        getTeamMembers({ limit: 1000 })
      ]);
      if (availRes?.success) {
        const membersList = availRes.data?.members || availRes.data || [];
        const mappedAvailability = membersList.map(m => ({
          _id: m._id,
          memberId: m,
          status: m.availabilityStatus || 'Available',
          currentLocation: m.currentLocation || { address: '' },
          shiftStart: m.shiftStart || '09:00 AM',
          shiftEnd: m.shiftEnd || '05:00 PM'
        }));
        setAvailability(mappedAvailability);
      }
      if (memberRes?.success) setMembers(memberRes.data?.data || memberRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (memberId) => {
    const member = members.find(m => m._id === memberId) || availability.find(a => a.memberId?._id === memberId)?.memberId;
    if (member) {
      setSelectedMember(member);
      setStatusUpdates({
        status: member.availabilityStatus || 'Available',
        currentLocation: { coordinates: [0, 0], address: '' }
      });
      setIsModalOpen(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateAvailability(selectedMember._id, statusUpdates);
      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Available': return 'bg-green-500';
      case 'Busy':
      case 'On Job': return 'bg-orange-500';
      case 'On Leave': return 'bg-purple-500';
      default: return 'bg-gray-400';
    }
  };

  if (loading && availability.length === 0) return <div className="py-20"><LogoLoader /></div>;

  // Calculate totals
  const total = availability.length;
  const available = availability.filter(a => a.status === 'Available').length;
  const busy = availability.filter(a => ['Busy', 'On Job', 'On Project'].includes(a.status)).length;
  const onLeave = availability.filter(a => a.status === 'On Leave').length;

  return (
    <div className="space-y-6">
      
      {/* Availability Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Total Workforce</p>
            <h4 className="text-2xl font-black text-gray-800">{total}</h4>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center"><FiActivity size={18} /></div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between border-b-4 border-b-green-500">
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Available Now</p>
            <h4 className="text-2xl font-black text-gray-800">{available}</h4>
          </div>
          <div className="w-10 h-10 rounded-full bg-green-50 text-green-500 flex items-center justify-center"><FiCheckCircle size={18} /></div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between border-b-4 border-b-orange-500">
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">On Job / Busy</p>
            <h4 className="text-2xl font-black text-gray-800">{busy}</h4>
          </div>
          <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center"><FiClock size={18} /></div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between border-b-4 border-b-purple-500">
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">On Leave / Off</p>
            <h4 className="text-2xl font-black text-gray-800">{onLeave}</h4>
          </div>
          <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center"><FiCalendar size={18} /></div>
        </div>
      </div>

      {/* Roster & Live Status Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Live Status & Roster</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 text-[10px] uppercase font-bold text-gray-400">
                <th className="px-6 py-3">Team Member</th>
                <th className="px-6 py-3">Current Status</th>
                <th className="px-6 py-3">Last Location</th>
                <th className="px-6 py-3">Shift Info</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-xs">
              {availability.map((item) => (
                <tr key={item._id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img src={item.memberId?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.memberId?.name || 'U')}`} className="w-8 h-8 rounded-full border border-gray-100" />
                        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${getStatusColor(item.status)}`}></div>
                      </div>
                      <div>
                        <p className="font-bold text-gray-800">{item.memberId?.name}</p>
                        <p className="text-[10px] text-gray-500 font-medium">{item.memberId?.roleId?.title}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold ${
                      item.status === 'Available' ? 'bg-green-50 text-green-700' : 
                      ['Busy', 'On Job', 'On Project'].includes(item.status) ? 'bg-orange-50 text-orange-700' : 
                      'bg-purple-50 text-purple-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(item.status)}`}></span>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {item.currentLocation?.address ? (
                      <div className="flex items-center gap-1">
                        <FiMapPin className="text-gray-400 shrink-0" />
                        <span className="truncate max-w-[150px]" title={item.currentLocation.address}>{item.currentLocation.address}</span>
                      </div>
                    ) : <span className="text-gray-400 italic">Unknown</span>}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    <div className="flex items-center gap-1">
                      <FiClock className="text-gray-400 shrink-0" />
                      <span>{item.shiftStart} - {item.shiftEnd}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => handleOpenModal(item.memberId?._id)} className="text-[10px] font-bold text-[#0D8A72] hover:underline bg-teal-50 px-2 py-1 rounded">Update Status</button>
                  </td>
                </tr>
              ))}
              {availability.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-10 text-center text-gray-500 italic">No team members active or rostered today.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">Update Status: {selectedMember.name}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Status</label>
                <select required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={statusUpdates.status} onChange={(e) => setStatusUpdates({...statusUpdates, status: e.target.value})}>
                  <option value="Available">Available (Ready for dispatch)</option>
                  <option value="Busy">Busy</option>
                  <option value="On Job">On Job (At client site)</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Offline">Offline</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Current Location (Address / Site)</label>
                <input type="text" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={statusUpdates.currentLocation.address} onChange={(e) => setStatusUpdates({...statusUpdates, currentLocation: { ...statusUpdates.currentLocation, address: e.target.value }})} placeholder="e.g. 123 Main St, New York" />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-50 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-bold text-white bg-[#0D8A72] hover:bg-[#0a6b58] rounded-lg">
                  {loading ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

// Also needed for icons to render correctly in this tab
import { FiCheckCircle } from 'react-icons/fi';

export default AvailabilityTab;
