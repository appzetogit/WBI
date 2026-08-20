import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiBriefcase, FiX, FiPlus, FiAlertCircle, FiSettings, FiTool, FiCheckCircle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import workerService from '../../../../services/workerService';
import { workerAuthService } from '../../../../services/authService';
import LogoLoader from '../../../../components/common/LogoLoader';

export default function WorkerSkills() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Master Configuration
  const [categories, setCategories] = useState([]);
  const [allSubServices, setAllSubServices] = useState([]);
  
  // Selections
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedSubServices, setSelectedSubServices] = useState([]);
  const [isCategoryPreExisting, setIsCategoryPreExisting] = useState(false);
  const [secondarySkills, setSecondarySkills] = useState([]);
  const [newSecondarySkill, setNewSecondarySkill] = useState('');
  
  // Custom tag input field state for each subservice
  const [customInputMap, setCustomInputMap] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch Config
        const configRes = await workerAuthService.getRegistrationConfig();
        let loadedCategories = [];
        if (configRes.success) {
          loadedCategories = configRes.config.categories || [];
          setCategories(loadedCategories);
          setAllSubServices(configRes.config.subServices || []);
        }

        // 2. Fetch User Profile
        const profileRes = await workerService.getProfile();
        if (profileRes.success && profileRes.worker) {
          const profile = profileRes.worker;
          
          if (profile.serviceCategories && profile.serviceCategories.length > 0) {
            const catIds = profile.serviceCategories.map(catItem => {
              const catNameOrId = typeof catItem === 'string' ? catItem : (catItem.name || catItem.title || catItem._id);
              const cat = loadedCategories.find(c => 
                (c.name || c.title || '').toLowerCase() === (catNameOrId || '').toLowerCase() ||
                (c._id || c.id || '').toString() === (catNameOrId || '').toString()
              );
              return cat ? (cat._id || cat.id) : (catItem._id || (typeof catItem === 'string' && catItem.match(/^[0-9a-fA-F]{24}$/) ? catItem : null));
            }).filter(Boolean);
            
            if (catIds.length > 0) {
              setSelectedCategories(catIds);
              setIsCategoryPreExisting(true);
            }
          } else if (profile.serviceCategory) {
            const cat = loadedCategories.find(c => 
              (c.name || c.title || '').toLowerCase() === profile.serviceCategory.toLowerCase() ||
              (c._id || c.id || '').toString() === profile.serviceCategory.toString()
            );
            if (cat) {
              setSelectedCategories([cat._id || cat.id]);
              setIsCategoryPreExisting(true);
            }
          }
          
          if (profile.secondarySkills) {
            setSecondarySkills(profile.secondarySkills);
          }
          
          if (profile.subServices && profile.subServices.length > 0) {
            const mapped = profile.subServices.map(s => ({
              subServiceId: s.subServiceId?._id || s.subServiceId || '',
              name: s.name || '',
              skills: s.skills || [],
              customSkills: s.customSkills || [],
              tools: s.tools || [],
              brandsHandled: s.brandsHandled || [],
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
    setSelectedCategories(prev => {
      if (prev.includes(catId)) {
        return prev.filter(id => id !== catId);
      } else {
        return [...prev, catId];
      }
    });
  };

  const handleAddSecondarySkill = () => {
    const trimmed = newSecondarySkill.trim();
    if (!trimmed) {
      toast.error('Please enter a service or skill name');
      return;
    }
    
    // Support comma-separated skills like "Carpentry, Plumbing"
    const skillsToAdd = trimmed
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    let addedCount = 0;
    setSecondarySkills(prev => {
      const updated = [...prev];
      skillsToAdd.forEach(s => {
        if (!updated.some(existing => existing.toLowerCase() === s.toLowerCase())) {
          updated.push(s);
          addedCount++;
        }
      });
      return updated;
    });

    if (addedCount > 0) {
      toast.success(addedCount === 1 ? `Added "${skillsToAdd[0]}"` : `Added ${addedCount} extra services`);
      setNewSecondarySkill('');
    } else {
      toast.error('Skill(s) already added!');
    }
  };

  const removeSecondarySkill = (skill) => {
    setSecondarySkills(prev => prev.filter(s => s !== skill));
    toast.success(`Removed "${skill}"`);
  };

  const toggleSubService = (subService) => {
    setSelectedSubServices(prev => {
      const exists = prev.find(s => 
        (s.subServiceId && s.subServiceId.toString() === subService._id.toString()) ||
        (s.name && s.name.toLowerCase() === subService.name.toLowerCase())
      );
      if (exists) {
        return prev.filter(s => 
          (s.subServiceId ? s.subServiceId.toString() !== subService._id.toString() : true) &&
          (s.name ? s.name.toLowerCase() !== subService.name.toLowerCase() : true)
        );
      } else {
        return [
          ...prev,
          {
            subServiceId: subService._id,
            name: subService.name,
            skills: [],
            customSkills: [],
            tools: [],
            brandsHandled: [],
            experienceLevel: '',
            yearsOfExperience: 0
          }
        ];
      }
    });
  };

  const handleSave = async () => {
    if (selectedCategories.length === 0 && secondarySkills.length === 0 && selectedSubServices.length === 0) {
      toast.error('Please select at least one category, specialization or extra service.');
      return;
    }

    try {
      setIsSaving(true);
      const selectedCatNames = categories
        .filter(c => selectedCategories.includes(c._id || c.id))
        .map(c => c.name || c.title);

      const payload = {
        serviceCategories: selectedCatNames,
        secondarySkills: secondarySkills || [],
        subServices: selectedSubServices.map(s => ({
          subServiceId: s.subServiceId,
          name: s.name || '',
          skills: s.skills || [],
          customSkills: (s.customSkills || []).map(cs => typeof cs === 'string' ? { name: cs, status: 'pending' } : { name: cs.name || '', status: cs.status || 'pending' }),
          tools: s.tools || [],
          brandsHandled: s.brandsHandled || [],
          experienceLevel: s.experienceLevel || '',
          yearsOfExperience: parseInt(s.yearsOfExperience, 10) || 0
        }))
      };

      const res = await workerService.updateSkillsProfile(payload);
      if (res.success) {
        toast.success('Profile skills updated successfully!');
        navigate(-1);
      } else {
        toast.error(res.message || 'Failed to update skills');
      }
    } catch (err) {
      console.error('Update skills error:', err);
      toast.error(err.response?.data?.message || err.message || 'Error updating skills');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <LogoLoader />;

  const availableSubServices = allSubServices.filter(s => selectedCategories.includes(s.categoryId?.toString()));

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
          className="px-5 py-2.5 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 shadow-sm"
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
            
              <div className="flex flex-col gap-2">
                {selectedCategories.map(catId => {
                  const cat = categories.find(c => c._id?.toString() === catId?.toString());
                  if (!cat) return null;
                  return (
                    <div key={cat._id} className="flex items-center p-4 rounded-2xl border border-gray-200/50 bg-gray-50/50">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mr-3 bg-black text-white">
                        <FiBriefcase className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="block font-bold text-sm text-black">
                          {cat.name}
                        </span>
                        <span className="block text-[10px] text-gray-500 mt-0.5">
                          Core domain category cannot be changed.
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
          </section>
        ) : (
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold mb-1">Primary Domain Category</h2>
            <p className="text-xs text-gray-500 mb-4">Select your primary service category domain.</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {categories.map(cat => {
                const isSelected = selectedCategories.includes(cat._id);
                return (
                  <button
                    key={cat._id}
                    onClick={() => handleCategorySelect(cat._id)}
                    className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 text-center transition-all ${
                      isSelected ? 'border-black bg-black/5 shadow-md' : 'border-gray-100 hover:border-gray-200 bg-white shadow-sm'
                    }`}
                  >
                    {isSelected && <FiCheckCircle className="absolute top-2.5 right-2.5 text-black w-4 h-4" />}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2.5 transition-all ${
                      isSelected ? 'bg-black text-white scale-110' : 'bg-gray-50 text-gray-400 group-hover:bg-gray-100'
                    }`}>
                      <FiBriefcase className="w-5 h-5" />
                    </div>
                    <span className={`block font-bold text-[11px] sm:text-xs leading-snug px-1 ${isSelected ? 'text-black' : 'text-gray-700'}`}>
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Other / Extra Services */}
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-bold mb-1">Other / Extra Services</h2>
          <p className="text-xs text-gray-500 mb-4">Add any extra services or skills you provide that aren't listed above.</p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="e.g. Carpentry, Plumbing"
              value={newSecondarySkill}
              onChange={(e) => setNewSecondarySkill(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSecondarySkill();
                }
              }}
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-all"
            />
            <button
              type="button"
              onClick={handleAddSecondarySkill}
              className="px-5 py-2.5 bg-black text-white text-xs font-bold rounded-xl hover:bg-gray-800 active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
            >
              <FiPlus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>
          {secondarySkills.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {secondarySkills.map(skill => (
                <span key={skill} className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-800 text-xs font-semibold rounded-xl shadow-xs animate-fadeIn">
                  <span>{skill}</span>
                  <button 
                    type="button"
                    onClick={() => removeSecondarySkill(skill)} 
                    className="text-gray-400 hover:text-red-500 p-0.5 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Specializations selection */}
        {selectedCategories.length > 0 && availableSubServices.length > 0 && (
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold mb-1">Specializations</h2>
            <p className="text-xs text-gray-500 mb-4">Choose the sub-services you can work on.</p>

            <div className="flex flex-wrap gap-2.5">
              {availableSubServices.map(sub => {
                const isSelected = selectedSubServices.some(s => 
                  (s.subServiceId && s.subServiceId.toString() === sub._id.toString()) ||
                  (s.name && s.name.toLowerCase() === sub.name.toLowerCase())
                );
                return (
                  <button
                    key={sub._id}
                    onClick={() => toggleSubService(sub)}
                    className={`flex items-center px-4 py-2.5 rounded-full border transition-all text-xs font-semibold ${
                      isSelected 
                        ? 'border-black bg-black text-white shadow-sm' 
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
            className="w-full py-3.5 bg-black text-white text-sm font-bold rounded-2xl hover:bg-gray-800 active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
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
