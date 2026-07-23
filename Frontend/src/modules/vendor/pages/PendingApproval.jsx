import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiCheck, FiFileText, FiShield,
  FiDollarSign, FiBookOpen, FiTruck, FiArrowRight,
  FiAlertCircle, FiGlobe
} from 'react-icons/fi';
import Logo from '../../../components/common/Logo';
import api from '../../../services/api';
import toast from 'react-hot-toast';
import KYCVerificationStep from '../../../components/kyc/KYCVerificationStep';

const PendingApproval = () => {
  const navigate = useNavigate();

  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(2);

  // Phase 2 State: KYC (synced via KYCVerificationStep + /onboarding/sync-kyc)
  const [kycSyncing, setKycSyncing] = useState(false);
  const [kycProgress, setKycProgress] = useState(null);
  const [documentRequirements, setDocumentRequirements] = useState([]);

  // Phase 3 State: Bank
  const [bankName, setBankName] = useState('');
  const [accountNum, setAccountNum] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [upiId, setUpiId] = useState('');
  const [bankVerifying, setBankVerifying] = useState(false);

  // Phase 4 State: Training
  const [language, setLanguage] = useState('English');
  const [quizAnswer, setQuizAnswer] = useState('');
  const [trainingVerifying, setTrainingVerifying] = useState(false);

  // Phase 5 State: Go-Live
  const [activating, setActivating] = useState(false);

  const getStoredVendorId = () => {
    try {
      const dataStr = localStorage.getItem('vendorData');
      if (!dataStr) return null;
      const v = JSON.parse(dataStr);
      return v._id || v.id || null;
    } catch {
      return null;
    }
  };

  const persistVendorSnapshot = (data) => {
    if (!data) return;
    try {
      const prev = JSON.parse(localStorage.getItem('vendorData') || '{}');
      const merged = {
        ...prev,
        ...data,
        _id: data._id || data.id || prev._id || prev.id
      };
      localStorage.setItem('vendorData', JSON.stringify(merged));
    } catch (_) {
      /* ignore */
    }
  };

  const applyOnboardingPayload = (data) => {
    if (!data) return;
    setVendor((prev) => ({ ...(prev || {}), ...data }));
    if (data.activeStep) setActiveStep(data.activeStep);
    persistVendorSnapshot(data);
  };

  const deriveStepFromVendor = (v) => {
    if (!v) return 2;
    if (v.approvalStatus === 'approved') return 5;
    if (v.kycStatus !== 'verified') return 2;
    if (v.bankStatus !== 'verified') return 3;
    if (v.inductionStatus !== 'completed') return 4;
    return 5;
  };

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const vendorId = getStoredVendorId();
      const token = localStorage.getItem('vendorAccessToken') || sessionStorage.getItem('vendorAccessToken');

      if (vendorId || token) {
        try {
          const res = await api.get('/vendor/onboarding/status', {
            params: vendorId ? { vendorId } : undefined
          });
          if (res.data?.success && res.data.data) {
            applyOnboardingPayload(res.data.data);
            if (res.data.data.isActivated) {
              navigate('/vendor/digital-solution/dashboard', { replace: true });
            }
            return;
          }
        } catch (apiErr) {
          if (apiErr.response?.status === 401 && !vendorId) {
            toast.error('Please sign in to continue onboarding.');
            navigate('/vendor/login');
            return;
          }
        }
      }

      if (token) {
        const res = await api.get('/vendors/profile');
        if (res.data?.success && res.data.vendor) {
          const v = res.data.vendor;
          const merged = {
            ...v,
            _id: v._id || v.id,
            activeStep: deriveStepFromVendor(v)
          };
          applyOnboardingPayload(merged);
          setActiveStep(merged.activeStep);
          if (v.approvalStatus === 'approved') {
            navigate('/vendor/digital-solution/dashboard', { replace: true });
          }
          return;
        }
      }
      
      const dataStr = localStorage.getItem('vendorData');
      if (dataStr) {
        try {
          const v = JSON.parse(dataStr);
          if (!v._id && !v.id) {
            toast.error('Session expired. Please sign in again.');
            localStorage.clear();
            navigate('/vendor/login');
            return;
          }
          setVendor(v);
          setActiveStep(deriveStepFromVendor(v));
        } catch (_) {}
      } else {
        toast.error('No active onboarding session found.');
        navigate('/vendor/login');
      }
    } catch (err) {
      const dataStr = localStorage.getItem('vendorData');
      if (dataStr) {
        try {
          const v = JSON.parse(dataStr);
          if (!v._id && !v.id) {
            toast.error('Session expired. Please sign in again.');
            localStorage.clear();
            navigate('/vendor/login');
            return;
          }
          setVendor(v);
          setActiveStep(deriveStepFromVendor(v));
        } catch (_) {}
      } else {
        toast.error('No active onboarding session found.');
        navigate('/vendor/login');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const syncKycFromServer = async () => {
    const vendorId = vendor?._id || vendor?.id || getStoredVendorId();
    if (!vendorId) return;
    setKycSyncing(true);
    try {
      const res = await api.post('/vendor/onboarding/sync-kyc', { vendorId });
      if (res.data?.success) {
        if (res.data.data) applyOnboardingPayload(res.data.data);
        if (res.data.data?.kyc) setKycProgress(res.data.data.kyc);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not refresh KYC status');
    } finally {
      setKycSyncing(false);
    }
  };

  useEffect(() => {
    if (activeStep === 2) {
      syncKycFromServer();
    }
  }, [activeStep]);

  useEffect(() => {
    const loadDocumentRequirements = async () => {
      const vendorId = vendor?._id || vendor?.id || getStoredVendorId();
      if (!vendorId || activeStep !== 2) return;
      try {
        const res = await api.get('/vendor/onboarding/document-requirements', {
          params: { vendorId }
        });
        if (res.data?.success) {
          setDocumentRequirements(res.data.requirements || []);
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'Could not load document requirements');
      }
    };

    loadDocumentRequirements();
  }, [activeStep, vendor?._id, vendor?.id]);

  useEffect(() => {
    const onRealtime = (event) => applyOnboardingPayload(event.detail);
    window.addEventListener('vendorOnboardingUpdated', onRealtime);
    return () => window.removeEventListener('vendorOnboardingUpdated', onRealtime);
  }, []);

  const kycRules = useMemo(() => (
    (documentRequirements || []).map((req, index) => ({
      role: 'vendor',
      documentType: req.key,
      label: req.label,
      required: req.required !== false,
      verificationMode: req.verificationMode || 'upload_only',
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      maxFileSize: 10 * 1024 * 1024,
      sortOrder: index + 1
    }))
  ), [documentRequirements]);

  const initialKycVerifications = useMemo(() => {
    const records = kycProgress?.records || [];
    return records.reduce((acc, rec) => {
      acc[rec.documentType] = {
        status: rec.status,
        data: {
          provider: rec.provider,
          verifiedAt: rec.verifiedAt,
          updatedAt: rec.updatedAt
        }
      };
      return acc;
    }, {});
  }, [kycProgress]);

  const requiredMissingDocs = useMemo(() => {
    const requiredKeys = (documentRequirements || [])
      .filter((req) => req.required !== false)
      .map((req) => req.key);
    const statusMap = new Map((kycProgress?.records || []).map((rec) => [rec.documentType, rec.status]));
    return requiredKeys.filter((key) => {
      const status = statusMap.get(key);
      return !['verified', 'uploaded', 'manual_review'].includes(status);
    });
  }, [documentRequirements, kycProgress]);

  const handleVerifyBank = async () => {
    if (!bankName || !accountNum || !ifscCode) {
      toast.error('Account holder name, number and IFSC code are required');
      return;
    }
    setBankVerifying(true);
    try {
      const res = await api.post('/vendor/verify-bank-penny-drop', {
        vendorId: vendor?._id || vendor?.id,
        bankName,
        accountNumber: accountNum,
        ifsc: ifscCode,
        upiId
      });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchStatus();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Penny drop failed');
    } finally {
      setBankVerifying(false);
    }
  };

  const handleCompleteTraining = async () => {
    if (quizAnswer !== 'B') {
      toast.error('Incorrect response. Please review compliance guidelines.');
      return;
    }
    setTrainingVerifying(true);
    try {
      const res = await api.post('/vendor/complete-induction', { vendorId: vendor?._id || vendor?.id });
      if (res.data.success) {
        toast.success('Induction compliance verified.');
        if (res.data.data) applyOnboardingPayload(res.data.data);
        else fetchStatus();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit training state');
    } finally {
      setTrainingVerifying(false);
    }
  };

  const handleGoLive = async () => {
    const token = localStorage.getItem('vendorAccessToken') || sessionStorage.getItem('vendorAccessToken');
    if (!token) {
      toast.error('Sign in to provision your partner workspace.');
      navigate('/vendor/login');
      return;
    }

    setActivating(true);
    try {
      const res = await api.post(
        '/vendor/activate-account',
        { vendorId: vendor?._id || vendor?.id },
        { timeout: 60000 }
      );
      if (res.data.success) {
        toast.success('Account activated. Redirecting to dashboard…');
        if (res.data.data) applyOnboardingPayload(res.data.data);
        else await fetchStatus();
        navigate('/vendor/digital-solution/dashboard', { replace: true });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to activate account');
      if (err.response?.status === 401) {
        navigate('/vendor/login');
      }
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-600">Initializing Workspace...</span>
        </div>
      </div>
    );
  }

  const kycDone = vendor?.kycStatus === 'verified';
  const bankDone = vendor?.bankStatus === 'verified';
  const inductionDone = vendor?.inductionStatus === 'completed';
  const allAuditsPassed = vendor?.allAuditsPassed ?? (vendor?.operationalAuditStatus === 'approved');
  const canActivate = vendor?.canActivate ?? (allAuditsPassed && vendor?.approvalStatus !== 'approved');
  const provisioningInProgress =
    activating || vendor?.workspaceProvisioning?.status === 'in_progress';
  const logistics = vendor?.logistics || {};
  const logisticsLabel = logistics.label || (vendor?.kitDispatchStatus === 'delivered' ? 'Delivered' : vendor?.kitDispatchStatus === 'dispatched' ? 'In transit' : 'Awaiting dispatch');
  const waybill = logistics.waybill || vendor?.kitWaybill;

  const steps = [
    { id: 1, title: 'Identity Registration', subtitle: 'Mobile & Basic Info', done: true },
    { id: 2, title: 'Compliance & KYC', subtitle: 'Aadhaar & Tax Info', done: kycDone },
    { id: 3, title: 'Financial Audit', subtitle: 'Bank Verification', done: bankDone },
    { id: 4, title: 'Partner Induction', subtitle: 'Safety & Protocols', done: inductionDone },
    { id: 5, title: 'Activation', subtitle: 'System Go-Live', done: vendor?.approvalStatus === 'approved' }
  ];

  return (
    <div className="min-h-screen bg-[#F3F4F6] font-inter text-slate-800 flex flex-col">
      {/* Enterprise Header */}
      <header className="bg-slate-900 border-b border-slate-800 text-white shadow-sm flex-none">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo onDark className="h-6 w-6" />
            <div className="w-px h-5 bg-slate-700"></div>
            <span className="text-sm font-semibold tracking-wide">Partner Lifecycle Management</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Entity:</span>
              <span className="font-medium text-slate-100">{vendor?.name || 'Authorized Partner'}</span>
            </div>
            <button 
              onClick={() => {
                localStorage.clear();
                navigate('/vendor/login');
              }}
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-6 py-8 flex flex-col lg:flex-row gap-8 items-start">
        
        {/* Left Sidebar - Stepper */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="mb-6">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Process Flow</h2>
            <p className="text-sm text-slate-800 font-medium">Onboarding Pipeline</p>
          </div>
          
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex flex-col relative py-2">
              {/* Connecting Line */}
              <div className="absolute left-[31px] top-6 bottom-6 w-px bg-slate-200 z-0"></div>

              {steps.map((step) => {
                const isActive = activeStep === step.id;
                const isPast = step.id < activeStep;
                const isFuture = step.id > activeStep && !step.done;

                return (
                  <button 
                    key={step.id}
                    disabled={isFuture && !step.done}
                    onClick={() => {
                      if (!(isFuture && !step.done) && step.id !== 1) {
                        setActiveStep(step.id);
                      }
                    }}
                    className={`relative z-10 flex items-start gap-4 p-4 text-left transition-colors w-full ${
                      isActive ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                    } ${(isFuture && !step.done) ? 'opacity-60 cursor-not-allowed hover:bg-transparent' : ''}`}
                  >
                    <div className="mt-0.5 relative shrink-0">
                      {/* Indicator Circle */}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                        step.done 
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : isActive 
                            ? 'bg-white border-emerald-600 text-emerald-600 shadow-[0_0_0_3px_rgba(5,150,105,0.1)]'
                            : 'bg-white border-slate-300 text-slate-400'
                      }`}>
                        {step.done ? <FiCheck className="w-3.5 h-3.5" /> : step.id}
                      </div>
                    </div>
                    <div className="flex-1">
                      <h4 className={`text-sm font-semibold ${isActive ? 'text-emerald-800' : 'text-slate-700'}`}>
                        {step.title}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">{step.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 w-full bg-white rounded-lg border border-slate-200 shadow-sm min-h-[600px] flex flex-col">
          
          {/* STEP 2: KYC */}
          {activeStep === 2 && (
            <div className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
              <div className="p-6 border-b border-slate-200 bg-slate-50/50 rounded-t-lg">
                <h1 className="text-xl font-semibold text-slate-800">Compliance & KYC Verification</h1>
                <p className="text-sm text-slate-500 mt-1">
                  Complete Aadhaar, PAN, Selfie (face match), and Bank verification. Then sync to update your onboarding status.
                </p>
              </div>

              <div className="p-6 space-y-6">
                <section>
                  <div className="bg-white border border-slate-200 rounded-lg p-4">
                    {!vendor?._id ? (
                      <div className="text-sm text-slate-500">Loading vendor details...</div>
                    ) : (
                      <>
                        <KYCVerificationStep
                          role="vendor"
                          entityId={vendor._id}
                          mobileNumber={vendor.phone}
                          rulesOverride={kycRules}
                          initialVerifications={initialKycVerifications}
                        />

                        <div className="mt-4 flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={syncKycFromServer}
                            disabled={kycSyncing}
                            className="px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-md text-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            {kycSyncing ? 'Syncing KYC...' : 'Sync KYC status'}
                          </button>
                        </div>

                        {kycProgress && (
                          <div className="mt-4 space-y-2">
                            <div className="text-xs text-slate-500">
                              Current KYC score: <span className="font-semibold">{kycProgress.kycScore ?? '-'}</span>
                            </div>
                            {requiredMissingDocs.length > 0 ? (
                              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                Missing required documents: {requiredMissingDocs.join(', ')}
                              </div>
                            ) : (
                              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                All required KYC documents are present. Sync status after any new upload or verification.
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* STEP 3: BANKING */}
          {activeStep === 3 && (
            <div className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
              <div className="p-6 border-b border-slate-200 bg-slate-50/50 rounded-t-lg">
                <h1 className="text-xl font-semibold text-slate-800">Financial Audit</h1>
                <p className="text-sm text-slate-500 mt-1">Secure IMPS penny drop mechanism to validate beneficiary records.</p>
              </div>

              <div className="p-6">
                <div className="max-w-2xl space-y-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Account Holder Legal Name <span className="text-red-500">*</span></label>
                    <input 
                      type="text"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder-slate-400"
                      placeholder="As per bank records"
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Account Number <span className="text-red-500">*</span></label>
                      <input 
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium tracking-wide focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder-slate-400"
                        placeholder="Enter Account Number"
                        value={accountNum}
                        onChange={e => setAccountNum(e.target.value.replace(/[^0-9]/g, ''))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">IFSC Code <span className="text-red-500">*</span></label>
                      <input 
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium uppercase tracking-wide focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder-slate-400"
                        placeholder="e.g. SBIN0001234"
                        value={ifscCode}
                        onChange={e => setIfscCode(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">UPI VPA (Optional)</label>
                    <input 
                      type="text"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder-slate-400"
                      placeholder="e.g. entity@bank"
                      value={upiId}
                      onChange={e => setUpiId(e.target.value)}
                    />
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <button
                      onClick={handleVerifyBank}
                      disabled={bankVerifying || bankDone || !bankName || !accountNum || !ifscCode}
                      className="px-6 py-2.5 bg-slate-800 text-white font-medium rounded-md text-sm hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                      {bankVerifying ? (
                        <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> Executing Transaction...</>
                      ) : (
                        <><FiDollarSign className="w-4 h-4"/> Execute IMPS Penny Drop Audit</>
                      )}
                    </button>
                    <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
                      <FiAlertCircle /> Secure bank-grade audit trail is maintained for this transaction.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: TRAINING */}
          {activeStep === 4 && (
            <div className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
              <div className="p-6 border-b border-slate-200 bg-slate-50/50 rounded-t-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold text-slate-800">Partner Induction Protocols</h1>
                  <p className="text-sm text-slate-500 mt-1">Review operational guidelines and acknowledge compliance.</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <FiGlobe className="text-slate-500" />
                  <select 
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    className="bg-white border border-slate-300 text-slate-700 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  >
                    <option>English</option>
                    <option>Malayalam</option>
                    <option>Hindi</option>
                  </select>
                </div>
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <div className="bg-slate-50 border border-slate-200 rounded-md p-6 mb-6">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <FiBookOpen className="text-emerald-600" /> 
                    {language === 'English' && 'Module 1: Safety & Zero-Tolerance Offline Steering'}
                    {language === 'Malayalam' && 'മോഡ്യൂൾ 1: സുരക്ഷയും നിയന്ത്രണങ്ങളും'}
                    {language === 'Hindi' && 'मॉड्यूल 1: सुरक्षा और नीतियां'}
                  </h3>
                  <div className="text-sm text-slate-600 leading-relaxed border-l-2 border-slate-300 pl-4">
                    {language === 'English' && (
                      <p>WBI operates on a strict zero-tolerance steering policy. Authorized partners must never share personal contact details or request offline cash payments outside the secure platform. First violations result in a 50% dispatch priority reduction; subsequent violations incur an immediate and permanent platform ban.</p>
                    )}
                    {language === 'Malayalam' && (
                      <p>ഫോൺ നമ്പറുകൾ പങ്കിടുന്നതോ ഉപഭോക്താവിൽ നിന്നും നേരിട്ട് പണം വാങ്ങുന്നതോ കർശനമായി നിരോധിച്ചിരിക്കുന്നു. നിയമലംഘനം കണ്ടെത്തിയാൽ നിങ്ങളുടെ അക്കൗണ്ട് എന്നെന്നേക്കുമായി ബ്ലോക്ക് ചെയ്യപ്പെടും.</p>
                    )}
                    {language === 'Hindi' && (
                      <p>संतुष्टि और सुरक्षा के लिए, ग्राहकों से कभी भी व्यक्तिगत रूप से संपर्क न करें या प्लेटफॉर्म के बाहर पैसे का लेनदेन न करें। नियमों के उल्लंघन पर आपका खाता स्थाई रूप से बंद किया जा सकता है।</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-800">Compliance Assessment</h4>
                  <p className="text-xs text-slate-500">Scenario: If a client requests offline cash payments to bypass platform fees, what is the protocol?</p>
                  
                  <div className="space-y-3">
                    <label className={`flex items-start gap-3 p-4 border rounded-md cursor-pointer transition-colors ${quizAnswer === 'A' ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <input type="radio" name="quiz" value="A" checked={quizAnswer === 'A'} onChange={() => setQuizAnswer('A')} className="mt-0.5 text-slate-800 focus:ring-slate-800" />
                      <span className="text-sm text-slate-700">A) Accept the offline payment to reduce service commission charges.</span>
                    </label>

                    <label className={`flex items-start gap-3 p-4 border rounded-md cursor-pointer transition-colors ${quizAnswer === 'B' ? 'border-emerald-600 bg-emerald-50/30' : 'border-slate-200 hover:border-slate-300'}`}>
                      <input type="radio" name="quiz" value="B" checked={quizAnswer === 'B'} onChange={() => setQuizAnswer('B')} className="mt-0.5 text-emerald-600 focus:ring-emerald-600" />
                      <span className="text-sm text-slate-700 font-medium">B) Decline the request, mandate OTP sign-off, and process billing exclusively through the authorized in-app escrow system.</span>
                    </label>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={handleCompleteTraining}
                    disabled={trainingVerifying || inductionDone || !quizAnswer}
                    className="px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-md text-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {trainingVerifying ? 'Validating...' : 'Acknowledge & Submit'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: ACTIVATION */}
          {activeStep === 5 && (
            <div className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
              <div className="p-6 border-b border-slate-200 bg-slate-50/50 rounded-t-lg">
                <h1 className="text-xl font-semibold text-slate-800">System Activation</h1>
                <p className="text-sm text-slate-500 mt-1">Finalize partner provisioning and verify logistics status.</p>
              </div>

              <div className="p-8 flex-1 flex flex-col justify-center items-center">
                
                <div className="w-full max-w-lg space-y-8">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-700 border border-slate-200">
                      <FiShield className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800">
                        {allAuditsPassed ? 'All Audits Passed' : 'Final Review In Progress'}
                      </h2>
                      <p className="text-sm text-slate-500 mt-2">
                        {allAuditsPassed
                          ? 'Your compliance, financial, and operational audits have been successfully verified.'
                          : 'Complete the prior steps. Operational sign-off updates here in real time when ready.'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                      <FiTruck className="text-slate-400" /> Logistics Status
                    </h4>
                    
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-50 rounded-md border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">
                        QR
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800">{logistics.title || 'Standardized Uniform & Toolkit'}</p>
                        <p className="text-xs text-slate-500 font-mono mt-1">
                          {waybill ? `WAYBILL: ${waybill}` : 'Waybill assigned when kit is dispatched'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${vendor?.kitDispatchStatus === 'pending' ? 'bg-amber-400' : 'bg-emerald-500'}`}></div>
                        <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                          {logisticsLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-800 rounded-lg p-6 text-white text-center">
                    <h3 className="text-base font-semibold mb-2">Ready for Go-Live</h3>
                    <p className="text-sm text-slate-400 mb-6">
                      {canActivate
                        ? 'Click below to provision your workspace and activate your partner dashboard.'
                        : 'Activation unlocks when all onboarding audits are complete.'}
                    </p>
                    <button
                      onClick={handleGoLive}
                      disabled={provisioningInProgress || !canActivate}
                      className="w-full py-3 bg-emerald-600 text-white font-medium rounded-md text-sm hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                      {provisioningInProgress ? (
                        <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> Provisioning Workspace...</>
                      ) : (
                        <>Initialize Workspace <FiArrowRight /></>
                      )}
                    </button>
                  </div>

                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default PendingApproval;
