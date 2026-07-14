import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiStar, FiAlertCircle } from 'react-icons/fi';
import { useWorkforce } from '../../../hooks/useWorkforce';
import LogoLoader from '../../../../../components/common/LogoLoader';
import toast from 'react-hot-toast';

const SkillMatrixTab = () => {
  const { getSkills, getSkillGapAnalysis, createSkill, updateSkill, deleteSkill, loading } = useWorkforce();
  
  const [skills, setSkills] = useState([]);
  const [gaps, setGaps] = useState([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({ 
    name: '', category: 'Technical', description: '', color: '#10B981' 
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [skillsRes, gapsRes] = await Promise.all([getSkills(), getSkillGapAnalysis()]);
      if (skillsRes?.success) setSkills(skillsRes.data || []);
      if (gapsRes?.success) setGaps(gapsRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenModal = (skill = null) => {
    if (skill) {
      setEditingId(skill._id);
      setFormData({ 
        name: skill.name, category: skill.category || 'Technical', 
        description: skill.description || '', color: skill.color || '#10B981' 
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', category: 'Technical', description: '', color: '#10B981' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateSkill(editingId, formData);
      } else {
        await createSkill(formData);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this skill?')) {
      try {
        await deleteSkill(id);
        fetchData();
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (loading && skills.length === 0) return <div className="py-20"><LogoLoader /></div>;

  const categories = ['Technical', 'Soft Skill', 'Safety', 'Equipment', 'Language', 'Other'];

  return (
    <div className="space-y-6">
      
      {/* Skill Gaps Alert Box */}
      {gaps.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-orange-800 font-bold mb-3">
            <FiAlertCircle size={18} />
            <h4>Skill Gap & Expiry Alerts</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gaps.map(gap => (
              <div key={gap.member._id} className="bg-white rounded-lg p-3 shadow-sm border border-orange-100 flex items-start gap-3">
                <img src={gap.member.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(gap.member.name)}`} className="w-8 h-8 rounded-full shrink-0"/>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{gap.member.name}</p>
                  {gap.missingSkillCount > 0 && <p className="text-[10px] font-bold text-red-500 mt-0.5">Missing {gap.missingSkillCount} core skills</p>}
                  {gap.expiringSkillCount > 0 && <p className="text-[10px] font-bold text-orange-500 mt-0.5">Expiring: {gap.expiringSkills?.join(', ')}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills Catalog */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-800">Skills Catalog</h3>
        <button onClick={() => handleOpenModal()} className="bg-[#0D8A72] text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#0a6b58] transition-colors">
          <FiPlus /> Add Skill
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {skills.map((skill) => (
          <div key={skill._id} className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow group">
            <div className="p-5 flex-grow flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${skill.color}20`, color: skill.color }}>
                    <FiStar size={18} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm leading-tight">{skill.name}</h4>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{skill.category}</span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleOpenModal(skill)} className="p-1 text-blue-500 hover:bg-blue-50 rounded"><FiEdit2 size={14}/></button>
                  <button onClick={() => handleDelete(skill._id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><FiTrash2 size={14}/></button>
                </div>
              </div>
              
              <p className="text-xs text-gray-500 mt-2 flex-grow line-clamp-3">{skill.description || 'No description provided.'}</p>
              
              <div className="pt-4 mt-4 border-t border-gray-50 flex justify-between items-center text-xs">
                <span className="text-gray-500 font-medium">Certified Team Members:</span>
                <span className="font-bold text-[#0D8A72] bg-teal-50 px-2 py-0.5 rounded-full">{skill.memberCount || 0}</span>
              </div>
            </div>
          </div>
        ))}
        {skills.length === 0 && !loading && (
          <div className="col-span-full py-10 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            No skills found in the catalog. Add one to track team capabilities.
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">{editingId ? 'Edit Skill' : 'Add Skill'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Skill Name <span className="text-red-500">*</span></label>
                <input required type="text" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#0D8A72]" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g. HVAC Repair" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Category</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#0D8A72]" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Theme Color</label>
                  <div className="flex gap-2 h-[38px]">
                    <input type="color" className="h-full w-12 rounded cursor-pointer border-0 p-0" value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} />
                    <input type="text" className="w-full h-full px-3 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#0D8A72]" value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Description</label>
                <textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#0D8A72]" rows="3" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Details about this skill requirements" />
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-gray-50">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-bold text-white bg-[#0D8A72] hover:bg-[#0a6b58] rounded-lg">
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

export default SkillMatrixTab;
