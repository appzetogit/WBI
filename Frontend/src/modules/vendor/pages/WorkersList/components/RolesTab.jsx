import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiUsers, FiAward } from 'react-icons/fi';
import { useWorkforce } from '../../../hooks/useWorkforce';
import LogoLoader from '../../../../../components/common/LogoLoader';
import toast from 'react-hot-toast';

const RolesTab = () => {
  const { getRoles, createRole, updateRole, deleteRole, loading } = useWorkforce();
  const [roles, setRoles] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({ 
    title: '', level: 'Junior', permissions: [], 
    approvalRights: false, color: '#3B82F6', escalationLevel: 1 
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await getRoles();
      if (res?.success) setRoles(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenModal = (role = null) => {
    if (role) {
      setEditingId(role._id);
      setFormData({ 
        title: role.title, level: role.level || 'Junior', 
        permissions: role.permissions || [], 
        approvalRights: role.approvalRights || false, 
        color: role.color || '#3B82F6',
        escalationLevel: role.escalationLevel || 1
      });
    } else {
      setEditingId(null);
      setFormData({ title: '', level: 'Junior', permissions: [], approvalRights: false, color: '#3B82F6', escalationLevel: 1 });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateRole(editingId, formData);
      } else {
        await createRole(formData);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this role?')) {
      try {
        await deleteRole(id);
        fetchData();
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (loading && roles.length === 0) return <div className="py-20"><LogoLoader /></div>;

  const PERMISSION_OPTIONS = ['Manage Jobs', 'Manage Leaves', 'Approve Costs', 'Assign Projects', 'View Analytics'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-800">Roles & Titles Configuration</h3>
        <button onClick={() => handleOpenModal()} className="bg-[#0D8A72] text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#0a6b58] transition-colors">
          <FiPlus /> Add Role
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {roles.map((role) => (
          <div key={role._id} className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow group overflow-hidden">
            <div className="h-2 w-full" style={{ backgroundColor: role.color || '#3B82F6' }} />
            <div className="p-5 flex-grow flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-black text-gray-800 text-lg">{role.title}</h4>
                  <span className="inline-block mt-1 bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{role.level} Level</span>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleOpenModal(role)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><FiEdit2 size={14}/></button>
                  <button onClick={() => handleDelete(role._id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><FiTrash2 size={14}/></button>
                </div>
              </div>
              
              <div className="space-y-2 mt-2 flex-grow">
                <p className="text-[10px] uppercase font-bold text-gray-400">Permissions</p>
                {role.permissions?.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.map(p => (
                      <span key={p} className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">{p}</span>
                    ))}
                  </div>
                ) : <p className="text-xs text-gray-400 italic">No specific permissions</p>}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-4 mt-4 border-t border-gray-50">
                <div className="flex items-center gap-2">
                  <FiUsers className="text-gray-400" />
                  <span className="font-bold text-gray-700 text-sm">{role.memberCount || 0}</span>
                </div>
                {role.approvalRights && (
                  <div className="flex items-center gap-1 justify-end text-green-600">
                    <FiAward size={14} />
                    <span className="text-[10px] font-bold">Approver</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {roles.length === 0 && !loading && (
          <div className="col-span-full py-10 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            No roles found. Create your first role!
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">{editingId ? 'Edit Role' : 'Add Role'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Role Title <span className="text-red-500">*</span></label>
                  <input required type="text" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D8A72]/20 focus:border-[#0D8A72] text-sm" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} placeholder="e.g. Senior Technician" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Level</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D8A72]/20 focus:border-[#0D8A72] text-sm" value={formData.level} onChange={(e) => setFormData({...formData, level: e.target.value})}>
                    {['Trainee', 'Junior', 'Mid-Level', 'Senior', 'Lead', 'Manager', 'Director'].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Escalation Level (1 = Highest)</label>
                  <input type="number" min="1" max="10" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D8A72]/20 focus:border-[#0D8A72] text-sm" value={formData.escalationLevel} onChange={(e) => setFormData({...formData, escalationLevel: parseInt(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Theme Color</label>
                  <div className="flex gap-2 h-[38px]">
                    <input type="color" className="h-full w-12 rounded cursor-pointer border-0 p-0" value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} />
                    <input type="text" className="w-full h-full px-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#0D8A72] text-sm font-mono" value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Capabilities & Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {PERMISSION_OPTIONS.map(perm => (
                    <label key={perm} className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-100">
                      <input 
                        type="checkbox" 
                        className="accent-[#0D8A72]"
                        checked={formData.permissions.includes(perm)}
                        onChange={(e) => {
                          if(e.target.checked) setFormData({...formData, permissions: [...formData.permissions, perm]});
                          else setFormData({...formData, permissions: formData.permissions.filter(p => p !== perm)});
                        }}
                      /> {perm}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="approvalRights" 
                  className="w-4 h-4 accent-[#0D8A72]"
                  checked={formData.approvalRights}
                  onChange={(e) => setFormData({...formData, approvalRights: e.target.checked})}
                />
                <label htmlFor="approvalRights" className="text-sm font-bold text-gray-700 cursor-pointer">This role has Approval Rights (e.g. Timesheets, Leaves)</label>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-bold text-white bg-[#0D8A72] hover:bg-[#0a6b58] rounded-lg transition-colors disabled:opacity-50">
                  {loading ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesTab;
