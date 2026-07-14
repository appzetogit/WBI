import React, { useState, useEffect } from 'react';
import { FiSearch, FiGrid, FiList, FiEye, FiEdit2, FiMoreVertical, FiPlus } from 'react-icons/fi';
import { useWorkforce } from '../../../hooks/useWorkforce';
import LogoLoader from '../../../../../components/common/LogoLoader';
import toast from 'react-hot-toast';

const TeamMembersTab = () => {
  const { getTeamMembers, getDepartments, getRoles, addMember, updateMember, deleteMember, loading } = useWorkforce();
  
  const [membersData, setMembersData] = useState({ data: [], pagination: { total: 0, page: 1, pages: 1 } });
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('All Departments');
  const [roleFilter, setRoleFilter] = useState('All Roles');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [viewMode, setViewMode] = useState('list');
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', departmentId: '', roleId: '', employmentType: 'Full-time'
  });

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [page, searchQuery, deptFilter, roleFilter, statusFilter]);

  const fetchMetadata = async () => {
    try {
      const [deptRes, roleRes] = await Promise.all([getDepartments(), getRoles()]);
      if(deptRes?.success) setDepartments(deptRes.data);
      if(roleRes?.success) setRoles(roleRes.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMembers = async () => {
    try {
      const params = {
        page, limit: 10, search: searchQuery, 
        department: deptFilter !== 'All Departments' ? departments.find(d => d.name === deptFilter)?._id : '',
        role: roleFilter !== 'All Roles' ? roles.find(r => r.title === roleFilter)?._id : '',
        status: statusFilter !== 'All Status' ? statusFilter : ''
      };
      const res = await getTeamMembers(params);
      if (res?.success) setMembersData(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenModal = (member = null) => {
    if (member) {
      setEditingId(member._id);
      setFormData({
        name: member.name, email: member.email, phone: member.phone,
        departmentId: member.departmentId?._id || '', roleId: member.roleId?._id || '',
        employmentType: member.employmentType || 'Full-time'
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', email: '', phone: '', departmentId: '', roleId: '', employmentType: 'Full-time' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) await updateMember(editingId, formData);
      else await addMember(formData);
      setIsModalOpen(false);
      fetchMembers();
    } catch (e) {
      console.error(e);
    }
  };

  const renderPagination = () => {
    const { total, page: currPage, pages } = membersData.pagination;
    return (
      <div className="flex justify-between items-center py-4 text-xs text-gray-500 font-medium border-t border-gray-100 mt-4 pt-4">
        <span>Showing {(currPage - 1) * 10 + 1} to {Math.min(currPage * 10, total)} of {total} members</span>
        <div className="flex gap-1 items-center">
          <button disabled={currPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 disabled:opacity-50">&lt;</button>
          {[...Array(pages)].map((_, i) => (
            <button key={i} onClick={() => setPage(i + 1)} className={`w-6 h-6 rounded font-bold transition-colors ${currPage === i + 1 ? 'bg-white text-[#0D8A72] shadow border border-gray-200' : 'hover:bg-gray-100 text-gray-600'}`}>{i + 1}</button>
          ))}
          <button disabled={currPage === pages} onClick={() => setPage(p => Math.min(pages, p + 1))} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 disabled:opacity-50">&gt;</button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h3 className="font-bold text-gray-800 text-lg">Team Directory</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input 
              type="text" 
              placeholder="Search member..." 
              className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#0D8A72] w-52"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>
          <select className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 outline-none font-medium" value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}>
            <option>All Departments</option>
            {departments.map(d => <option key={d._id}>{d.name}</option>)}
          </select>
          <select className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 outline-none font-medium" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
            <option>All Roles</option>
            {roles.map(r => <option key={r._id}>{r.title}</option>)}
          </select>
          <select className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 outline-none font-medium" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option>All Status</option>
            <option value="Available">Available</option>
            <option value="Busy">Busy</option>
            <option value="On Leave">On Leave</option>
          </select>
          <div className="flex bg-gray-50 border border-gray-200 rounded-lg p-0.5">
            <button onClick={()=>setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode==='grid'?'bg-white shadow text-[#0D8A72]':'text-gray-400'}`}><FiGrid/></button>
            <button onClick={()=>setViewMode('list')} className={`p-1.5 rounded-md ${viewMode==='list'?'bg-white shadow text-[#0D8A72]':'text-gray-400'}`}><FiList/></button>
          </div>
          <button onClick={() => handleOpenModal()} className="bg-[#0D8A72] text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#0a6b58] transition-colors ml-2">
            <FiPlus /> Add Member
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[11px] uppercase text-gray-400 font-bold border-b border-gray-100">
                <th className="pb-3 px-2 font-bold">Member</th>
                <th className="pb-3 px-2 font-bold">Role & Dept</th>
                <th className="pb-3 px-2 font-bold">Contact</th>
                <th className="pb-3 px-2 font-bold">Current Project</th>
                <th className="pb-3 px-2 font-bold">Status</th>
                <th className="pb-3 px-2 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (!membersData?.data || membersData.data.length === 0) ? (
                <tr><td colSpan="6" className="text-center py-10"><LogoLoader/></td></tr>
              ) : (membersData?.data || []).map(member => (
                <tr key={member._id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors text-xs">
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <img src={member.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=f3f4f6&color=333`} alt="" className="w-8 h-8 rounded-full" />
                      <div>
                        <p className="font-bold text-gray-800 whitespace-nowrap">{member.name}</p>
                        <p className="text-[10px] text-gray-500">{member.employeeId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <p className="font-bold text-gray-700 whitespace-nowrap">{member.roleId?.title}</p>
                    <p className="text-[10px] text-gray-500">{member.departmentId?.name}</p>
                  </td>
                  <td className="py-3 px-2">
                    <p className="text-gray-600">{member.email}</p>
                    <p className="text-[10px] text-gray-500">{member.phone}</p>
                  </td>
                  <td className="py-3 px-2">
                    {member.currentAssignment ? (
                      <span className="font-bold text-gray-700">{member.currentAssignment.projectName}</span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-3 px-2">
                     <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${
                        member.availabilityStatus === 'Available' ? 'bg-green-100 text-green-700' :
                        (member.availabilityStatus === 'Busy' || member.availabilityStatus === 'On Job') ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{member.availabilityStatus}</span>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <div className="flex justify-end gap-1 text-gray-400">
                      <button className="p-1.5 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors" onClick={() => handleOpenModal(member)}><FiEdit2/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(membersData?.data || []).map(member => (
            <div key={member._id} className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
               <img src={member.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=ffffff&color=333`} alt="" className="w-16 h-16 rounded-full border border-gray-200 mb-2 shadow-sm" />
               <h4 className="font-bold text-gray-800">{member.name}</h4>
               <p className="text-xs font-medium text-gray-500 mb-1">{member.roleId?.title}</p>
               <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${member.availabilityStatus === 'Available' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>{member.availabilityStatus}</span>
               <div className="w-full mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-2 text-xs">
                 <div>
                   <p className="text-gray-400 font-bold text-[9px] uppercase">Department</p>
                   <p className="font-semibold text-gray-700 truncate">{member.departmentId?.name}</p>
                 </div>
                 <div>
                   <p className="text-gray-400 font-bold text-[9px] uppercase">Contact</p>
                   <p className="font-semibold text-gray-700 truncate">{member.phone}</p>
                 </div>
               </div>
            </div>
          ))}
        </div>
      )}
      
      {!loading && (membersData?.data || []).length > 0 && renderPagination()}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">{editingId ? 'Edit Team Member' : 'Add Team Member'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                  <input required type="text" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                  <input required type="email" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Phone <span className="text-red-500">*</span></label>
                  <input required type="text" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Employment Type</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.employmentType} onChange={(e) => setFormData({...formData, employmentType: e.target.value})}>
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Freelance">Freelance</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Department</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.departmentId} onChange={(e) => setFormData({...formData, departmentId: e.target.value})}>
                    <option value="">Select Department</option>
                    {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Role/Title</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={formData.roleId} onChange={(e) => setFormData({...formData, roleId: e.target.value})}>
                    <option value="">Select Role</option>
                    {roles.map(r => <option key={r._id} value={r._id}>{r.title}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-bold text-white bg-[#0D8A72] hover:bg-[#0a6b58] rounded-lg">
                  {loading ? 'Saving...' : 'Save Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default TeamMembersTab;
