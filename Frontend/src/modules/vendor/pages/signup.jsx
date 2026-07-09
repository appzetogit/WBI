import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiChevronRight, FiChevronLeft, FiCheck } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { themeColors } from '../../../theme';
import Logo from '../../../components/common/Logo';
import LogoLoader from '../../../components/common/LogoLoader';
import api from '../../../services/api';

import {
  Step1Account,
  Step2ServiceGeo,
  Step3KYC,
  Step4BankDetails,
  Step5Review
} from '../components/registration/WizardSteps';

const STEPS = [
  'Account', 'Services & Location', 'Digital KYC', 'Bank Verification', 'Review'
];

const VendorSignup = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState(null);
  
  const [formData, setFormData] = useState({
    ownerName: '',
    mobile: '',
    email: '',
    password: '',
    partnerMode: 'independent',
    businessType: 'quick_service',
    categoryIds: [],
    subServiceIds: [],
    workingCity: '',
    latitude: '',
    longitude: '',
    serviceRadiusKm: 10,
    companyName: '',
    companyDescription: '',
    website: '',
    officeAddress: '',
    state: '',
    city: '',
    pincode: '',
    landmark: '',
    accountHolderName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
    aadhaarUrl: '',
    panUrl: '',
    panNumber: '',
    gstNumber: '',
    gstCertificateUrl: '',
    ownerSelfieUrl: '',
    companyLogo: '',
    totalWorkers: 0,
    totalEngineers: 0,
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    workingHours: { start: '09:00', end: '18:00' },
    available24x7: false,
    emergencyServiceAvailable: false,
    paymentId: null
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await api.get('/vendor/registration-config');
        if (res.data.success) {
          setConfig(res.data.config);
        }
      } catch (err) {
        console.error('Failed to load registration config:', err);
      }
    };
    fetchConfig();
  }, []);

  const updateData = (newData) => {
    setFormData(prev => ({ ...prev, ...newData }));
    // Clear errors for updated fields
    const newErrors = { ...errors };
    Object.keys(newData).forEach(key => delete newErrors[key]);
    setErrors(newErrors);
  };

  const validateStep = (step) => {
    const newErrors = {};
    if (step === 1) {
      if (!formData.ownerName) newErrors.ownerName = 'Required';
      if (!formData.mobile) newErrors.mobile = 'Required';
      if (!formData.password) newErrors.password = 'Required';
      if (!formData.isPhoneVerified) {
        toast.error("Please verify your phone number before proceeding.");
        newErrors.isPhoneVerified = 'Required';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(5)) return;
    setIsLoading(true);
    try {
      const res = await api.post('/vendor/registration-submit', formData);
      if (res.data.success) {
        toast.success('Registration submitted successfully! Pending approval.');
        navigate('/vendor/pending-approval');
      } else {
        toast.error(res.data.message || 'Registration failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const brandColor = themeColors.brand?.teal || '#0D8A72';

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1Account data={formData} updateData={updateData} errors={errors} />;
      case 2: return <Step2ServiceGeo data={formData} updateData={updateData} />;
      case 3: return <Step3KYC data={formData} updateData={updateData} />;
      case 4: return <Step4BankDetails data={formData} updateData={updateData} />;
      case 5: return <Step5Review data={formData} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-auto" />
            <span className="text-xl font-bold text-gray-800 hidden sm:block">Vendor Registration</span>
          </div>
          <div className="text-sm text-gray-500">
            Step {currentStep} of {STEPS.length}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {STEPS.map((step, idx) => (
              <div key={step} className={`w-full h-2 rounded-full mx-1 ${idx + 1 <= currentStep ? 'bg-[#0D8A72]' : 'bg-gray-200'}`} />
            ))}
          </div>
          <div className="text-center font-bold text-[#0D8A72]">{STEPS[currentStep - 1]}</div>
        </div>

        {/* Form Content */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-lg border border-gray-100 flex-1 flex flex-col">
          <div className="flex-1">
            {renderStep()}
          </div>

          {/* Navigation Buttons */}
          <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between gap-4">
            <button
              onClick={handleBack}
              disabled={currentStep === 1 || isLoading}
              className={`px-6 py-3 rounded-xl font-bold flex items-center transition-all ${currentStep === 1 ? 'opacity-0 cursor-default' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <FiChevronLeft className="w-5 h-5 mr-1" />
              Back
            </button>
            
            {currentStep < STEPS.length ? (
              <button
                onClick={handleNext}
                disabled={isLoading}
                className="px-8 py-3 rounded-xl font-bold flex items-center text-white transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                style={{ backgroundColor: brandColor }}
              >
                Next Step
                <FiChevronRight className="w-5 h-5 ml-1" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="px-8 py-3 rounded-xl font-bold flex items-center text-white transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                style={{ backgroundColor: brandColor }}
              >
                {isLoading ? <LogoLoader fullScreen={false} inline={true} size="w-5 h-5" /> : (
                  <>
                    Submit Application
                    <FiCheck className="w-5 h-5 ml-2" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        
        <p className="text-center mt-6 text-gray-500 text-sm">
          Already have an account? <Link to="/vendor/login" className="font-bold text-[#0D8A72] hover:underline">Login here</Link>
        </p>
      </div>
    </div>
  );
};

export default VendorSignup;
