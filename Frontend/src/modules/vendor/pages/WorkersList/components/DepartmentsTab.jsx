import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiUsers, FiBriefcase } from 'react-icons/fi';
import { useWorkforce } from '../../../hooks/useWorkforce';
import LogoLoader from '../../../../../components/common/LogoLoader';
import toast from 'react-hot-toast';

const DepartmentsTab = () => {
  const { getDepartments, createDepartment, updateDepartment, deleteDepartment, loading } = useWorkforce();
  const [departments, setDepartments] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({ name: '', description: '', color: '#10B981', capacity: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await getDepartments();
      if (res?.success) setDepartments(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenModal = (dept = null) => {
    if (dept) {
      setEditingId(dept._id);
      setFormData({ name: dept.name, description: dept.description || '', color: dept.color || '#10B981', capacity: dept.capacity || 0 });
    } else {
      setEditingId(null);
      setFormData({ name: '', description: '', color: '#10B981', capacity: 0 });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDepartment(editingId, formData);
      } else {
        await createDepartment(formData);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this department?')) {
      try {
        await deleteDepartment(id);
        fetchData();
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (loading && departments.length === 0) return <div className="py-20"><LogoLoader /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-800">Departments Management</h3>
        <button onClick={() => handleOpenModal()} className="bg-[#0D8A72] text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#0a6b58] transition-colors">
          <FiPlus /> Add Department
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {departments.map((dept) => (
          <div key={dept._id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden group">
            <div className="h-2 w-full" style={{ backgroundColor: dept.color || '#10B981' }} />
            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-black text-gray-800 text-lg">{dept.name}</h4>
                  <p className="text-xs text-gray-500 font-medium mt-1 line-clamp-2 min-h-[32px]">{dept.description || 'No description provided'}</p>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleOpenModal(dept)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><FiEdit2 size={14}/></button>
                  <button onClick={() => handleDelete(dept._id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><FiTrash2 size={14}/></button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                <div>
                  <p className="text-[10px] uppercase font-bold text-gray-400 mb-1 flex items-center gap-1"><FiUsers /> Headcount</p>
                  <p className="font-bold text-gray-700">{dept.headcount || 0} <span className="text-gray-400 text-xs font-normal">/ {dept.capacity || '∞'}</span></p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-gray-400 mb-1 flex items-center gap-1"><FiBriefcase /> Active Projects</p>
                  <p className="font-bold text-gray-700">{dept.activeProjects || 0}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
        {departments.length === 0 && !loading && (
          <div className="col-span-full py-10 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            No departments found. Create your first one!
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">{editingId ? 'Edit Department' : 'Add Department'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Department Name <span className="text-red-500">*</span></label>
                <input required type="text" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D8A72]/20 focus:border-[#0D8A72] text-sm" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g. Solar Maintenance" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Description</label>
                <textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D8A72]/20 focus:border-[#0D8A72] text-sm" rows="3" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Brief description of the department's function" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Capacity (Max Headcount)</label>
                  <input type="number" min="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D8A72]/20 focus:border-[#0D8A72] text-sm" value={formData.capacity} onChange={(e) => setFormData({...formData, capacity: parseInt(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Theme Color</label>
                  <div className="flex gap-2 h-[38px]">
                    <input type="color" className="h-full w-12 rounded cursor-pointer border-0 p-0" value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} />
                    <input type="text" className="w-full h-full px-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#0D8A72] text-sm font-mono" value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} />
                  </div>
                </div>
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

export default DepartmentsTab;
