import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiBriefcase, FiX, FiPlus, FiAlertCircle, FiSettings, FiTool, FiCheckCircle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import engineerService from '../../../../services/engineerService';
import { engineerAuthService } from '../../../../services/authService';
import LogoLoader from '../../../../components/common/LogoLoader';

export default function EngineerSkills() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Master Configuration
  const [categories, setCategories] = useState([]);
  const [allSubServices, setAllSubServices] = useState([]);
  
  // Selections
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubServices, setSelectedSubServices] = useState([]);
  const [isCategoryPreExisting, setIsCategoryPreExisting] = useState(false);
  
  // Custom tag input field state for each subservice
  const [customInputMap, setCustomInputMap] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch Config
        const configRes = await engineerAuthService.getRegistrationConfig();
        let loadedCategories = [];
        if (configRes.success) {
          loadedCategories = configRes.config.categories || [];
          setCategories(loadedCategories);
          setAllSubServices(configRes.config.subServices || []);
        }

        // 2. Fetch User Profile
        const profileRes = await engineerService.getProfile();
        if (profileRes.success && profileRes.engineer) {
          const profile = profileRes.engineer;
          
          let resolvedCatId = '';
          if (profile.serviceCategories && profile.serviceCategories.length > 0) {
            const profileCatStr = profile.serviceCategories[0]?.toString().trim().toLowerCase();
            const cat = loadedCategories.find(c => {
              const cName = (c.name || c.title || '').toString().trim().toLowerCase();
              const cId = (c._id || c.id || '').toString().trim().toLowerCase();
              return cName === profileCatStr || cId === profileCatStr;
            });
            if (cat) {
              resolvedCatId = cat._id || cat.id;
            }
          }
          
          // Fallback: Try resolving category from subServices configuration
          if (!resolvedCatId && profile.subServices && profile.subServices.length > 0) {
            const firstSubService = profile.subServices[0];
            const firstSubId = firstSubService.subServiceId?._id || firstSubService.subServiceId || '';
            if (firstSubId) {
              const subConfig = configRes.config.subServices?.find(s => 
                s._id?.toString() === firstSubId.toString() || 
                s.id?.toString() === firstSubId.toString()
              );
              if (subConfig && subConfig.categoryId) {
                resolvedCatId = subConfig.categoryId.toString();
              }
            }
          }

          if (resolvedCatId) {
            setSelectedCategory(resolvedCatId);
            setIsCategoryPreExisting(true);
          }
          
          if (profile.subServices && profile.subServices.length > 0) {
            const mapped = profile.subServices.map(s => ({
              subServiceId: s.subServiceId?._id || s.subServiceId || '',
              name: s.name || '',
              skills: s.skills || [],
              customSkills: s.customSkills || [],
              tools: s.tools || [],
              experienceLevel: s.experienceLevel || '',
              yearsOfExperience: s.yearsOfExperience || 0
            })).filter(s => s.subServiceId);
            setSelectedSubServices(mapped);
          }
        }
      } catch (error) {
        console.error('Fetch error:', error);
        toast.error('Failed to load profile skills');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCategorySelect = (catId) => {
    setSelectedCategory(catId);
    setSelectedSubServices([]);
  };

  const toggleSubService = (subService) => {
    setSelectedSubServices(prev => {
      const exists = prev.find(s => s.subServiceId === subService._id);
      if (exists) {
        return prev.filter(s => s.subServiceId !== subService._id);
      } else {
        return [...prev, {
          subServiceId: subService._id,
          name: subService.name,
          skills: [],
          customSkills: [],
          tools: [],
          experienceLevel: '',
          yearsOfExperience: 0
        }];
      }
    });
  };

  const updateSubServiceField = (subServiceId, field, value) => {
    setSelectedSubServices(prev => prev.map(s => 
      s.subServiceId === subServiceId ? { ...s, [field]: value } : s
    ));
  };

  const toggleSkill = (subServiceId, skillName) => {
    setSelectedSubServices(prev => prev.map(s => {
      if (s.subServiceId === subServiceId) {
        const skills = s.skills.includes(skillName)
          ? s.skills.filter(name => name !== skillName)
          : [...s.skills, skillName];
        return { ...s, skills };
      }
      return s;
    }));
  };

  const handleSave = async () => {
    if (!selectedCategory) {
      toast.error('Please select a domain category.');
      return;
    }
    if (selectedSubServices.length === 0) {
      toast.error('Please select at least one specialization subservice.');
      return;
    }

    try {
      setIsSaving(true);
      const cat = categories.find(c => 
        c._id?.toString() === selectedCategory?.toString() || 
        c.id?.toString() === selectedCategory?.toString()
      );
      const catName = cat ? (cat.name || cat.title) : '';
      if (!catName) {
        toast.error('Invalid category selection.');
        setIsSaving(false);
        return;
      }

      const payload = {
        serviceCategories: [catName],
        subServices: selectedSubServices.map(s => ({
          subServiceId: s.subServiceId,
          name: s.name || '',
          skills: s.skills || [],
          customSkills: (s.customSkills || []).map(cs => typeof cs === 'string' ? { name: cs, status: 'pending' } : { name: cs.name || '', status: cs.status || 'pending' }),
          tools: s.tools || [],
          experienceLevel: s.experienceLevel || '',
          yearsOfExperience: parseInt(s.yearsOfExperience, 10) || 0
        }))
      };

      const res = await engineerService.updateSkillsProfile(payload);
      if (res.success) {
        toast.success('Profile skills updated successfully!');
        navigate(-1);
      } else {
        toast.error(res.message || 'Failed to update skills');
      }
    } catch (err) {
      console.error('Update engineer skills error:', err);
      toast.error(err.response?.data?.message || err.message || 'Error updating skills');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <LogoLoader />;

  const availableSubServices = allSubServices.filter(s => s.categoryId?.toString() === selectedCategory?.toString());

  return (
    <div className="min-h-screen bg-[#F8FCFC] font-sans text-[#0F172A] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-50 active:scale-95 transition-all">
            <FiArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold">Skills & Expertise</h1>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="px-5 py-2.5 bg-[#4F46E5] text-white text-sm font-semibold rounded-xl hover:bg-[#4338CA] transition-colors disabled:opacity-50 shadow-sm"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <main className="px-4 pt-6 space-y-6 max-w-3xl mx-auto">
        {/* Category Domain */}
        {isCategoryPreExisting ? (
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold mb-1">Your Registered Category</h2>
            <p className="text-xs text-gray-500 mb-4">Your core category domain registered at WBI.</p>
            
            <div className="flex items-center p-4 rounded-2xl border border-[#4F46E5]/20 bg-[#4F46E5]/5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mr-3 bg-[#4F46E5] text-white">
                <FiBriefcase className="w-5 h-5" />
              </div>
              <div>
                <span className="block font-bold text-sm text-[#4F46E5]">
                  {categories.find(c => c._id?.toString() === selectedCategory?.toString())?.name || 'Loading category...'}
                </span>
                <span className="block text-[10px] text-gray-500 mt-0.5">
                  Core domain category cannot be changed.
                </span>
              </div>
            </div>
          </section>
        ) : (
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold mb-1">Primary Domain Category</h2>
            <p className="text-xs text-gray-500 mb-4">Select your primary service category domain.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categories.map(cat => {
                const isSelected = selectedCategory === cat._id;
                return (
                  <button
                    key={cat._id}
                    onClick={() => handleCategorySelect(cat._id)}
                    className={`flex items-center p-4 rounded-2xl border-2 text-left transition-all ${
                      isSelected ? 'border-[#4F46E5] bg-[#4F46E5]/5' : 'border-gray-100 hover:border-gray-200 bg-white'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3 ${
                      isSelected ? 'bg-[#4F46E5] text-white' : 'bg-gray-50 text-gray-400'
                    }`}>
                      <FiBriefcase className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`block font-bold text-sm ${isSelected ? 'text-[#4F46E5]' : 'text-gray-800'}`}>
                        {cat.name}
                      </span>
                    </div>
                    {isSelected && <FiCheck className="ml-auto text-[#4F46E5] w-5 h-5" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Specializations selection */}
        {selectedCategory && (
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold mb-1">Specializations</h2>
            <p className="text-xs text-gray-500 mb-4">Choose the sub-services you can work on.</p>

            <div className="flex flex-wrap gap-2.5">
              {availableSubServices.map(sub => {
                const isSelected = selectedSubServices.some(s => s.subServiceId === sub._id);
                return (
                  <button
                    key={sub._id}
                    onClick={() => toggleSubService(sub)}
                    className={`flex items-center px-4 py-2.5 rounded-full border transition-all text-xs font-semibold ${
                      isSelected 
                        ? 'border-[#4F46E5] bg-[#4F46E5] text-white shadow-sm' 
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {isSelected && <FiCheck className="mr-1.5 w-3.5 h-3.5" />}
                    {sub.name}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Bottom Save Changes Bar */}
        <div className="pt-4 pb-8">
          <button 
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3.5 bg-[#4F46E5] text-white text-sm font-bold rounded-2xl hover:bg-[#4338CA] active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <FiCheck className="w-4 h-4" />
                <span>Save All Changes</span>
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
