import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiChevronRight, FiChevronLeft, FiCheck, FiBriefcase, FiTrendingUp, FiShield } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { themeColors } from '../../../theme';
import { validators } from '../../../utils/validationUtils';
import Logo from '../../../components/common/Logo';
import LogoLoader from '../../../components/common/LogoLoader';
import api from '../../../services/api';

// Dynamic Step Components
import { 
  Step1Account, 
  Step3KYC, 
  Step4BankDetails, 
  Step5Review,
  StepBusinessInfo,
  StepChooseModel,
  StepOneTimeServices,
  StepOneTimeCapacity,
  StepProjectServices,
  StepProjectCapacity,
  StepProjectPortfolio,
  StepDocuments
} from '../components/registration/WizardSteps';

const BASE_STEPS = [
  { id: 'account', label: 'Account Verification', component: Step1Account },
  { id: 'business', label: 'Business Information', component: StepBusinessInfo },
  { id: 'models', label: 'Choose Vendor Model', component: StepChooseModel }
];

const ONE_TIME_STEPS = [
  { id: 'ot_services', label: 'One-Time Services', component: StepOneTimeServices },
  { id: 'ot_capacity', label: 'Coverage & Capacity', component: StepOneTimeCapacity }
];

const PROJECT_STEPS = [
  { id: 'pr_services', label: 'Project Services', component: StepProjectServices },
  { id: 'pr_capacity', label: 'Capacity & Infrastructure', component: StepProjectCapacity },
  { id: 'pr_portfolio', label: 'Project Portfolio', component: StepProjectPortfolio }
];

const FINAL_STEPS = [
  { id: 'documents', label: 'Documents & Compliance', component: StepDocuments },
  { id: 'bank', label: 'Bank Details', component: Step4BankDetails },
  { id: 'review', label: 'Review & Submit', component: Step5Review }
];

