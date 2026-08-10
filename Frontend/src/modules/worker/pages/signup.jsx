import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiCheckCircle, FiArrowRight, FiArrowLeft, FiChevronLeft, FiUser, FiPhone, FiLock, FiMapPin, FiMail, FiBriefcase, FiClock, FiTool } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { workerAuthService } from '../../../services/authService';
import Logo from '../../../components/common/Logo';
import LogoLoader from '../../../components/common/LogoLoader';
import KYCVerificationStep from '../../../components/kyc/KYCVerificationStep';
import ValidatedInput from '../../../components/common/ValidatedInput';
import FieldRoleSignupToggle from '../../../components/auth/FieldRoleSignupToggle';
import { validators } from '../../../utils/validationUtils';
import useRegistrationDraft from '../../../hooks/useRegistrationDraft';

const toAssetUrl = (url) => {
  if (!url) return '';
  let finalUrl = url;
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) {
    finalUrl = clean;
  } else if (clean.startsWith('/') && !clean.startsWith('/upload')) {
    return clean;
  } else {
    const base = (import.meta.env.VITE_API_BASE_URL || 'https://app.wbinfs.com').replace(/\/api$/, '');
    finalUrl = `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
  }
  return finalUrl;
};

const generateObjectId = () => {
  const timestamp = Math.floor(new Date().getTime() / 1000).toString(16);
  const randomHex = 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, () => Math.floor(Math.random() * 16).toString(16));
  return (timestamp + randomHex).toLowerCase();
};

export default function WorkerSignup() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const kycRef = React.useRef(null);

  const {
    draftKey,
    entityId: draftEntityId,
    ready: draftReady,
    restored: draftRestored,
    scheduleSave,
    clearDraft
  } = useRegistrationDraft('worker');

  const [formData, setFormData] = useState({
    tempEntityId: generateObjectId(),
    name: '',
    phone: '',
    password: '',
    serviceCategories: [],
    workerServices: [], // Array of { categoryId, serviceId, experienceYears, experienceMonths, specificSkills }
    address: { city: '', pincode: '' },
    serviceRadius: 20,
    availability: {
      workingDays: [],
      workingHours: ''
    },
    verifications: {}
  });

  const [validationState, setValidationState] = useState({});

  useEffect(() => {
    localStorage.removeItem('workerAccessToken');
    localStorage.removeItem('workerRefreshToken');
    localStorage.removeItem('workerData');
    
    const loadConfig = async () => {
      try {
        const response = await workerAuthService.getRegistrationConfig();
        if (response.success) {
          setConfig(response.config);
        } else {
          toast.error('Failed to load registration configuration');
        }
      } catch (err) {
        toast.error('Error connecting to server. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    if (!draftReady || !draftRestored) return;
    const p = draftRestored.payload || {};
    setFormData((prev) => ({
      ...prev,
      ...p,
      tempEntityId: draftRestored.entityId || draftEntityId || prev.tempEntityId,
      verifications: p.verifications || prev.verifications || {}
    }));
    if (draftRestored.currentStep != null) setCurrentStep(Number(draftRestored.currentStep) || 1);
  }, [draftReady, draftRestored, draftEntityId]);

  useEffect(() => {
    scheduleSave({
      formData,
      currentStep,
      phone: formData.phone,
      email: formData.email
    });
  }, [formData, currentStep, scheduleSave]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleCategoryToggle = (categoryId) => {
    setFormData(prev => {
      const isSelected = prev.serviceCategories.includes(categoryId);
      if (isSelected) {
        return { 
          ...prev, 
          serviceCategories: prev.serviceCategories.filter(id => id !== categoryId),
          workerServices: prev.workerServices.filter(ws => ws.categoryId !== categoryId)
        };
      } else {
        return { ...prev, serviceCategories: [...prev.serviceCategories, categoryId] };
      }
    });
  };

  const handleServiceToggle = (categoryId, serviceId) => {
    setFormData(prev => {
      const existingIndex = prev.workerServices.findIndex(ws => ws.serviceId === serviceId);
      if (existingIndex > -1) {
        const newWs = [...prev.workerServices];
        newWs.splice(existingIndex, 1);
        return { ...prev, workerServices: newWs };
      } else {
        return { 
          ...prev, 
          workerServices: [...prev.workerServices, { 
            categoryId, 
            serviceId, 
            experienceYears: 0, 
            experienceMonths: 0, 
            specificSkills: [] 
          }] 
        };
      }
    });
  };

  const updateWorkerService = (serviceId, field, value) => {
    setFormData(prev => {
      const newWs = prev.workerServices.map(ws => {
        if (ws.serviceId === serviceId) {
          return { ...ws, [field]: value };
        }
        return ws;
      });
      return { ...prev, workerServices: newWs };
    });
  };

  const validateStep = (step) => {
    if (step === 1) {
      if (!formData.name || !formData.phone || !formData.password) {
        toast.error("Please fill all required basic info fields.");
        return false;
      }
    } else if (step === 2) {
      if (formData.serviceCategories.length === 0) {
        toast.error("Please select at least one service category.");
        return false;
      }
    } else if (step === 3) {
      if (formData.workerServices.length === 0) {
        toast.error("Please select at least one one-time service.");
        return false;
      }
    } else if (step === 7) { // KYC
      if (kycRef.current) {
        return kycRef.current.validate();
      }
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) setCurrentStep(prev => prev + 1);
  };

  const prevStep = () => setCurrentStep(prev => prev - 1);

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        roleType: 'Worker',
        role: 'worker',
      };
      delete payload.tempEntityId;
      delete payload.verifications;

      const response = await workerAuthService.register(payload);
      if (response.success) {
        await clearDraft();
        toast.success(
          <div className="flex flex-col">
            <span className="font-bold">Welcome Onboard!</span>
            <span className="text-xs">Your account is pending approval.</span>
          </div>,
          { icon: <FiCheckCircle className="text-green-500" /> }
        );
        navigate('/worker/login', { replace: true });
      } else {
        toast.error(response.message || 'Registration failed');
      }
    } catch (error) {
      if (error.response?.data?.errors?.length > 0) {
        toast.error(error.response.data.errors[0].msg || 'Validation failed');
      } else {
        toast.error(error.response?.data?.message || 'Registration failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContent = () => {
    if (isLoading) return <div className="flex-1 flex items-center justify-center"><LogoLoader fullScreen={false} /></div>;
    if (!config) return <div className="text-center p-8">Configuration failed to load. Please refresh.</div>;

    const totalSteps = 7; // 1: Basic, 2: Category, 3: Services, 4: Exp, 5: Radius, 6: Avail, 7: Docs

    return (
      <main className="max-w-3xl mx-auto w-full p-4 sm:p-6 lg:p-8 flex-1">
        <div className="bg-white rounded-2xl shadow-sm border p-6">
            
            {/* Stepper Header */}
            <div className="flex items-center justify-between mb-8 overflow-x-auto pb-4 scrollbar-hide">
              {Array.from({length: totalSteps}, (_, i) => i + 1).map((step) => (
                <React.Fragment key={step}>
                  <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-xs shrink-0 shadow-sm transition-all ${currentStep >= step ? 'bg-black text-white ring-2 ring-black/20' : 'bg-gray-100 text-gray-400'}`}>
                    {step}
                  </div>
                  {step < totalSteps && <div className={`flex-1 h-1 mx-1 rounded-full transition-all min-w-[10px] ${currentStep > step ? 'bg-black' : 'bg-gray-100'}`} />}
                </React.Fragment>
              ))}
            </div>

            {/* Step 1: Basic Info */}
            {currentStep === 1 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-black text-gray-800">Basic Information</h2>
                  <p className="text-sm text-gray-500 mt-2">Enter your personal details to get started.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  <ValidatedInput label="" name="name" value={formData.name} onChange={handleChange} type="text" placeholder="Enter Full Name" required={true} />
                  <ValidatedInput label="" name="phone" value={formData.phone} onChange={handleChange} type="tel" placeholder="Enter Phone Number" required={true} />
                  <div className="md:col-span-2">
                    <ValidatedInput label="" name="password" value={formData.password} onChange={handleChange} type="password" placeholder="Create Password" required={true} />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Select Category */}
            {currentStep === 2 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-black text-gray-800">Select Service Category</h2>
                  <p className="text-sm text-gray-500 mt-2">What type of one-time services do you provide?</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {config?.categories?.map(cat => {
                    const isSelected = formData.serviceCategories.includes(cat.id || cat._id);
                    return (
                      <div 
                        key={cat.id || cat._id}
                        onClick={() => handleCategoryToggle(cat.id || cat._id)}
                        className={`cursor-pointer border-2 rounded-2xl p-4 transition-all flex items-center gap-4 ${isSelected ? 'border-black bg-black/5' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'}`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isSelected ? 'bg-black text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
                          <FiBriefcase className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">{cat.name || cat.title}</h3>
                          <p className="text-xs text-gray-500 line-clamp-1">{cat.description || 'One-time professional services'}</p>
                        </div>
                        {isSelected && <FiCheckCircle className="w-6 h-6 ml-auto text-black" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Select Services */}
            {currentStep === 3 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-black text-gray-800">Select Services</h2>
                  <p className="text-sm text-gray-500 mt-2">Choose the specific one-time jobs you can perform</p>
                </div>
                <div className="space-y-6">
                  {formData.serviceCategories.map(catId => {
                    const cat = config?.categories?.find(c => (c.id || c._id) === catId);
                    if (!cat) return null; // Prevent empty boxes if category is stale from draft
                    const catServices = config?.subServices?.filter(s => s.categoryId === catId) || [];
                    return (
                      <div key={catId} className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                        <h3 className="font-bold text-lg mb-4 text-gray-800 flex items-center gap-2">
                          <FiTool className="text-gray-500" /> {cat?.name}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {catServices.map(srv => {
                            const isSelected = formData.workerServices.some(ws => ws.serviceId === (srv.id || srv._id));
                            return (
                              <div 
                                key={srv.id || srv._id}
                                onClick={() => handleServiceToggle(catId, srv.id || srv._id)}
                                className={`group cursor-pointer border p-3 rounded-xl flex items-center justify-between transition-all duration-200 ${isSelected ? 'bg-black text-white border-black shadow-md scale-[1.02]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isSelected ? 'bg-white/20' : 'bg-gray-50 group-hover:bg-gray-100'}`}>
                                    <FiTool className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-gray-400'}`} />
                                  </div>
                                  <span className="font-bold text-sm">{srv.name || srv.title}</span>
                                </div>
                                {isSelected && <FiCheckCircle className="w-5 h-5 shrink-0 text-white" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 4: Experience */}
            {currentStep === 4 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-black text-gray-800">Experience</h2>
                  <p className="text-sm text-gray-500 mt-2">How many years of experience do you have?</p>
                </div>
                <div className="space-y-4">
                  {formData.workerServices.map(ws => {
                    const srv = config?.subServices?.find(s => (s.id || s._id) === ws.serviceId);
                    return (
                      <div key={ws.serviceId} className="bg-white border rounded-xl p-4 flex items-center justify-between gap-4">
                        <label className="text-sm font-bold text-gray-700 flex-1">{srv?.name || srv?.title}</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" min="0" max="50"
                            placeholder="Years"
                            className="w-20 bg-gray-50 border border-gray-100 rounded-lg py-2 px-3 text-sm text-center focus:outline-none focus:border-black"
                            value={ws.experienceYears}
                            onChange={(e) => updateWorkerService(ws.serviceId, 'experienceYears', parseInt(e.target.value) || 0)}
                          />
                          <span className="text-xs text-gray-500 font-bold uppercase">Yrs</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 5: Service Radius */}
            {currentStep === 5 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-black text-gray-800">Service Radius</h2>
                  <p className="text-sm text-gray-500 mt-2">How far are you willing to travel for a job?</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-6 border text-center space-y-6">
                  <FiMapPin className="w-12 h-12 mx-auto text-black/50" />
                  <div>
                    <h3 className="font-black text-4xl text-gray-900">{formData.serviceRadius} <span className="text-lg text-gray-500">KM</span></h3>
                    <p className="text-sm text-gray-500 mt-1">Maximum travel distance from your location</p>
                  </div>
                  <input 
                    type="range" min="5" max="100" step="5"
                    className="w-full accent-black"
                    value={formData.serviceRadius}
                    onChange={(e) => setFormData(p => ({...p, serviceRadius: parseInt(e.target.value)}))}
                  />
                  <div className="flex justify-between text-xs font-bold text-gray-400">
                    <span>5 KM</span>
                    <span>100 KM</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: Availability */}
            {currentStep === 6 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-black text-gray-800">Availability</h2>
                  <p className="text-sm text-gray-500 mt-2">Set your typical working days and hours</p>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Working Days</label>
                    <div className="flex flex-wrap gap-2">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                        const isSelected = formData.availability.workingDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => setFormData(p => ({
                              ...p, 
                              availability: {
                                ...p.availability,
                                workingDays: isSelected 
                                  ? p.availability.workingDays.filter(d => d !== day)
                                  : [...p.availability.workingDays, day]
                              }
                            }))}
                            className={`px-4 py-2.5 rounded-full text-sm font-bold transition-all border ${isSelected ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Working Hours</label>
                    <select
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-4 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/30 transition-all appearance-none"
                      value={formData.availability.workingHours}
                      onChange={(e) => setFormData(p => ({...p, availability: { ...p.availability, workingHours: e.target.value }}))}
                    >
                      <option value="">Select typical hours</option>
                      <option value="9:00 AM - 6:00 PM">9:00 AM - 6:00 PM (Standard)</option>
                      <option value="8:00 AM - 8:00 PM">8:00 AM - 8:00 PM (Extended)</option>
                      <option value="24/7">24/7 Emergency Services</option>
                      <option value="Night Shift">Night Shift</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 7: KYC Step */}
            {currentStep === 7 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-black text-gray-800">Document Verification</h2>
                  <p className="text-sm text-gray-500 mt-2">Upload certificates or KYC documents</p>
                </div>
                <KYCVerificationStep 
                  ref={kycRef}
                  role="worker" 
                  mobileNumber={formData.phone}
                  entityId={formData.tempEntityId}
                  draftId={draftKey}
                  initialVerifications={formData.verifications || {}}
                  onComplete={(verifications) => setFormData(prev => ({ ...prev, verifications }))}
                />
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-3 pt-6 border-t mt-8">
              {currentStep > 1 && (
                <button type="button" onClick={prevStep} className="flex-none px-4 sm:px-6 py-4 border-2 border-gray-200 text-gray-900 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-95 transition-all">
                  <FiChevronLeft className="w-5 h-5" /> <span className="hidden sm:inline">Back</span>
                </button>
              )}
              {currentStep < totalSteps ? (
                <button type="button" onClick={nextStep} className="flex-1 py-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 active:scale-95 shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all text-sm sm:text-base whitespace-nowrap">
                  Continue <FiArrowRight className="w-5 h-5" />
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="flex-1 py-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-1.5 sm:gap-2 hover:bg-gray-800 active:scale-95 shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all disabled:opacity-70 disabled:active:scale-100 text-sm sm:text-base whitespace-nowrap">
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>Complete Registration <FiCheckCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" /></>
                  )}
                </button>
              )}
            </div>

          </div>
      </main>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <nav className="bg-white px-6 py-4 border-b flex items-center justify-between shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link to="/worker/login" className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
            <FiArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <Logo src="/logo/TazkYLogo_circle.png" circle={true} className="w-9 h-9" />
        </div>
        <FieldRoleSignupToggle />
      </nav>
      {renderContent()}
    </div>
  );
}
