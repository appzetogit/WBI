import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiUser, FiMail, FiPhone, FiLock, FiCheckCircle, FiArrowRight, FiArrowLeft, FiChevronLeft, FiMapPin, FiBriefcase, FiUploadCloud, FiVideo, FiCamera, FiCheck, FiX, FiTag } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import LogoLoader from '../../../components/common/LogoLoader';
import { engineerAuthService } from '../../../services/authService';
import KYCVerificationStep from '../../../components/kyc/KYCVerificationStep';
import Logo from '../../../components/common/Logo';
import ValidatedInput from '../../../components/common/ValidatedInput';
import { validators } from '../../../utils/validationUtils';

const generateObjectId = () => {
  const timestamp = Math.floor(new Date().getTime() / 1000).toString(16);
  const randomHex = 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, () => Math.floor(Math.random() * 16).toString(16));
  return (timestamp + randomHex).toLowerCase();
};

// Helper to load Razorpay Script
const loadRazorpay = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function EngineerSignup() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const kycRef = React.useRef(null);

  // OTP Verification State
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Document Verification State
  const [isAadhaarVerified, setIsAadhaarVerified] = useState(false);
  const [verifyingAadhaar, setVerifyingAadhaar] = useState(false);
  const [isPanVerified, setIsPanVerified] = useState(false);
  const [verifyingPan, setVerifyingPan] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    tempEntityId: generateObjectId(),
    engineerType: 'freelancer',
    vendorCode: '',
    serviceCategories: [],
    subServices: [],
    skills: [],
    secondarySkills: [],
    uploadedDocuments: [],
    tshirtSize: '', toolsAvailable: [], otherTools: '',
    selfieUrl: null, introVideoUrl: null,
    aadhaarNumber: '', panNumber: '', panFullName: '', panDob: ''
  });

  const [validationState, setValidationState] = useState({});

  // Dynamic step rendering state
  const [dynamicSteps, setDynamicSteps] = useState([]);
  const [paymentData, setPaymentData] = useState(null);
  const [isVerifyingCoupon, setIsVerifyingCoupon] = useState(false);
  const [isPaymentSuccess, setIsPaymentSuccess] = useState(false);

  useEffect(() => {
    localStorage.removeItem('engineerAccessToken');
    localStorage.removeItem('engineerRefreshToken');
    localStorage.removeItem('engineerData');

    const navigationEntries = window.performance.getEntriesByType('navigation');
    const isReload = navigationEntries.length > 0 && navigationEntries[0].type === 'reload';

    if (!isReload) {
      sessionStorage.removeItem('engineerSignupDraft');
    } else {
      const draft = sessionStorage.getItem('engineerSignupDraft');
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.formData) {
            setFormData(prev => ({ ...prev, ...parsed.formData }));
          }
          if (parsed.currentStep) setCurrentStep(parsed.currentStep);
          if (parsed.isPhoneVerified) setIsPhoneVerified(parsed.isPhoneVerified);
          if (parsed.otpSent) setOtpSent(parsed.otpSent);
          if (parsed.isAadhaarVerified) setIsAadhaarVerified(parsed.isAadhaarVerified);
          if (parsed.isPanVerified) setIsPanVerified(parsed.isPanVerified);
          if (parsed.isPaymentSuccess) setIsPaymentSuccess(parsed.isPaymentSuccess);
        } catch(e) {}
      }
    }
    
    const loadConfig = async () => {
      try {
        const response = await engineerAuthService.getRegistrationConfig();
        if (response.success) {
          setConfig(response.config);
          
          if (response.config.documents) {
             const docs = response.config.documents.map(d => ({
               key: d.key,
               url: '',
               backUrl: ''
             }));
             setFormData(p => ({ ...p, uploadedDocuments: docs }));
          }

          // Check for DigiLocker return
          const urlParams = new URLSearchParams(window.location.search);
          const recordId = urlParams.get('recordId');
          const stepStr = urlParams.get('step');
          if (recordId) {
            completeDigiLockerVerification(recordId, stepStr);
            window.history.replaceState({}, document.title, window.location.pathname);
          }
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

  // Continuous auto-save to draft
  useEffect(() => {
    sessionStorage.setItem('engineerSignupDraft', JSON.stringify({
      formData,
      currentStep,
      isPhoneVerified,
      otpSent,
      isAadhaarVerified,
      isPanVerified,
      isPaymentSuccess
    }));
  }, [formData, currentStep, isPhoneVerified, otpSent, isAadhaarVerified, isPanVerified, isPaymentSuccess]);

  const completeDigiLockerVerification = async (recordId, stepStr) => {
    setVerifyingAadhaar(true);
    if (stepStr) {
      setCurrentStep(Number(stepStr));
    }
    try {
      const res = await engineerAuthService.completeDigiLockerSignup(recordId);
      if (res.success) {
        setIsAadhaarVerified(true);
        if (res.data?.aadhaarNumberMasked) {
          setFormData(p => ({ ...p, aadhaarNumber: res.data.aadhaarNumberMasked }));
        }
        toast.success('Aadhaar verified via DigiLocker successfully!');
      } else {
        toast.error('DigiLocker verification failed');
      }
    } catch (error) {
      toast.error('DigiLocker verification failed');
    } finally {
      setVerifyingAadhaar(false);
    }
  };

  const validDynamicSteps = config?.steps?.filter(s => s.fields && s.fields.length > 0)
    .map((s, index) => ({ ...s, stepNumber: index + 2 })) || [];
  const configMaxStep = validDynamicSteps.length > 0 ? Math.max(...validDynamicSteps.map(s => s.stepNumber)) : 1;
  
  // Define steps
  const typeStep = 1;
  const servicesStep = configMaxStep + 1;
  const additionalDetailsStep = configMaxStep + 2;
  const feeStep = configMaxStep + 3;
  const submitStep = configMaxStep + 4;
  const totalSteps = submitStep;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
    
    // Also track validation state
    if (type !== 'checkbox') {
      const validatorFn = validators[name] || validators[type] || null;
      if (validatorFn) {
        setValidationState(prev => ({
          ...prev,
          [name]: validatorFn(value).isValid
        }));
      }
    }
  };

  const handleDocumentChange = (key, field, value) => {
    setFormData(prev => ({
      ...prev,
      uploadedDocuments: prev.uploadedDocuments.map(d => d.key === key ? { ...d, [field]: value } : d)
    }));
  };

  const handleFileRead = (e, callback) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error('File size must be less than 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => callback(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleCategoryToggle = (categoryName) => {
    setFormData(prev => {
      const isSelected = prev.serviceCategories.includes(categoryName);
      if (isSelected) {
        // Find category ID to clear its subservices
        const catId = config?.categories?.find(c => c.title === categoryName || c.name === categoryName)?.id;
        const subServicesToRemove = config?.subServices
          ?.filter(sub => sub.categoryId === catId)
          ?.map(sub => sub.name) || [];
          
        const newSubServices = prev.subServices.filter(name => !subServicesToRemove.includes(name));
        
        // Clean up skills that belong to removed subservices
        const validSkills = new Set(
          (config?.subServices || [])
            .filter(s => newSubServices.includes(s.name))
            .flatMap(s => s.requiredSkills || [])
        );
        
        return { 
          ...prev, 
          serviceCategories: prev.serviceCategories.filter(name => name !== categoryName),
          subServices: newSubServices,
          secondarySkills: (prev.secondarySkills || []).filter(skill => validSkills.has(skill))
        };
      } else {
        return { ...prev, serviceCategories: [...prev.serviceCategories, categoryName] };
      }
    });
  };

  const handleSubServiceToggle = (subServiceName) => {
    setFormData(prev => {
      const isSelected = prev.subServices.includes(subServiceName);
      let newSubServices;
      if (isSelected) {
        newSubServices = prev.subServices.filter(name => name !== subServiceName);
      } else {
        newSubServices = [...prev.subServices, subServiceName];
      }

      const validSkills = new Set(
        (config?.subServices || [])
          .filter(s => newSubServices.includes(s.name))
          .flatMap(s => s.requiredSkills || [])
      );

      return { 
        ...prev, 
        subServices: newSubServices,
        secondarySkills: (prev.secondarySkills || []).filter(skill => validSkills.has(skill))
      };
    });
  };

  const handleToolToggle = (toolName) => {
    setFormData(prev => {
      const isSelected = prev.toolsAvailable.includes(toolName);
      return {
        ...prev,
        toolsAvailable: isSelected ? prev.toolsAvailable.filter(t => t !== toolName) : [...prev.toolsAvailable, toolName]
      };
    });
  };

  const handleSendOtp = async (phone) => {
    if (!phone || phone.length < 10) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }
    try {
      const res = await engineerAuthService.sendOTP(phone);
      if (res.success) {
        setOtpSent(true);
        toast.success('OTP sent successfully');
      } else {
        toast.error(res.message || 'Failed to send OTP');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP');
    }
  };

  const handleVerifyOtp = async (phone) => {
    if (!otp || otp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }
    setVerifyingOtp(true);
    try {
      const res = await engineerAuthService.verifyLogin({ phone, otp });
      if (res.success) {
        setIsPhoneVerified(true);
        toast.success('Phone verified successfully!');
      } else {
        toast.error(res.message || 'Invalid OTP');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleInitiateDigiLocker = async () => {
    const mobile = formData.phone || formData.mobile;
    if (!mobile) {
      toast.error('Mobile number is missing. Please go back to step 2 and verify OTP.');
      return;
    }
    setVerifyingAadhaar(true);
    try {
      const redirectUrl = `${window.location.origin}${window.location.pathname}?step=${additionalDetailsStep}`;
      
      sessionStorage.setItem('engineerSignupDraft', JSON.stringify({
        formData,
        isPhoneVerified,
        otpSent
      }));

      const res = await engineerAuthService.initiateDigiLockerSignup(mobile, redirectUrl);
      if (res.success && res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error('Failed to initiate DigiLocker flow');
        setVerifyingAadhaar(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to initiate DigiLocker flow');
      setVerifyingAadhaar(false);
    }
  };

  const handleVerifyPan = async () => {
    if (!formData.panNumber || !formData.panFullName || !formData.panDob) {
      toast.error('Please provide PAN number, Full Name, and Date of Birth');
      return;
    }
    setVerifyingPan(true);
    try {
      const res = await engineerAuthService.verifyPanSignup(formData.panNumber, formData.panFullName, formData.panDob);
      if (res.success) {
        setIsPanVerified(true);
        toast.success('PAN verified successfully!');
      } else {
        toast.error(res.message || 'PAN verification failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'PAN verification failed');
    } finally {
      setVerifyingPan(false);
    }
  };

  const validateStep = (stepIndex) => {
    if (stepIndex === typeStep) {
      if (!formData.engineerType) {
        toast.error('Please select an engineer type');
        return false;
      }
      if (formData.engineerType === 'vendor_engineer' && !formData.vendorCode) {
        toast.error('Vendor code is required');
        return false;
      }
      return true;
    }
    
    if (stepIndex > typeStep && stepIndex <= configMaxStep) {
      const currentStepData = validDynamicSteps.find(s => s.stepNumber === stepIndex);
      if (currentStepData) {
        for (const field of currentStepData.fields) {
          if (field.required && !formData[field.key]) {
            toast.error(`Please fill ${field.label}`);
            return false;
          }
          if (field.required && (validators[field.key] || validators[field.type])) {
            const validator = validators[field.key] || validators[field.type];
            if (validator && !validator(formData[field.key]).isValid) {
              toast.error(`Invalid value for ${field.label}`);
              return false;
            }
          }
        }
      }
      return true;
    }

    if (stepIndex === servicesStep) {
      if (formData.serviceCategories.length === 0) {
        toast.error('Please select at least one service category');
        return false;
      }
    }
    if (stepIndex === additionalDetailsStep) {
      if (kycRef.current && !kycRef.current.validate()) {
        return false;
      }
      
      // 2. Validate Operational Details
      if (config?.engineerConfig?.tshirtSizeRequired && !formData.tshirtSize) {
        toast.error('Please select a T-shirt size');
        return false;
      }
      if (config?.engineerConfig?.toolsRequired && formData.toolsAvailable.length === 0) {
        toast.error('Please select at least one tool');
        return false;
      }

      // 3. Validate Identity
      if (config?.engineerConfig?.selfieRequired && !formData.selfieUrl) {
        toast.error('Please upload a selfie for identity verification');
        return false;
      }
      if (config?.engineerConfig?.videoRequired && !formData.introVideoUrl) {
        toast.error('Please upload an intro video for identity verification');
        return false;
      }
    }
    if (stepIndex === feeStep) {
      if (config?.engineerConfig?.joiningFeeEnabled && !isPaymentSuccess) {
         toast.error('Please complete the joining fee payment to proceed');
         return false;
      }
    }
    return true;
  };

  // --- Payment & Coupon Logic ---
  const applyCoupon = async () => {
    if (!couponCode) return;
    setIsVerifyingCoupon(true);
    try {
      const res = await engineerAuthService.validateCoupon(couponCode);
      if (res.success) {
        setPaymentData(res.data);
        toast.success(`Coupon applied! You saved ₹${res.data.discountAmount}`);
        if (res.data.finalAmount === 0) {
          setIsPaymentSuccess(true);
        }
      } else {
        toast.error(res.message);
        setPaymentData(null);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Invalid coupon code');
      setPaymentData(null);
    } finally {
      setIsVerifyingCoupon(false);
    }
  };

  const initPayment = async () => {
    setIsSubmitting(true);
    try {
      const phoneVal = formData.phone || formData.mobile || '9999999999';
      const nameVal = formData.name || formData.fullName || 'Engineer';
      const emailVal = formData.email || 'engineer@example.com';
      
      const res = await engineerAuthService.createJoiningFeeOrder({
        couponCode: paymentData?.couponCode || null,
        name: nameVal,
        phone: phoneVal,
        email: emailVal,
        engineerType: formData.engineerType,
        vendorCode: formData.vendorCode
      });

      if (res.success) {
        setFormData(p => ({ ...p, registrationDraftId: res.data.registrationDraftId }));
        if (res.isFree) {
          setIsPaymentSuccess(true);
          toast.success('Registration fee waived!');
          setCurrentStep(prev => prev + 1);
          return;
        }

        const isRazorpayLoaded = await loadRazorpay();
        if (!isRazorpayLoaded) {
          toast.error('Razorpay failed to load. Are you offline?');
          setIsSubmitting(false);
          return;
        }

        const options = {
          key: res.data.key || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TYY4zOaT9M3tQ4',
          amount: res.data.amount,
          currency: res.data.currency,
          name: 'WBI Engineer',
          description: 'Engineer Joining Fee',
          order_id: res.data.orderId,
          handler: async function (response) {
            try {
              const verifyRes = await engineerAuthService.verifyJoiningFeePayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                registrationDraftId: res.data.registrationDraftId
              });
              if (verifyRes.success) {
                setFormData(p => ({
                  ...p,
                  joiningFeePaid: true,
                  joiningFeeAmount: res.data.originalAmount,
                  joiningFeeDiscount: res.data.discountAmount,
                  joiningFeeFinalAmount: res.data.finalAmount,
                  couponCode: res.data.couponCode,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  registrationDraftId: res.data.registrationDraftId
                }));
                setIsPaymentSuccess(true);
                toast.success('Payment Successful!');
                setCurrentStep(submitStep); 
              }
            } catch (err) {
              toast.error('Payment verification failed');
            }
          },
          prefill: {
            name: nameVal,
            contact: phoneVal,
            email: emailVal
          },
          theme: { color: '#4F46E5' }
        };

        const rzp1 = new window.Razorpay(options);
        rzp1.on('payment.failed', function (response) {
          toast.error(response.error.description);
        });
        rzp1.open();
      }
    } catch (error) {
      toast.error('Failed to initiate payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;
    setIsSubmitting(true);
    try {
      const categoryTitles = formData.serviceCategories.map(id => {
        const cat = config?.categories?.find(c => c.id === id || c._id === id || c.title === id || c.name === id);
        return cat ? (cat.title || cat.name) : id;
      });

      const subServicesPayload = formData.subServices.map(name => {
        const sub = config?.subServices?.find(s => s.name === name || s.title === name);
        return {
          subServiceId: sub ? (sub.id || sub._id) : null,
          name: name,
          skills: [],
          customSkills: [],
          experienceLevel: '',
          yearsOfExperience: 0
        };
      }).filter(s => s.subServiceId !== null);

      const payload = {
        ...formData,
        roleType: 'Engineer',
        serviceCategories: categoryTitles,
        subServices: subServicesPayload,
      };

      const response = await engineerAuthService.register(payload);
      if (response.success) {
        sessionStorage.removeItem('engineerSignupDraft');
        toast.success(
          <div className="flex flex-col">
            <span className="font-bold">Welcome Onboard!</span>
            <span className="text-xs">Your account is pending admin approval.</span>
          </div>,
          { icon: <FiCheckCircle className="text-green-500" /> }
        );
        navigate('/engineer/login', { replace: true });
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

    if (!config) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <FiLock className="w-12 h-12 text-gray-300 mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Service Temporarily Unavailable</h2>
          <p className="text-gray-500 max-w-md mb-6">We are currently experiencing technical difficulties connecting to the server. Please check your connection or try again in a few moments.</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-[#4F46E5] text-white rounded-xl font-semibold shadow-sm hover:bg-[#4338ca] transition-colors">
            Retry
          </button>
        </div>
      );
    }

    const currentStepData = validDynamicSteps.find(s => s.stepNumber === currentStep);

    return (
      <main className="max-w-3xl mx-auto w-full p-4 sm:p-6 lg:p-8 flex-1">
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          
          {/* Stepper Header */}
          <div className="flex items-center justify-between mb-8 overflow-x-auto pb-4 pt-2 scrollbar-hide">
            {Array.from({length: totalSteps}, (_, i) => i + 1).map((step) => (
              <React.Fragment key={step}>
                <div className={`w-9 h-9 flex items-center justify-center rounded-full font-bold text-sm shrink-0 shadow-sm transition-all ${currentStep >= step ? 'bg-[#4F46E5] text-white ring-4 ring-[#4F46E5]/20' : 'bg-gray-100 text-gray-400'}`}>
                  {step}
                </div>
                {step < totalSteps && <div className={`flex-1 h-1.5 mx-2 rounded-full transition-all min-w-[20px] ${currentStep > step ? 'bg-[#4F46E5]' : 'bg-gray-100'}`} />}
              </React.Fragment>
            ))}
          </div>

          <div className="space-y-6 animate-fadeIn">
            
            {/* Engineer Type Step */}
            {currentStep === typeStep && (
              <div className="space-y-6 animate-fadeIn">
                <h2 className="text-2xl font-bold text-gray-900">Choose Your Role</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    onClick={() => setFormData(p => ({ ...p, engineerType: 'freelancer', vendorCode: '' }))}
                    className={`p-6 border-2 rounded-2xl cursor-pointer transition-all flex flex-col items-center justify-center text-center ${formData.engineerType === 'freelancer' ? 'border-[#4F46E5] bg-[#4F46E5]/5 shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${formData.engineerType === 'freelancer' ? 'bg-[#4F46E5] text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <FiUser className="w-6 h-6" />
                    </div>
                    <h3 className={`font-bold mb-2 ${formData.engineerType === 'freelancer' ? 'text-[#4F46E5]' : 'text-gray-700'}`}>Freelancer Engineer</h3>
                    <p className="text-sm text-gray-500">I want to work independently and manage my own tasks.</p>
                  </div>
                  <div
                    onClick={() => setFormData(p => ({ ...p, engineerType: 'vendor_engineer' }))}
                    className={`p-6 border-2 rounded-2xl cursor-pointer transition-all flex flex-col items-center justify-center text-center ${formData.engineerType === 'vendor_engineer' ? 'border-[#4F46E5] bg-[#4F46E5]/5 shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${formData.engineerType === 'vendor_engineer' ? 'bg-[#4F46E5] text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <FiBriefcase className="w-6 h-6" />
                    </div>
                    <h3 className={`font-bold mb-2 ${formData.engineerType === 'vendor_engineer' ? 'text-[#4F46E5]' : 'text-gray-700'}`}>Company / Vendor Engineer</h3>
                    <p className="text-sm text-gray-500">I am employed by a registered vendor or company.</p>
                  </div>
                </div>

                {formData.engineerType === 'vendor_engineer' && (
                  <div className="mt-6 animate-fadeIn">
                    <label className="block text-sm font-bold text-gray-700 mb-2">Vendor/Company Code *</label>
                    <div className="relative">
                      <FiBriefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={formData.vendorCode}
                        onChange={(e) => setFormData(p => ({ ...p, vendorCode: e.target.value }))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-all uppercase"
                        placeholder="Enter vendor code, email, or mobile"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Ask your vendor for their code if you do not have it.</p>
                  </div>
                )}
              </div>
            )}

            {/* Dynamic Registration Steps (2 to configMaxStep) */}
            {currentStep > typeStep && currentStep <= configMaxStep && currentStepData && currentStepData.fields && currentStepData.fields.length > 0 && (
              <div className="space-y-5 animate-fadeIn">
                <h2 className="text-xl font-bold">{currentStepData.title || `Step ${currentStep}`}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {currentStepData.fields.map(field => (
                    <div key={field.key}>
                      <ValidatedInput 
                        label={field.label}
                        name={field.key} 
                        value={formData[field.key] || ''} 
                        onChange={handleChange} 
                        type={field.type} 
                        placeholder={`Enter ${field.label}`} 
                        required={field.required}
                        validator={validators[field.key] || validators[field.type]}
                      />
                      {field.type === 'tel' && (
                        <div className="mt-2">
                           {!isPhoneVerified && (
                             <button type="button" onClick={() => handleSendOtp(formData[field.key])} className="text-sm text-[#4F46E5] font-semibold">
                               {otpSent ? 'Resend OTP' : 'Send OTP'}
                             </button>
                           )}
                           {otpSent && !isPhoneVerified && (
                              <div className="mt-2 flex gap-2">
                                <input type="text" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full p-2 border rounded-lg" placeholder="6-digit OTP" />
                                <button type="button" onClick={() => handleVerifyOtp(formData[field.key])} className="px-4 bg-gray-900 text-white rounded-lg font-medium">Verify</button>
                              </div>
                           )}
                           {isPhoneVerified && <span className="text-green-600 text-sm font-medium">Verified</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Services Step */}
            {currentStep === servicesStep && config?.categories?.length > 0 && (
              <div className="space-y-5 animate-fadeIn">
                <h2 className="text-xl font-bold">Services Offered</h2>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Service Categories *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {config?.categories?.map(cat => {
                      const isSelected = formData.serviceCategories.includes(cat.title || cat.name);
                      
                      const renderIcon = (iconStr) => {
                        if (!iconStr) return <FiBriefcase className="w-4 h-4 mr-2" />;
                        if (iconStr.includes('/') || iconStr.includes('.')) return <img fetchPriority="low" loading="lazy" src={iconStr} className={`w-5 h-5 mr-2 object-contain ${isSelected ? '' : 'grayscale opacity-60'}`} alt=""/>;
                        return <FiBriefcase className={`w-4 h-4 mr-2 ${isSelected ? 'text-[#4F46E5]' : 'text-gray-400'}`} />;
                      };

                      return (
                        <div key={cat.id || cat._id} className={`border rounded-xl transition-all flex flex-col overflow-hidden ${isSelected ? 'border-[#4F46E5] bg-[#4F46E5]/5 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                          <div 
                            onClick={() => handleCategoryToggle(cat.title || cat.name)}
                            className="px-3 py-2.5 cursor-pointer flex items-center"
                          >
                            {renderIcon(cat.icon)}
                            <span className={`text-xs font-semibold truncate ${isSelected ? 'text-[#4F46E5]' : 'text-gray-600'}`}>{cat.name || cat.title}</span>
                          </div>
                          
                          {/* Sub Services */}
                          {isSelected && config?.subServices?.some(sub => sub.categoryId === (cat.id || cat._id)) && (
                            <div className="px-3 pb-3 space-y-1.5 border-t border-[#4F46E5]/10 pt-2 mt-auto">
                              {config.subServices
                                .filter(sub => sub.categoryId === (cat.id || cat._id))
                                .map(sub => {
                                  const isSubSelected = formData.subServices.includes(sub.name);
                                  return (
                                    <div 
                                      key={sub.id || sub._id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSubServiceToggle(sub.name);
                                      }}
                                      className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-all flex items-center ${isSubSelected ? 'bg-[#4F46E5] text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                                    >
                                      {sub.name}
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Additional Details Step */}
            {currentStep === additionalDetailsStep && (
              <div className="space-y-8 animate-fadeIn">
                {/* 1. KYC Documents */}
                <KYCVerificationStep 
                  ref={kycRef}
                  role="engineer" 
                  mobileNumber={formData.phone || formData.mobile}
                  entityId={formData.tempEntityId}
                  redirectUrl={`${window.location.origin}${window.location.pathname}?step=${additionalDetailsStep}`}
                  onBeforeDigiLockerInitiate={() => {
                    sessionStorage.setItem('engineerSignupDraft', JSON.stringify({
                      formData,
                      isPhoneVerified,
                      otpSent
                    }));
                  }}
                  onComplete={(verifications) => setFormData(prev => ({ ...prev, verifications }))}
                />

                <div className="border-t border-gray-200"></div>

                {/* 2. Operational Details */}
                <div>
                  <h2 className="text-xl font-bold mb-4">Operational Details</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-3">T-shirt Size {config?.engineerConfig?.tshirtSizeRequired && '*'}</label>
                      <div className="flex flex-wrap gap-2">
                        {['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map(size => (
                          <button key={size} type="button" onClick={() => setFormData(p => ({...p, tshirtSize: size}))} className={`w-10 h-10 text-sm rounded-xl font-bold flex items-center justify-center transition-all ${formData.tshirtSize === size ? 'bg-[#4F46E5] text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-3">Tools Available {config?.engineerConfig?.toolsRequired && '*'}</label>
                      <div className="grid grid-cols-2 gap-2">
                        {config?.tools?.map(tool => {
                          const isSelected = formData.toolsAvailable.includes(tool.name);
                          return (
                            <div key={tool.name} onClick={() => handleToolToggle(tool.name)} className={`px-2 py-2 border rounded-lg flex items-center cursor-pointer transition-all ${isSelected ? 'border-[#4F46E5] bg-[#4F46E5]/10 text-[#4F46E5]' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                               <div className={`w-3.5 h-3.5 rounded-sm border mr-2 flex items-center justify-center ${isSelected ? 'bg-[#4F46E5] border-[#4F46E5]' : 'border-gray-300'}`}>
                                 {isSelected && <FiCheck className="w-2.5 h-2.5 text-white" />}
                               </div>
                               <span className="text-xs font-semibold">{tool.name}</span>
                            </div>
                          )
                        })}
                      </div>
                      {formData.toolsAvailable.includes('Other') && (
                        <input type="text" name="otherTools" value={formData.otherTools} onChange={handleChange} placeholder="Please specify other tools" className="mt-2 w-full text-sm bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200"></div>

                {/* 3. Identity Verification */}
                <div>
                  <h2 className="text-xl font-bold mb-4">Identity Verification</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Selfie Photo {config?.engineerConfig?.selfieRequired && '*'}</label>
                      <p className="text-xs text-gray-500 mb-3">Clear selfie of your face.</p>
                      <div className="relative border-2 border-dashed border-gray-300 rounded-2xl h-40 flex flex-col items-center justify-center bg-gray-50 overflow-hidden hover:border-[#4F46E5] transition-colors cursor-pointer w-full">
                        {formData.selfieUrl ? (
                          <img src={formData.selfieUrl} alt="Selfie" className="w-full h-full object-cover" />
                        ) : (
                          <>
                            <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-2">
                              <FiCamera className="w-5 h-5 text-gray-500" />
                            </div>
                            <span className="text-xs font-semibold text-[#4F46E5]">Take Selfie or Upload</span>
                          </>
                        )}
                        <input type="file" accept="image/*" capture="user" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleFileRead(e, val => setFormData(p => ({...p, selfieUrl: val})))} />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Short Intro Video {config?.engineerConfig?.videoRequired && '*'}</label>
                      <p className="text-xs text-gray-500 mb-3">10-second video introducing yourself.</p>
                      <div className="relative border-2 border-dashed border-gray-300 rounded-2xl h-40 flex flex-col items-center justify-center bg-gray-50 overflow-hidden hover:border-[#4F46E5] transition-colors cursor-pointer w-full">
                        {formData.introVideoUrl ? (
                          <div className="w-full h-full bg-black flex items-center justify-center">
                            <video src={formData.introVideoUrl} controls className="w-full max-h-full" />
                          </div>
                        ) : (
                          <>
                            <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-2">
                              <FiVideo className="w-5 h-5 text-gray-500" />
                            </div>
                            <span className="text-xs font-semibold text-[#4F46E5]">Record or Upload Video</span>
                          </>
                        )}
                        <input type="file" accept="video/mp4,video/webm" capture="user" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={(e) => handleFileRead(e, val => setFormData(p => ({...p, introVideoUrl: val})))} />
                        {formData.introVideoUrl && (
                          <button type="button" onClick={() => setFormData(p => ({...p, introVideoUrl: null}))} className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center z-20 shadow-md">
                            <FiX className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Joining Fee Step */}
            {currentStep === feeStep && (
              <div>
                <h2 className="text-xl font-bold mb-4">Joining Fee</h2>
                
                {config?.engineerConfig?.joiningFeeEnabled ? (
                  <div className="bg-white border rounded-2xl p-6 shadow-sm">
                    {!isPaymentSuccess ? (
                      <>
                        <div className="flex items-center justify-between border-b pb-4 mb-4">
                          <span className="font-semibold text-gray-700">Registration Fee</span>
                          <span className="text-lg font-bold">₹{config.engineerConfig.joiningFeeAmount}</span>
                        </div>
                        
                        <div className="mb-6">
                          <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Have a coupon code?</label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <FiTag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="ENTER CODE" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-10 pr-4 font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" disabled={isVerifyingCoupon || paymentData} />
                            </div>
                            {!paymentData ? (
                              <button type="button" onClick={applyCoupon} disabled={isVerifyingCoupon || !couponCode} className="px-6 bg-gray-900 text-white font-bold rounded-xl hover:bg-black disabled:opacity-50 transition-colors">
                                Apply
                              </button>
                            ) : (
                              <button type="button" onClick={() => { setCouponCode(''); setPaymentData(null); }} className="px-6 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors">
                                Remove
                              </button>
                            )}
                          </div>
                        </div>

                        {paymentData && (
                          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-sm">
                            <div className="flex justify-between text-gray-600 mb-1">
                              <span>Subtotal</span>
                              <span>₹{paymentData.originalAmount}</span>
                            </div>
                            <div className="flex justify-between text-green-600 font-medium mb-2 border-b border-green-200/50 pb-2">
                              <span>Discount ({paymentData.couponCode})</span>
                              <span>-₹{paymentData.discountAmount}</span>
                            </div>
                            <div className="flex justify-between font-bold text-gray-900 text-base">
                              <span>Total to Pay</span>
                              <span>₹{paymentData.finalAmount}</span>
                            </div>
                          </div>
                        )}

                        <button type="button" onClick={initPayment} disabled={isSubmitting} className="w-full py-4 bg-[#4F46E5] text-white rounded-xl font-bold shadow-lg shadow-[#4F46E5]/30 hover:bg-[#4338ca] active:scale-[0.98] transition-all disabled:opacity-70">
                          {isSubmitting ? 'Processing...' : `Pay ₹${paymentData ? paymentData.finalAmount : config.engineerConfig.joiningFeeAmount} via Razorpay`}
                        </button>
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <FiCheckCircle className="w-10 h-10 text-green-500" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Payment Successful</h3>
                        <p className="text-gray-500 mb-6">Your joining fee has been processed. You can now complete your registration.</p>
                        <div className="inline-block bg-gray-50 border rounded-lg px-4 py-2 font-medium text-gray-700">
                          Payment ID: {formData.razorpayPaymentId || 'Waived via Coupon'}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 text-center">
                    <FiCheckCircle className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Registration is Free!</h3>
                    <p className="text-gray-600">No joining fee is required at this time. You can proceed to complete your registration.</p>
                  </div>
                )}
              </div>
            )}

            {/* Final Step */}
            {currentStep === submitStep && (
              <div className="text-center py-8">
                <div className="w-28 h-28 bg-white border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.05)] rounded-full flex items-center justify-center mx-auto mb-6 overflow-hidden p-2">
                  <Logo className="w-16 h-auto" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">Ready to Submit!</h2>
                <p className="text-gray-500 max-w-sm mx-auto mb-8">Please review your details carefully. Once submitted, your profile will be sent to our admin team for verification.</p>
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-sm text-amber-800 text-left max-w-md mx-auto">
                  <span className="font-bold">Next Steps:</span>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Our team will review your application within 24-48 hours.</li>
                    <li>You'll be notified via SMS and Email once approved.</li>
                    <li>Upon approval, you can log in and start receiving jobs.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center mt-10 border-t pt-6">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep(prev => prev - 1)}
                disabled={isSubmitting || verifyingOtp}
                className="flex items-center px-6 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                <FiArrowLeft className="mr-2" /> Back
              </button>
            ) : <div></div>}

            {currentStep < totalSteps ? (
              <button
                type="button"
                onClick={() => {
                  if (validateStep(currentStep)) setCurrentStep(prev => prev + 1);
                }}
                disabled={isSubmitting || verifyingOtp}
                className="flex items-center px-8 py-2.5 bg-[#4F46E5] text-white rounded-xl font-semibold hover:bg-[#4338ca] shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next <FiArrowRight className="ml-2" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center px-10 py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-900 shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <><LogoLoader fullScreen={false} /> Submitting...</>
                ) : (
                  <>Submit Registration <FiCheckCircle className="ml-2 w-5 h-5" /></>
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
          <Link to="/engineer/login" className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
            <FiArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <Logo />
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button 
            onClick={() => {
              localStorage.removeItem('workerAccessToken');
              localStorage.removeItem('workerRefreshToken');
              localStorage.removeItem('workerData');
              navigate('/worker/signup', { replace: true });
            }}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all text-gray-500 hover:text-gray-700"
          >
            Worker
          </button>
          <button className="px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-white text-[#4F46E5] shadow-sm">
            Engineer
          </button>
        </div>
      </nav>
      {renderContent()}
    </div>
  );
}
