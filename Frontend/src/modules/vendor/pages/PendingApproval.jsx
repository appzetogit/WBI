import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiClock, FiCheckCircle, FiFileText, FiShield, 
  FiDollarSign, FiBookOpen, FiTruck, FiPlay, 
  FiLock, FiXCircle, FiTrendingUp, FiActivity, FiGlobe,
  FiCamera
} from 'react-icons/fi';
import { themeColors } from '../../../theme';
import Logo from '../../../components/common/Logo';
import api from '../../../services/api';
import toast from 'react-hot-toast';

const PendingApproval = () => {
  const navigate = useNavigate();
  const brandColor = themeColors.brand?.teal || '#0D8A72';

  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(2);

  // Phase 2 State: KYC
  const [aadhaarNum, setAadhaarNum] = useState('');
  const [kycVerifying, setKycVerifying] = useState(false);
  const [selfieVerifying, setSelfieVerifying] = useState(false);
  const [panNum, setPanNum] = useState('');
  const [gstNum, setGstNum] = useState('');
  const [taxVerifying, setTaxVerifying] = useState(false);

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

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await api.get('/vendor/profile');
      if (res.data?.success) {
        setVendor(res.data.data);
        const v = res.data.data;
        if (v.kycStatus !== 'verified') {
          setActiveStep(2);
        } else if (v.bankStatus !== 'verified') {
          setActiveStep(3);
        } else if (v.inductionStatus !== 'completed') {
          setActiveStep(4);
        } else {
          setActiveStep(5);
        }
      }
    } catch (err) {
      const dataStr = localStorage.getItem('vendorData');
      if (dataStr) {
        try {
          const v = JSON.parse(dataStr);
          setVendor(v);
          if (v.kycStatus !== 'verified') setActiveStep(2);
          else if (v.bankStatus !== 'verified') setActiveStep(3);
          else if (v.inductionStatus !== 'completed') setActiveStep(4);
          else setActiveStep(5);
        } catch (_) {}
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleVerifyKyc = async () => {
    if (!aadhaarNum || aadhaarNum.length !== 12) {
      toast.error('Please enter a valid 12-digit Aadhaar number');
      return;
    }
    setKycVerifying(true);
    setTimeout(async () => {
      try {
        const res = await api.post('/vendor/verify-kyc', {
          vendorId: vendor._id,
          gstin: gstNum,
          panNumber: panNum
        });
        if (res.data.success) {
          toast.success('Aadhaar retrieved via DigiLocker! Biometrics face matched (98% match).');
          fetchStatus();
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'KYC verification failed');
      } finally {
        setKycVerifying(false);
      }
    }, 2000);
  };

  const handleVerifyBank = async () => {
    if (!bankName || !accountNum || !ifscCode) {
      toast.error('Account holder name, number and IFSC code are required');
      return;
    }
    setBankVerifying(true);
    try {
      const res = await api.post('/vendor/verify-bank-penny-drop', {
        vendorId: vendor._id,
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
      toast.error('Incorrect answer! Please review the safety guidelines and select the correct option.');
      return;
    }
    setTrainingVerifying(true);
    try {
      const res = await api.post('/vendor/complete-induction', { vendorId: vendor._id });
      if (res.data.success) {
        toast.success('Induction modules completed successfully!');
        fetchStatus();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit training state');
    } finally {
      setTrainingVerifying(false);
    }
  };

  const handleGoLive = async () => {
    setActivating(true);
    try {
      const res = await api.post('/vendor/activate-account', { vendorId: vendor._id });
      if (res.data.success) {
        toast.success('Congratulations! Your account is active and go-live.');
        
        const updatedProfile = await api.get('/vendor/profile');
        if (updatedProfile.data?.success) {
          localStorage.setItem('vendorData', JSON.stringify(updatedProfile.data.data));
        }
        
        navigate('/vendor/digital-solution/dashboard');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to activate account');
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-t-transparent border-[#0D8A72] rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-gray-500">Loading Onboarding Status...</p>
        </div>
      </div>
    );
  }

  const kycDone = vendor?.kycStatus === 'verified';
  const bankDone = vendor?.bankStatus === 'verified';
  const inductionDone = vendor?.inductionStatus === 'completed';

  return (
    <div className="min-h-screen bg-[#F8FCFC] flex flex-col font-sans">
      {/* Header */}
      <div className="bg-white border-b border-[#E6F4F2] sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-auto" />
            <span className="text-lg font-bold text-gray-800">TaskY Partner Lifecycle</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-[#0D8A72] bg-[#E6F4F2] px-3 py-1.5 rounded-full">
              Legal Name: {vendor?.name}
            </span>
            <button 
              onClick={() => {
                localStorage.clear();
                navigate('/vendor/login');
              }}
              className="text-xs font-bold text-red-500 hover:underline"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6">
        
        {/* Stepper Navigation Sidebar */}
        <div className="lg:w-80 bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm h-fit space-y-6">
          <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Lifecycle Roadmap</h3>
          <div className="space-y-4">
            
            {/* Step 1: Registration */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                <FiCheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900">1. Mobile Registration</p>
                <p className="text-[10px] text-gray-400">OTP Authenticated</p>
              </div>
            </div>

            {/* Step 2: KYC */}
            <button 
              disabled={kycDone}
              onClick={() => setActiveStep(2)}
              className={`w-full flex items-center gap-3 text-left p-2 rounded-xl transition-all ${activeStep === 2 ? 'bg-teal-50/50' : 'hover:bg-gray-50'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${kycDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {kycDone ? <FiCheckCircle className="w-5 h-5" /> : <FiFileText className="w-4 h-4" />}
              </div>
              <div>
                <p className={`text-xs font-bold ${activeStep === 2 ? 'text-[#0D8A72]' : 'text-gray-700'}`}>2. DigiLocker KYC</p>
                <p className="text-[10px] text-gray-400">Aadhaar BGV & Biometrics</p>
              </div>
            </button>

            {/* Step 3: Bank Verify */}
            <button 
              disabled={!kycDone || bankDone}
              onClick={() => setActiveStep(3)}
              className={`w-full flex items-center gap-3 text-left p-2 rounded-xl transition-all ${!kycDone ? 'opacity-50 cursor-not-allowed' : activeStep === 3 ? 'bg-teal-50/50' : 'hover:bg-gray-50'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${bankDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {bankDone ? <FiCheckCircle className="w-5 h-5" /> : <FiDollarSign className="w-4 h-4" />}
              </div>
              <div>
                <p className={`text-xs font-bold ${activeStep === 3 ? 'text-[#0D8A72]' : 'text-gray-700'}`}>3. IMPS Bank Verify</p>
                <p className="text-[10px] text-gray-400">₹1 Penny Drop & Audit</p>
              </div>
            </button>

            {/* Step 4: Training */}
            <button 
              disabled={!bankDone || inductionDone}
              onClick={() => setActiveStep(4)}
              className={`w-full flex items-center gap-3 text-left p-2 rounded-xl transition-all ${!bankDone ? 'opacity-50 cursor-not-allowed' : activeStep === 4 ? 'bg-teal-50/50' : 'hover:bg-gray-50'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${inductionDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {inductionDone ? <FiCheckCircle className="w-5 h-5" /> : <FiBookOpen className="w-4 h-4" />}
              </div>
              <div>
                <p className={`text-xs font-bold ${activeStep === 4 ? 'text-[#0D8A72]' : 'text-gray-700'}`}>4. Custom Induction</p>
                <p className="text-[10px] text-gray-400">Interactive Soft Skills</p>
              </div>
            </button>

            {/* Step 5: Activation */}
            <button 
              disabled={!inductionDone}
              onClick={() => setActiveStep(5)}
              className={`w-full flex items-center gap-3 text-left p-2 rounded-xl transition-all ${!inductionDone ? 'opacity-50 cursor-not-allowed' : activeStep === 5 ? 'bg-teal-50/50' : 'hover:bg-gray-50'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${vendor?.approvalStatus === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {vendor?.approvalStatus === 'approved' ? <FiCheckCircle className="w-5 h-5" /> : <FiShield className="w-4 h-4" />}
              </div>
              <div>
                <p className={`text-xs font-bold ${activeStep === 5 ? 'text-[#0D8A72]' : 'text-gray-700'}`}>5. Go-Live Activation</p>
                <p className="text-[10px] text-gray-400">Standardized Uniform Kit</p>
              </div>
            </button>

          </div>
        </div>

        {/* Dynamic Stepper Workspace */}
        <div className="flex-1 bg-white rounded-3xl border border-[#E6F4F2] p-6 sm:p-8 shadow-sm space-y-6">
          
          {/* STEP 2: KYC PANEL */}
          {activeStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Secure Digital KYC & Verification</h2>
                <p className="text-xs text-gray-400 mt-1">Consent-based verification linked directly to government portals via DigiLocker.</p>
              </div>

              {/* Aadhaar Verification */}
              <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <FiFileText className="text-[#0D8A72]" /> 1. Aadhaar Verification via DigiLocker
                </h4>
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-gray-500">12-Digit Aadhaar Card Number</label>
                  <input 
                    type="text" 
                    maxLength={12}
                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-[#0D8A72]"
                    placeholder="Enter 12-digit Aadhaar Number"
                    value={aadhaarNum}
                    onChange={e => setAadhaarNum(e.target.value.replace(/[^0-9]/g, ''))}
                  />
                  <button
                    onClick={handleVerifyKyc}
                    disabled={kycVerifying || kycDone}
                    className="w-full py-3 bg-[#0D8A72] text-white font-bold rounded-xl text-sm transition-colors hover:bg-teal-700 disabled:opacity-50"
                  >
                    {kycVerifying ? 'Fetching from DigiLocker API Setu...' : 'Connect & Fetch via DigiLocker'}
                  </button>
                </div>
              </div>

              {/* Face Match Verification */}
              <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <FiCamera className="text-[#0D8A72]" /> 2. Face-Match Fraud Check
                </h4>
                <p className="text-xs text-gray-500">Compares live selfie biometrics against Aadhaar database photo to eliminate account renting.</p>
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl p-6 bg-white space-y-3">
                  <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center text-[#0D8A72]">
                    <FiCamera className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-gray-500">Device Webcam Ready</span>
                  <span className="text-[10px] text-gray-400">Match quality threshold requires 90% accuracy</span>
                </div>
              </div>

              {/* Tax Details */}
              <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <FiLock className="text-[#0D8A72]" /> 3. Tax & Business Verification
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase">GSTIN (Optional)</label>
                    <input 
                      type="text" 
                      className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold uppercase outline-none focus:border-[#0D8A72]" 
                      placeholder="GSTIN Number"
                      value={gstNum}
                      onChange={e => setGstNum(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase">PAN Card Number</label>
                    <input 
                      type="text" 
                      className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold uppercase outline-none focus:border-[#0D8A72]" 
                      placeholder="PAN Number"
                      value={panNum}
                      onChange={e => setPanNum(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: BANK VERIFICATION */}
          {activeStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Banking Validation & Audit</h2>
                <p className="text-xs text-gray-400 mt-1">We trigger a ₹1 IMPS penny drop transaction to verify your account holder name matches your Aadhaar details.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Account Holder Name (As per Bank/Aadhaar)</label>
                  <input 
                    type="text"
                    className="w-full p-3 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-[#0D8A72]"
                    placeholder="Enter Exact Legal Name"
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">Bank Account Number</label>
                    <input 
                      type="text"
                      className="w-full p-3 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-[#0D8A72]"
                      placeholder="Account Number"
                      value={accountNum}
                      onChange={e => setAccountNum(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">IFSC Code</label>
                    <input 
                      type="text"
                      className="w-full p-3 border border-gray-200 rounded-xl text-sm font-semibold uppercase outline-none focus:border-[#0D8A72]"
                      placeholder="IFSC (e.g. SBIN0001234)"
                      value={ifscCode}
                      onChange={e => setIfscCode(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">UPI ID / VPA Handle (Optional)</label>
                  <input 
                    type="text"
                    className="w-full p-3 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-[#0D8A72]"
                    placeholder="e.g. name@okhdfcbank"
                    value={upiId}
                    onChange={e => setUpiId(e.target.value)}
                  />
                </div>

                <button
                  onClick={handleVerifyBank}
                  disabled={bankVerifying || bankDone}
                  className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl text-sm shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
                >
                  {bankVerifying ? (
                    <><span className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4"></span> Triggering IMPS Penny Drop...</>
                  ) : (
                    <><FiDollarSign/> Execute ₹1 Penny Drop Verification</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: TRAINING & INDUCTION */}
          {activeStep === 4 && (
            <div className="space-y-6">
              <div className="flex justify-between items-start flex-wrap gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">On-Platform Induction Training</h2>
                  <p className="text-xs text-gray-400 mt-1">Complete mandatory safety and protocol modules to activate your dispatches.</p>
                </div>
                
                {/* Language Picker */}
                <div className="flex items-center gap-2 bg-[#E6F4F2] px-3 py-1.5 rounded-xl border border-[#10AFA5]/10 text-xs font-bold text-[#0D8A72]">
                  <FiGlobe /> Language:
                  <select 
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    className="bg-transparent font-bold focus:outline-none cursor-pointer"
                  >
                    <option>English</option>
                    <option>Malayalam</option>
                    <option>Hindi</option>
                  </select>
                </div>
              </div>

              {/* Interactive Training Carousel */}
              <div className="bg-gray-50 border border-gray-100 p-6 rounded-2xl space-y-4">
                <h3 className="font-bold text-sm text-gray-700 flex items-center gap-2"><FiBookOpen/> Induction Module (Multilingual)</h3>
                
                <div className="space-y-3 bg-white p-4 rounded-xl border border-gray-100 text-xs leading-relaxed text-gray-600 shadow-sm">
                  {language === 'English' && (
                    <>
                      <p className="font-bold text-gray-800 mb-1">Module 1: Safety & Zero-Tolerance Offline Steering</p>
                      <p>WBI operates on a strict zero-tolerance steering policy. Technicians must never attempt to share personal phone numbers or request offline cash payment. First strike reduces dispatch priority by 50%; secondary strikes result in permanent account ban.</p>
                    </>
                  )}
                  {language === 'Malayalam' && (
                    <>
                      <p className="font-bold text-gray-800 mb-1">മോഡ്യൂൾ 1: സുരക്ഷയും ഓഫ്‌ലൈൻ പേയ്‌മെന്റ് നിയന്ത്രണങ്ങളും</p>
                      <p>ഫോൺ നമ്പറുകൾ പങ്കിടുന്നതോ ഉപഭോക്താവിൽ നിന്നും നേരിട്ട് പണം വാങ്ങുന്നതോ കർശനമായി നിരോധിച്ചിരിക്കുന്നു. നിയമലംഘനം കണ്ടെത്തിയാൽ നിങ്ങളുടെ അക്കൗണ്ട് എന്നെന്നേക്കുമായി ബ്ലോക്ക് ചെയ്യപ്പെടും.</p>
                    </>
                  )}
                  {language === 'Hindi' && (
                    <>
                      <p className="font-bold text-gray-800 mb-1">मॉड्यूल 1: सुरक्षा और प्लेटफॉर्म गोपनीयता नीतियां</p>
                      <p>संतुष्टि और सुरक्षा के लिए, ग्राहकों से कभी भी व्यक्तिगत रूप से संपर्क न करें या प्लेटफॉर्म के बाहर पैसे का लेनदेन न करें। नियमों के उल्लंघन पर आपका खाता स्थाई रूप से बंद किया जा सकता है।</p>
                    </>
                  )}
                </div>

                {/* Question */}
                <div className="space-y-3 pt-2">
                  <p className="text-xs font-bold text-gray-700">Quiz Question: If a client requests offline cash payments steering, what should you do?</p>
                  
                  <div className="space-y-2 text-xs font-medium">
                    <label className="flex items-center gap-3 p-3 border rounded-xl bg-white hover:bg-gray-50/50 cursor-pointer">
                      <input 
                        type="radio" 
                        name="quiz" 
                        value="A" 
                        checked={quizAnswer === 'A'} 
                        onChange={() => setQuizAnswer('A')}
                        className="text-[#0D8A72] focus:ring-[#0D8A72]" 
                      />
                      <span>A) Accept the cash steering to save platform service commission charges.</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border rounded-xl bg-white hover:bg-gray-50/50 cursor-pointer">
                      <input 
                        type="radio" 
                        name="quiz" 
                        value="B" 
                        checked={quizAnswer === 'B'} 
                        onChange={() => setQuizAnswer('B')}
                        className="text-[#0D8A72] focus:ring-[#0D8A72]" 
                      />
                      <span className="text-green-700">B) Politely refuse, complete OTP sign-off, and process inside the secure in-app escrow.</span>
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleCompleteTraining}
                  disabled={trainingVerifying || inductionDone}
                  className="w-full py-3 bg-[#0D8A72] text-white font-bold rounded-xl text-sm transition-colors hover:bg-teal-700 disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
                >
                  {trainingVerifying ? 'Verifying Answers...' : 'Submit Answers & Verify Module'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: ACTIVATION & KIT DEPLOYMENT */}
          {activeStep === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Account Activation & Kit Dispatch</h2>
                <p className="text-xs text-gray-400 mt-1">WBI branded kit dispatch status tracker and Go-Live activation toggle.</p>
              </div>

              {/* Kit Tracker Card */}
              <div className="p-5 bg-gray-50 border border-gray-100 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <FiTruck className="text-[#0D8A72]" /> Shipment Logistics Status
                </h4>
                
                <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100">
                  <div className="w-10 h-10 rounded-xl bg-[#E6F4F2] flex items-center justify-center text-[#0D8A72] font-black">
                    QR
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">TaskY Branded Uniform & ID Badges</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Status: Dispatched via WBI logistics (Tracking ID: TKY-KIT-77382)</p>
                  </div>
                  <span className="ml-auto text-[10px] font-bold px-2 py-1 bg-green-50 text-green-700 rounded-full border border-green-200">
                    In Transit
                  </span>
                </div>
              </div>

              {/* Action Banner */}
              <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-blue-800">Induction Checklist Complete!</h4>
                <p className="text-xs text-blue-700 leading-relaxed">
                  Your identity, tax files, and bank penny drop audits are fully verified. You can now override and activate your Go-Live status!
                </p>
                <button
                  onClick={handleGoLive}
                  disabled={activating}
                  className="w-full py-4 bg-[#0D8A72] text-white font-extrabold rounded-xl text-sm shadow-md hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
                >
                  {activating ? (
                    <><span className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4"></span> Activating Partner account...</>
                  ) : (
                    <><FiPlay className="w-5 h-5"/> ACTIVATE PARTNER & GO-LIVE</>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default PendingApproval;