const VendorSignup = () => {
  const navigate = useNavigate();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [vendorModels, setVendorModels] = useState([]); 
  const kycRef = React.useRef(null);
  
  const [formData, setFormData] = useState({
    ownerName: '', mobile: '', email: '', password: '',
    isPhoneVerified: false,
    verificationToken: null,
    companyName: '', gstin: '', panNumber: '',
    models: []
  });

  const [errors, setErrors] = useState({});

  const activeSteps = [...BASE_STEPS];
  if (vendorModels.includes('ONE_TIME')) activeSteps.push(...ONE_TIME_STEPS);
  if (vendorModels.includes('PROJECT')) activeSteps.push(...PROJECT_STEPS);
  if (vendorModels.length > 0) activeSteps.push(...FINAL_STEPS);

  const currentStepData = activeSteps[currentStepIndex];

  const updateData = (newData) => {
    setFormData(prev => ({ ...prev, ...newData }));
    if (newData.models) setVendorModels(newData.models);
    const newErrors = { ...errors };
    Object.keys(newData).forEach(key => delete newErrors[key]);
    setErrors(newErrors);
  };

  const handleNext = async () => {
    // Validations based on step
    const stepId = currentStepData.id;
    
    if (stepId === 'account') {
      const nameCheck = validators.name(formData.ownerName);
      const mobileCheck = validators.mobile(formData.mobile);
      const emailCheck = validators.email(formData.email);
      const passCheck = validators.password(formData.password);
      if (!nameCheck.isValid) return toast.error(nameCheck.message);
      if (!mobileCheck.isValid) return toast.error(mobileCheck.message);
      if (!emailCheck.isValid) return toast.error(emailCheck.message);
      if (!passCheck.isValid) return toast.error(passCheck.message);
      if (!formData.isPhoneVerified || !formData.verificationToken) {
        return toast.error('Please verify your mobile number with OTP before continuing');
      }
    }
    
    if (stepId === 'business') {
      if (!formData.companyName || !formData.panNumber || !formData.officeAddress || !formData.city || !formData.state || !formData.pincode) {
        return toast.error('Please fill all mandatory business details');
      }
    }
    
    if (stepId === 'models' && formData.models.length === 0) {
      return toast.error('Please select at least one operating model');
    }

    if (stepId === 'ot_services' && (!formData.oneTimeServices || formData.oneTimeServices.length === 0)) {
      return toast.error('Please select at least one service');
    }

    if (stepId === 'ot_capacity') {
      if (!formData.dailyCapacity || !formData.totalWorkers || !formData.serviceRadiusKm) {
        return toast.error('Please fill capacity details');
      }
    }

    if (stepId === 'pr_services' && (!(formData.selectedProjectServices?.length) && (!formData.projectServices || formData.projectServices.length === 0))) {
      return toast.error('Please select at least one project service');
    }

    if (stepId === 'pr_capacity') {
      if (!formData.maxProjectValue || formData.totalEngineers === undefined || !formData.projectCoverageType) {
        return toast.error('Please fill capacity details');
      }
    }

    if (stepId === 'pr_portfolio') {
      if (!formData.portfolioTitle || !formData.portfolioClient || !formData.portfolioValue) {
        return toast.error('Please provide at least one past project detail');
      }
    }

    if (stepId === 'documents') {
      if (!formData.panUrl) return toast.error('PAN Card is mandatory');
      if (formData.incorporationType !== 'Proprietorship' && !formData.companyRegUrl) return toast.error('Company Registration is mandatory');
      if (!formData.chequeUrl) return toast.error('Cancelled Cheque is mandatory');
      if (formData.models.includes('PROJECT')) {
        if (!formData.gstUrl) return toast.error('GST is mandatory for Project vendors');
        if (!formData.pfDocumentUrl) return toast.error('PF Registration is mandatory for Project vendors');
        if (!formData.esiDocumentUrl) return toast.error('ESIC Registration is mandatory for Project vendors');
        if (!formData.workOrderUrl) return toast.error('Past PO is mandatory for Project vendors');
        if (!formData.digitalSLAAccepted) return toast.error('You must accept the Enterprise SLA & Liability Agreement');
      }
    }

    if (stepId === 'bank' && formData.bankStatus !== 'verified') {
      return toast.error('Please verify your bank account (Penny Drop) before proceeding');
    }

    setIsLoading(true);
    try {
      await new Promise(r => setTimeout(r, 400)); // UI delay
      setCurrentStepIndex(prev => Math.min(prev + 1, activeSteps.length - 1));
    } catch (err) {
      toast.error('Failed to move to next step.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setCurrentStepIndex(prev => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const res = await api.post('/vendor/onboarding/submit', formData);
      if (res.data.success) {
        // Save minimal vendor data for the pending approval workflow
        localStorage.setItem('vendorData', JSON.stringify({
          _id: res.data.vendorId,
          name: formData.ownerName || 'Partner',
          kycStatus: 'pending',
          bankStatus: 'pending',
          inductionStatus: 'pending'
        }));
        
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
  const StepComponent = currentStepData.component;

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      
      {/* LEFT PANEL - Graphics & Value Props */}
      <div className="hidden lg:flex lg:w-1/3 bg-[#0D8A72] text-white flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#096d59] opacity-50 rounded-full blur-3xl transform -translate-x-1/3 translate-y-1/3"></div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <Logo onDark className="h-9 w-9 min-h-[2.25rem] min-w-[2.25rem]" />
            <span className="text-2xl font-bold tracking-wide">WBI Partners</span>
          </div>
          
          <h1 className="text-4xl font-extrabold mb-6 leading-tight">
            Grow your service business with us.
          </h1>
          <p className="text-teal-100 text-lg mb-12">
            Join thousands of professionals scaling their operations through our dual-model platform.
          </p>
          
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                <FiBriefcase className="w-6 h-6 text-teal-200" />
              </div>
              <div>
                <h3 className="font-bold text-lg">One-Time & Projects</h3>
                <p className="text-teal-100 text-sm">Flexibility to handle quick repairs or large scale contracts.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                <FiTrendingUp className="w-6 h-6 text-teal-200" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Guaranteed Payments</h3>
                <p className="text-teal-100 text-sm">Escrow-backed transactions ensure you get paid on time, every time.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                <FiShield className="w-6 h-6 text-teal-200" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Verified Network</h3>
                <p className="text-teal-100 text-sm">Work with trusted B2B clients and premium households.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-12 text-sm text-teal-200">
          © {new Date().getFullYear()} WBI Services. All rights reserved.
        </div>
      </div>

      {/* RIGHT PANEL - Wizard Form */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-[#F8FCFC]">
        {/* Mobile Header */}
        <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-50 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-auto" />
            <span className="text-sm font-bold text-[#0D8A72]">WBI Partners</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto p-6 lg:p-12 lg:justify-center">
          
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Vendor Onboarding</h2>
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-[#0D8A72] bg-teal-50 px-3 py-1 rounded-full">Step {currentStepIndex + 1} of {activeSteps.length}</span>
              <span className="text-sm text-gray-500 font-medium">{currentStepData.label}</span>
            </div>
            
            {/* Progress Bar */}
            <div className="flex gap-1 mt-6">
              {activeSteps.map((step, idx) => (
                <div key={step.id} className={`flex-1 h-1.5 rounded-full transition-colors duration-300 ${idx <= currentStepIndex ? 'bg-[#0D8A72]' : 'bg-gray-200'}`} />
              ))}
            </div>
          </div>

          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex-1 flex flex-col">
            <div className="flex-1">
              <StepComponent data={formData} updateData={updateData} errors={errors} kycRef={kycRef} />
            </div>

            <div className="mt-10 pt-6 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={handleBack}
                disabled={currentStepIndex === 0 || isLoading}
                className={`px-5 py-2.5 rounded-xl font-bold flex items-center transition-all ${currentStepIndex === 0 ? 'opacity-0 cursor-default' : 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100'}`}
              >
                <FiChevronLeft className="w-5 h-5 mr-1" />
                Back
              </button>
              
              {currentStepIndex < activeSteps.length - 1 ? (
                <button
                  onClick={handleNext}
                  disabled={
                    isLoading ||
                    (currentStepData.id === 'account' &&
                      (!formData.isPhoneVerified || !formData.verificationToken))
                  }
                  className="px-8 py-3 rounded-xl font-bold flex items-center text-white transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none disabled:shadow-none"
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
          
          <p className="text-center mt-8 text-gray-500 text-sm font-medium">
            Already have an account? <Link to="/vendor/login" className="text-[#0D8A72] hover:underline">Login here</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default VendorSignup;
