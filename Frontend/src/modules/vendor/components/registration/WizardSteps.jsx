import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCheckCircle, FiUpload, FiMapPin, FiCreditCard, FiUser, FiBriefcase, FiZap, FiLayers, FiLoader, FiShield } from 'react-icons/fi';
import KYCVerificationStep from '../../../../components/kyc/KYCVerificationStep';
import { toast } from 'react-hot-toast';
import { useDebouncedCallback } from 'use-debounce';
import api from '../../../../services/api';
import ValidatedInput from '../../../../components/common/ValidatedInput';
import { validators } from '../../../../utils/validationUtils';
import { sendOTP, verifyLogin } from '../../services/authService';

const OTP_RESEND_SECONDS = 45;

const normalizeMobile = (raw) => String(raw || '').replace(/\D/g, '').slice(-10);

const handleOtpApiError = (err, fallback) => {
  if (err?.response?.status === 429) {
    toast.error('Too many OTP requests. Please wait a few minutes and try again.');
    return;
  }
  toast.error(err?.response?.data?.message || fallback);
};

export const Step1Account = ({ data, updateData, errors }) => {
  const navigate = useNavigate();
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpInputRef = useRef(null);
  const lastSentPhone = useRef('');

  const mobileDigits = normalizeMobile(data.mobile);
  const verified = !!data.isPhoneVerified;

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  useEffect(() => {
    if (otpSent && !verified && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [otpSent, verified]);

  const resetPhoneVerification = useCallback(() => {
    updateData({
      isPhoneVerified: false,
      verificationToken: null
    });
    setOtpSent(false);
    setOtp('');
    setResendIn(0);
  }, [updateData]);

  const handleMobileChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    updateData({ mobile: digits });
    if (verified || (otpSent && digits !== lastSentPhone.current)) {
      resetPhoneVerification();
    }
  };

  const handleSendOtp = useDebouncedCallback(async () => {
    const phone = mobileDigits;
    const check = validators.mobile(phone);
    if (!check.isValid) {
      toast.error(check.message);
      return;
    }
    if (sendingOtp || (resendIn > 0 && otpSent)) return;

    setSendingOtp(true);
    try {
      const res = await sendOTP(phone);
      if (res.success) {
        if (res.vendor?.adminApproval === 'pending') {
          toast.success(res.message || 'Your application is under review.');
          navigate('/vendor/pending-approval');
          return;
        }
        lastSentPhone.current = phone;
        setOtpSent(true);
        setResendIn(OTP_RESEND_SECONDS);
        toast.success('OTP sent to your mobile');
      } else {
        toast.error(res.message || 'Failed to send OTP');
      }
    } catch (err) {
      handleOtpApiError(err, 'Failed to send OTP');
    } finally {
      setSendingOtp(false);
    }
  }, 400);

  const handleVerifyOtp = async () => {
    const phone = mobileDigits;
    if (!validators.mobile(phone).isValid) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    if (!otp || otp.length !== 6) {
      toast.error('Enter the 6-digit OTP from SMS');
      return;
    }
    if (verifyingOtp) return;

    setVerifyingOtp(true);
    try {
      const res = await verifyLogin({ phone, otp });
      if (!res.success) {
        toast.error(res.message || 'Invalid OTP');
        return;
      }

      if (res.vendor?.adminApproval === 'pending') {
        toast.success(res.message || 'Account under review.');
        navigate('/vendor/pending-approval');
        return;
      }

      if (!res.isNewUser && (res.accessToken || res.user)) {
        toast.error('This mobile number is already registered. Please log in.');
        navigate('/vendor/login');
        return;
      }

      if (res.verificationToken) {
        updateData({
          isPhoneVerified: true,
          verificationToken: res.verificationToken,
          mobile: phone
        });
        setOtp('');
        toast.success('Mobile number verified');
      } else {
        toast.error('Verification session missing. Please request a new OTP.');
      }
    } catch (err) {
      handleOtpApiError(err, 'Could not verify OTP');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const inputClass =
    'w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D8A72]/25 focus:border-[#0D8A72] transition-all';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-900">Account setup</h3>
        <p className="text-sm text-gray-500 mt-1">
          Verify your mobile with OTP, then set login credentials. We never share your number.
        </p>
      </div>

      <ValidatedInput
        label="Owner name"
        name="ownerName"
        value={data.ownerName || ''}
        onChange={(e) => updateData({ ownerName: e.target.value })}
        placeholder="As on PAN / Aadhaar"
        validator={validators.name}
      />

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1.5">
          Mobile number <span className="text-red-500">*</span>
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex flex-1 items-center rounded-xl border border-gray-200 bg-gray-50 focus-within:ring-2 focus-within:ring-[#0D8A72]/25 focus-within:border-[#0D8A72] overflow-hidden">
            <span className="pl-3 pr-2 text-sm font-semibold text-gray-500 border-r border-gray-200 py-3 bg-white/80">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              className="flex-1 py-3 px-3 bg-transparent focus:outline-none text-gray-900"
              value={data.mobile || ''}
              onChange={handleMobileChange}
              placeholder="10-digit number"
              disabled={verified}
              maxLength={10}
              aria-invalid={!!errors.mobile}
            />
          </div>
          {!verified ? (
            <button
              type="button"
              onClick={() => handleSendOtp()}
              disabled={sendingOtp || mobileDigits.length !== 10 || (otpSent && resendIn > 0)}
              className="sm:w-auto w-full px-5 py-3 bg-[#0D8A72] text-white rounded-xl font-semibold hover:bg-[#0a735f] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
            >
              {sendingOtp && <FiLoader className="w-4 h-4 animate-spin" />}
              {otpSent ? (resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP') : 'Send OTP'}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-semibold shrink-0">
              <FiCheckCircle className="w-5 h-5" aria-hidden />
              Verified
            </div>
          )}
        </div>
        {verified && (
          <button
            type="button"
            className="text-xs text-[#0D8A72] font-semibold mt-2 hover:underline"
            onClick={resetPhoneVerification}
          >
            Change mobile number
          </button>
        )}
      </div>

      {otpSent && !verified && (
        <div
          className="p-4 bg-teal-50/80 border border-teal-100 rounded-2xl space-y-3"
          role="region"
          aria-label="OTP verification"
        >
          <div className="flex items-start gap-2">
            <FiShield className="w-5 h-5 text-[#0D8A72] mt-0.5 shrink-0" />
            <p className="text-sm text-gray-700">
              Enter the <strong>6-digit code</strong> sent to +91 {mobileDigits}. Valid for a few minutes.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              ref={otpInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVerifyOtp();
              }}
              className={`${inputClass} tracking-[0.35em] text-center text-lg font-semibold sm:flex-1`}
              placeholder="••••••"
              aria-label="6-digit OTP"
            />
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={verifyingOtp || otp.length !== 6}
              className="px-6 py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-black disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {verifyingOtp && <FiLoader className="w-4 h-4 animate-spin" />}
              Verify OTP
            </button>
          </div>
        </div>
      )}

      <ValidatedInput
        label="Business email"
        name="email"
        type="email"
        value={data.email || ''}
        onChange={(e) => updateData({ email: e.target.value })}
        placeholder="you@company.com"
        validator={validators.email}
      />

      <ValidatedInput
        label="Password"
        name="password"
        type="password"
        value={data.password || ''}
        onChange={(e) => updateData({ password: e.target.value })}
        placeholder="Min 8 chars, upper, lower, number, symbol"
        validator={validators.password}
      />
    </div>
  );
};

// Merged Step 4 & 5 -> Step 2
export const Step2ServiceGeo = ({ data, updateData }) => {
  const [fetching, setFetching] = useState(false);
  
  const handleGetLocation = () => {
    setFetching(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateData({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          setFetching(false);
        },
        (error) => {
          alert('Error fetching location. Please enable location permissions.');
          setFetching(false);
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
      setFetching(false);
    }
  };

  const allServices = ['Home Appliances', 'Electrical', 'Plumbing', 'IT & Computer', 'Networking', 'Mobile & Gadgets', 'CCTV', 'Telecom', 'Security Devices', 'Office Equipment', 'Automobile', 'Digital Solutions', 'Energy', 'Healthcare', 'Automation', 'Fire & Safety', 'Solar'];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold mb-4">Service Classification</h3>
        <label className="block text-sm font-medium mb-1">Primary Services</label>
        <p className="text-xs text-gray-500 mb-4">Select the main categories you operate in.</p>
        <div className="grid grid-cols-2 gap-3 h-48 overflow-y-auto p-2 border rounded-xl bg-gray-50">
          {allServices.map(srv => (
            <label key={srv} className="flex items-center p-2 border rounded-lg cursor-pointer bg-white hover:bg-gray-50 transition-colors">
              <input type="checkbox" className="mr-3 w-4 h-4 text-[#0D8A72] focus:ring-[#0D8A72] border-gray-300 rounded" />
              <span className="text-sm font-medium text-gray-700">{srv}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold mb-4">Geo-Mapping (Operational Radius)</h3>
        <div>
          <label className="block text-sm font-medium mb-1">Working City</label>
          <input type="text" className="w-full p-3 border rounded-xl mb-4" value={data.workingCity || ''} onChange={e => updateData({ workingCity: e.target.value })} placeholder="e.g., Mumbai" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Service Radius (Km)</label>
          <input type="number" className="w-full p-3 border rounded-xl mb-4" value={data.serviceRadiusKm || 10} onChange={e => updateData({ serviceRadiusKm: e.target.value })} />
        </div>
        
        <div className="p-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <div className="text-center">
            <FiMapPin className={`w-8 h-8 mx-auto mb-3 ${data.latitude ? 'text-[#0D8A72]' : 'text-gray-400'}`} />
            {data.latitude && data.longitude ? (
              <div className="mb-3">
                <p className="font-medium text-green-700">Location Captured Successfully!</p>
                <p className="text-xs text-gray-500">Lat: {data.latitude.toFixed(4)}, Lng: {data.longitude.toFixed(4)}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-600 mb-3">Live GPS geofencing required for operational radius.</p>
            )}
            <button 
              type="button" 
              onClick={handleGetLocation} 
              disabled={fetching}
              className="px-4 py-2 bg-[#0D8A72] text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
            >
              {fetching ? 'Detecting Location...' : data.latitude ? 'Update Location' : 'Detect My Location'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Step 3 (KYC & Bank)
export const Step3KYC = ({ data, updateData, kycRef }) => {
  return (
    <div className="space-y-6">
      <KYCVerificationStep 
        ref={kycRef}
        role="vendor" 
        mobileNumber={data.mobile}
        onComplete={(verifications) => updateData({ verifications, aadhaarVerified: verifications?.aadhaar?.status === 'verified', bankStatus: verifications?.bank?.status === 'verified' ? 'verified' : 'pending' })}
      />
    </div>
  );
};

// Step 4 (was Step 8)
export const Step4BankDetails = ({ data, updateData }) => {
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState(null);
  
  const handleVerifyBank = async () => {
    if (!data.accountNumber || !data.ifscCode || !data.accountHolderName) {
      toast.error('Please fill all required bank details.');
      return;
    }
    setVerifying(true);
    setVerificationError(null);
    
    try {
      // In a fully integrated flow, vendorId is present after step 1 registration.
      // If vendorId is missing (draft UI mode), we still hit the API to simulate the network request structure.
      const response = await api.post('/vendor/verify-bank-penny-drop', {
        vendorId: data.vendorId || 'draft_mode_validation', 
        ownerName: data.ownerName, // For fuzzy matching if vendorId is draft
        companyName: data.companyName, // Also check against company name
        bankName: data.accountHolderName,
        accountNumber: data.accountNumber,
        ifsc: data.ifscCode,
        upiId: data.upiId
      }).catch(err => err.response); // Catch here to read response data even on 4xx/5xx

      // If backend throws 404 (Vendor not found because we are in draft mode and haven't saved step 1 yet), 
      // or if it succeeds, we handle the UI accordingly.
      
      // For production frontend-only draft flow: we rely on fuzzy match simulation if DB lookup fails, 
      // but if the backend actually processed it (success: true), we accept it.
      
      if (response && response.data && response.data.success) {
        updateData({ 
          bankStatus: 'verified',
          pennyDropName: data.accountHolderName 
        });
        toast.success(response.data.message || 'Bank verified successfully!');
      } else if (response && response.data) {
         // Handle any 4xx/5xx errors properly
         const errMsg = response.data.message || 'Verification failed. Please check details.';
         setVerificationError(errMsg);
         toast.error(errMsg);
      } else if (response) {
         setVerificationError(`Verification failed with status: ${response.status}`);
         toast.error(`Verification failed with status: ${response.status}`);
      } else {
         // Network or unexpected error
         setVerificationError('Failed to communicate with the verification server. Network error.');
         toast.error('Failed to communicate with the verification server. Network error.');
      }
    } catch (error) {
       setVerificationError('Failed to verify bank account');
       toast.error('Failed to verify bank account');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in flex flex-col h-full">
      <h3 className="text-xl font-bold">Bank Details (Penny Drop Verification)</h3>
      <p className="text-gray-500 text-sm mb-4">We will deposit ₹1 to verify your account.</p>
      
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Account Holder Name (As per Bank)</label>
            <input type="text" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.accountHolderName || ''} onChange={e => updateData({ accountHolderName: e.target.value })} disabled={data.bankStatus === 'verified'} placeholder="e.g. Acme Services" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Account Number</label>
            <input type="text" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.accountNumber || ''} onChange={e => updateData({ accountNumber: e.target.value })} disabled={data.bankStatus === 'verified'} placeholder="0000000000" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">IFSC Code</label>
            <input type="text" className="w-full p-3 border rounded-xl uppercase focus:ring-2 focus:ring-[#0D8A72]" value={data.ifscCode || ''} onChange={e => updateData({ ifscCode: e.target.value.toUpperCase() })} disabled={data.bankStatus === 'verified'} placeholder="HDFC0001234" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">UPI ID (Optional)</label>
            <input type="text" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.upiId || ''} onChange={e => updateData({ upiId: e.target.value })} disabled={data.bankStatus === 'verified'} placeholder="vendor@upi" />
          </div>

          <div className="pt-2">
            {data.bankStatus === 'verified' ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex items-center text-green-700 font-bold mb-1">
                  <FiCheckCircle className="mr-2" /> Bank Account Verified
                </div>
                <p className="text-sm text-green-600">IMPS Penny drop successful. Name matched ({data.pennyDropName}).</p>
              </div>
            ) : (
              <button 
                type="button" 
                onClick={handleVerifyBank}
                disabled={verifying || !data.accountNumber || !data.ifscCode || !data.accountHolderName}
                className={`w-full p-4 rounded-xl font-bold transition-colors ${verifying || !data.accountNumber || !data.ifscCode || !data.accountHolderName ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-[#0D8A72] text-white hover:bg-teal-700 shadow-md'}`}
              >
                {verifying ? (
                  <span className="flex items-center justify-center"><span className="animate-spin mr-2 border-2 border-current border-t-transparent rounded-full w-5 h-5"></span> Executing ₹1 Penny Drop...</span>
                ) : 'Verify Bank Account'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const Step5Review = ({ data }) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold">Review Application</h3>
    <div className="space-y-4 text-sm bg-gray-50 p-6 rounded-2xl border border-gray-100">
      <div className="grid grid-cols-2 gap-y-4">
        <div><p className="text-gray-500">Name</p><p className="font-bold">{data.ownerName || '-'}</p></div>
        <div><p className="text-gray-500">Phone</p><p className="font-bold">{data.mobile || '-'}</p></div>
        <div><p className="text-gray-500">City</p><p className="font-bold">{data.workingCity || '-'}</p></div>
        <div><p className="text-gray-500">Bank Status</p><p className="font-bold text-green-600 capitalize">{data.bankStatus || '-'}</p></div>
        <div><p className="text-gray-500">KYC Status</p><p className="font-bold text-green-600">{data.aadhaarVerified ? 'Verified' : 'Pending'}</p></div>
      </div>
    </div>
    <div className="p-4 bg-blue-50 text-blue-800 rounded-xl flex items-start gap-3">
      <FiCheckCircle className="w-5 h-5 mt-0.5" />
      <div>
        <p className="font-bold">Ready for Induction!</p>
        <p className="text-sm">Submitting will move your account to "Pending Induction" status. You will need to complete training before full activation.</p>
      </div>
    </div>
  </div>
);

// --- New Dynamic Steps ---

export const StepBusinessInfo = ({ data, updateData }) => (
  <div className="space-y-4 animate-fade-in">
    <h3 className="text-xl font-bold">Business Information</h3>
    <p className="text-gray-500 text-sm mb-4">Please provide your registered business details.</p>
    
    <div>
      <label className="block text-sm font-medium mb-1">Company / Legal Name</label>
      <input type="text" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.companyName || ''} onChange={e => updateData({ companyName: e.target.value })} placeholder="e.g. Acme Services Pvt Ltd" />
    </div>
    
    <div>
      <label className="block text-sm font-medium mb-1">Incorporation Type</label>
      <select className="w-full p-3 border rounded-xl bg-white focus:ring-2 focus:ring-[#0D8A72]" value={data.incorporationType || 'Proprietorship'} onChange={e => updateData({ incorporationType: e.target.value })}>
        <option value="Proprietorship">Proprietorship</option>
        <option value="Partnership">Partnership</option>
        <option value="LLP">LLP</option>
        <option value="Private Limited">Private Limited</option>
      </select>
    </div>

    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium mb-1">PAN Number</label>
        <input type="text" className="w-full p-3 border rounded-xl uppercase focus:ring-2 focus:ring-[#0D8A72]" value={data.panNumber || ''} onChange={e => updateData({ panNumber: e.target.value })} placeholder="ABCDE1234F" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">GSTIN (Optional for Proprietors)</label>
        <input type="text" className="w-full p-3 border rounded-xl uppercase focus:ring-2 focus:ring-[#0D8A72]" value={data.gstin || ''} onChange={e => updateData({ gstin: e.target.value })} placeholder="22AAAAA0000A1Z5" />
      </div>
    </div>

    <div>
      <label className="block text-sm font-medium mb-1">Office Address</label>
      <textarea className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" rows="2" value={data.officeAddress || ''} onChange={e => updateData({ officeAddress: e.target.value })} placeholder="Full address" />
    </div>
    
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-1">
        <label className="block text-sm font-medium mb-1">Pincode</label>
        <input type="text" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.pincode || ''} onChange={e => updateData({ pincode: e.target.value })} />
      </div>
      <div className="col-span-1">
        <label className="block text-sm font-medium mb-1">City</label>
        <input type="text" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.city || ''} onChange={e => updateData({ city: e.target.value })} />
      </div>
      <div className="col-span-1">
        <label className="block text-sm font-medium mb-1">State</label>
        <input type="text" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.state || ''} onChange={e => updateData({ state: e.target.value })} />
      </div>
    </div>
  </div>
);

export const StepChooseModel = ({ data, updateData }) => {
  const models = data.models || [];
  
  const toggleModel = (modelId) => {
    if (models.includes(modelId)) {
      updateData({ models: models.filter(m => m !== modelId) });
    } else {
      updateData({ models: [...models, modelId] });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-xl font-bold">Choose Operating Model</h3>
        <p className="text-gray-500 text-sm">Select one or both models depending on your business capabilities.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div 
          onClick={() => toggleModel('ONE_TIME')}
          className={`cursor-pointer rounded-2xl p-6 border-2 transition-all ${models.includes('ONE_TIME') ? 'border-[#0D8A72] bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}
        >
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${models.includes('ONE_TIME') ? 'bg-[#0D8A72] text-white' : 'bg-gray-100 text-gray-500'}`}>
              <FiZap className="w-6 h-6" />
            </div>
            {models.includes('ONE_TIME') && <FiCheckCircle className="w-6 h-6 text-[#0D8A72]" />}
          </div>
          <h4 className="font-bold text-lg mb-2">One-Time Services</h4>
          <p className="text-sm text-gray-500">Daily repair, installation, maintenance calls, inspections, and short-duration jobs. Fast turnaround.</p>
        </div>

        <div 
          onClick={() => toggleModel('PROJECT')}
          className={`cursor-pointer rounded-2xl p-6 border-2 transition-all ${models.includes('PROJECT') ? 'border-[#0D8A72] bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}
        >
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${models.includes('PROJECT') ? 'bg-[#0D8A72] text-white' : 'bg-gray-100 text-gray-500'}`}>
              <FiLayers className="w-6 h-6" />
            </div>
            {models.includes('PROJECT') && <FiCheckCircle className="w-6 h-6 text-[#0D8A72]" />}
          </div>
          <h4 className="font-bold text-lg mb-2">Project-Based</h4>
          <p className="text-sm text-gray-500">Large, long-duration, multi-site, and milestone-based work. High value contracts and AMC.</p>
        </div>
      </div>
    </div>
  );
};

export const StepOneTimeServices = ({ data, updateData }) => {
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [subServicesByCategoryId, setSubServicesByCategoryId] = useState({});

  // Store selected OneTimeService IDs (ObjectId strings). Backend currently only checks `.length`,
  // so switching from hardcoded names → IDs is backward-safe for this flow.
  const selectedServiceIds = data.oneTimeServices || [];

  const toggle = (serviceId) => {
    if (selectedServiceIds.includes(serviceId)) {
      updateData({ oneTimeServices: selectedServiceIds.filter((s) => s !== serviceId) });
    } else {
      updateData({ oneTimeServices: [...selectedServiceIds, serviceId] });
    }
  };

  const getSelectedCount = (categoryId) => {
    const subs = subServicesByCategoryId[categoryId] || [];
    return subs.filter((s) => selectedServiceIds.includes(s.id)).length;
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await api.get('/categories', {
          params: { serviceType: 'one_time' }
        });
        if (cancelled) return;
        setCategories(res.data?.data || []);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.response?.data?.message || 'Failed to load one-time services');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!expandedCategory) return undefined;
    if (subServicesByCategoryId[expandedCategory]) return undefined;

    let cancelled = false;

    const loadSubServices = async () => {
      try {
        const res = await api.get(`/categories/${expandedCategory}/sub-services`);
        if (cancelled) return;
        setSubServicesByCategoryId((prev) => ({
          ...prev,
          [expandedCategory]: res.data?.data || []
        }));
      } catch (err) {
        // Non-fatal: user can keep trying expansions.
        if (!cancelled) setLoadError(err.response?.data?.message || 'Failed to load services for category');
      }
    };

    loadSubServices();
    return () => {
      cancelled = true;
    };
  }, [expandedCategory, subServicesByCategoryId]);

  return (
    <div className="space-y-4 animate-fade-in flex flex-col h-full">
      <h3 className="text-xl font-bold">One-Time Services</h3>
      <p className="text-gray-500 text-sm mb-4">Select the quick services you provide.</p>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
          <FiLoader className="w-5 h-5 animate-spin" /> Loading service categories...
        </div>
      )}

      {!loading && loadError && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          {loadError}
        </div>
      )}
      
      {!loading && !loadError && (
        <div className="flex-1 overflow-y-auto space-y-3 max-h-[50vh] pr-2">
          {categories.map((cat) => {
            const categoryId = String(cat._id);
            const isExpanded = expandedCategory === categoryId;
            const selectedCount = getSelectedCount(categoryId);
          
            return (
              <div key={categoryId} className="border rounded-xl bg-white overflow-hidden shadow-sm transition-all">
                <div
                  className={`flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-teal-50/50 border-b' : ''}`}
                  onClick={() => setExpandedCategory(isExpanded ? null : categoryId)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <h4 className={`font-bold truncate ${isExpanded || selectedCount > 0 ? 'text-[#0D8A72]' : 'text-gray-700'}`}>
                      {cat.name}
                    </h4>
                    {selectedCount > 0 && (
                      <span className="bg-[#0D8A72] text-white text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0">
                        {selectedCount} Selected
                      </span>
                    )}
                  </div>
                  <svg className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-[#0D8A72]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {isExpanded && (
                  <div className="p-4 bg-gray-50 grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
                    {(subServicesByCategoryId[categoryId] || []).map((srv) => {
                      const checked = selectedServiceIds.includes(srv.id);
                      return (
                        <label
                          key={srv.id}
                          className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors shadow-sm ${checked ? 'bg-teal-50/50 border-[#0D8A72]' : 'bg-white hover:border-[#0D8A72]/50'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(srv.id)}
                            className="mr-3 w-4 h-4 text-[#0D8A72] focus:ring-[#0D8A72] border-gray-300 rounded"
                          />
                          <span className={`text-sm font-medium ${checked ? 'text-[#0D8A72]' : 'text-gray-700'}`}>
                            {srv.title}
                          </span>
                        </label>
                      );
                    })}

                    {/* If a category is expanded before sub-services are fetched, show a tiny placeholder */}
                    {(!subServicesByCategoryId[categoryId] || subServicesByCategoryId[categoryId].length === 0) && (
                      <div className="col-span-2 text-xs text-gray-500 flex items-center gap-2">
                        <FiLoader className="w-4 h-4 animate-spin" /> Loading services...
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const StepOneTimeCapacity = ({ data, updateData }) => (
  <div className="space-y-4 animate-fade-in">
    <h3 className="text-xl font-bold">One-Time Coverage & Capacity</h3>
    <p className="text-gray-500 text-sm mb-4">How much work can you handle daily?</p>
    
    <div>
      <label className="block text-sm font-medium mb-1">Max Daily Jobs per Worker</label>
      <input type="number" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.dailyCapacity || 5} onChange={e => updateData({ dailyCapacity: e.target.value })} />
    </div>
    
    <div>
      <label className="block text-sm font-medium mb-1">Total Active Field Workers</label>
      <input type="number" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.totalWorkers || 1} onChange={e => updateData({ totalWorkers: e.target.value })} />
    </div>
    
    <div>
      <label className="block text-sm font-medium mb-1">Service Radius (Km)</label>
      <input type="number" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.serviceRadiusKm || 15} onChange={e => updateData({ serviceRadiusKm: e.target.value })} />
    </div>
  </div>
);

export const StepProjectServices = ({ data, updateData }) => {
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [regTemplates, setRegTemplates] = useState([]);

  const selectedServices = data.selectedProjectServices || [];
  const selectedCodes = selectedServices.map((s) => s.categoryCode);
  const selectedCodesKey = selectedCodes.join(',');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get('/public/service-configs');
        if (cancelled) return;
        if (res.data?.success) {
          setCategories(res.data.data || []);
          setLoadError(null);
        } else {
          setLoadError('Failed to load service catalog');
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.response?.data?.message || 'Failed to load services');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedCodesKey) {
      setRegTemplates([]);
      return undefined;
    }
    (async () => {
      try {
        const res = await api.get(
          `/public/registration-templates?codes=${encodeURIComponent(selectedCodesKey)}`
        );
        if (!cancelled && res.data?.success) {
          setRegTemplates(res.data.data || []);
          updateData({ registrationRequirements: res.data.data || [] });
        }
      } catch {
        if (!cancelled) setRegTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCodesKey]);

  const toggleCategory = (cat) => {
    const exists = selectedServices.find((s) => s.categoryCode === cat.categoryCode);
    let next;
    if (exists) {
      next = selectedServices.filter((s) => s.categoryCode !== cat.categoryCode);
    } else {
      const defaultSubs = (cat.subCategories?.length
        ? cat.subCategories.map((s) => s.subCatName || s.subCatCode)
        : (cat.projectMilestones || []).map((m) => m.title));
      next = [
        ...selectedServices,
        {
          categoryCode: cat.categoryCode,
          categoryName: cat.categoryName,
          subServices: defaultSubs
        }
      ];
    }
    updateData({
      selectedProjectServices: next,
      projectServices: next.map((s) => `${s.categoryName} (${s.categoryCode})`)
    });
  };

  const toggleSubService = (cat, title) => {
    const existing = selectedServices.find((s) => s.categoryCode === cat.categoryCode);
    if (!existing) {
      const next = [
        ...selectedServices,
        { categoryCode: cat.categoryCode, categoryName: cat.categoryName, subServices: [title] }
      ];
      updateData({
        selectedProjectServices: next,
        projectServices: next.map((s) => `${s.categoryName} (${s.categoryCode})`)
      });
      return;
    }

    const subs = existing.subServices || [];
    const nextSubs = subs.includes(title) ? subs.filter((t) => t !== title) : [...subs, title];
    let next = selectedServices.map((s) =>
      s.categoryCode === cat.categoryCode ? { ...s, subServices: nextSubs } : s
    );
    if (nextSubs.length === 0) {
      next = next.filter((s) => s.categoryCode !== cat.categoryCode);
    }
    updateData({
      selectedProjectServices: next,
      projectServices: next.map((s) => `${s.categoryName} (${s.categoryCode})`)
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
        <FiLoader className="w-5 h-5 animate-spin" /> Loading service catalog...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
        {loadError}. Please refresh and try again.
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in flex flex-col h-full">
      <h3 className="text-xl font-bold">Project Expertise</h3>
      <p className="text-gray-500 text-sm mb-4">
        Select from live service templates. Milestones auto-configure after approval.
      </p>
      <div className="flex-1 overflow-y-auto space-y-3 max-h-[50vh] pr-2">
        {categories.map((cat) => {
          const isExpanded = expandedCategory === cat.categoryCode;
          const isSelected = selectedCodes.includes(cat.categoryCode);
          const selected = selectedServices.find((s) => s.categoryCode === cat.categoryCode);
          const milestones = cat.projectMilestones || [];
          const serviceOptions = (cat.subCategories?.length
            ? cat.subCategories.map((s) => s.subCatName || s.subCatCode)
            : milestones.map((m) => m.title));
          const selectedCount = selected?.subServices?.length || 0;

          return (
            <div key={cat.categoryCode} className="border rounded-xl bg-white overflow-hidden shadow-sm transition-all">
              <div
                className={`flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-teal-50/50 border-b' : ''}`}
                onClick={() => setExpandedCategory(isExpanded ? null : cat.categoryCode)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => { e.stopPropagation(); toggleCategory(cat); }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-[#0D8A72] focus:ring-[#0D8A72] border-gray-300 rounded"
                  />
                  <div className="min-w-0">
                    <h4 className={`font-bold truncate ${isSelected ? 'text-[#0D8A72]' : 'text-gray-700'}`}>
                      {cat.categoryCode} · {cat.categoryName}
                    </h4>
                    <p className="text-[11px] text-gray-400">
                      {serviceOptions.length} {cat.subCategories?.length ? 'sub-services' : 'milestone template steps'}
                    </p>
                  </div>
                  {selectedCount > 0 && (
                    <span className="bg-[#0D8A72] text-white text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0">
                      {selectedCount} Selected
                    </span>
                  )}
                </div>
                <svg className={`w-5 h-5 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-[#0D8A72]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {isExpanded && (
                <div className="p-4 bg-gray-50 space-y-3 animate-fade-in">
                  <p className="text-xs text-gray-500">
                    {cat.subCategories?.length ? 'Sub-services for this category:' : 'Milestone capabilities for this service:'}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {serviceOptions.map((title, idx) => {
                      const checked = selected?.subServices?.includes(title);
                      return (
                        <label key={`${cat.categoryCode}-${title}`} className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors shadow-sm ${checked ? 'bg-teal-50/50 border-[#0D8A72]' : 'bg-white hover:border-[#0D8A72]/50'}`}>
                          <input
                            type="checkbox"
                            checked={!!checked}
                            onChange={() => toggleSubService(cat, title)}
                            className="mr-3 w-4 h-4 text-[#0D8A72] focus:ring-[#0D8A72] border-gray-300 rounded"
                          />
                          <span className={`text-sm font-medium ${checked ? 'text-[#0D8A72]' : 'text-gray-700'}`}>
                            {idx + 1}. {title}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {regTemplates.length > 0 && (
        <div className="mt-4 border border-teal-100 bg-teal-50/40 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold text-[#0D8A72]">Dynamic requirements for selected services</h4>
          {regTemplates.map((tpl) => (
            <div key={tpl.categoryCode} className="text-xs text-gray-700 space-y-1">
              <p className="font-semibold">
                {tpl.categoryCode} · {tpl.categoryName}
              </p>
              {(tpl.requiredDocuments || []).length > 0 && (
                <p>
                  <span className="text-gray-500">Documents: </span>
                  {tpl.requiredDocuments.map((d) => d.label || d.key).join(', ')}
                </p>
              )}
              {(tpl.requiredCertifications || []).length > 0 && (
                <p>
                  <span className="text-gray-500">Certifications: </span>
                  {tpl.requiredCertifications.map((d) => d.label || d.key).join(', ')}
                </p>
              )}
              {(tpl.requiredSkills || []).length > 0 && (
                <p>
                  <span className="text-gray-500">Skills: </span>
                  {tpl.requiredSkills.join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const StepProjectCapacity = ({ data, updateData }) => (
  <div className="space-y-4 animate-fade-in">
    <h3 className="text-xl font-bold">Project Capacity & Infrastructure</h3>
    <p className="text-gray-500 text-sm mb-4">Detail your capabilities for handling large contracts.</p>
    
    <div>
      <label className="block text-sm font-medium mb-1">Max Project Value (₹)</label>
      <select className="w-full p-3 border rounded-xl bg-white focus:ring-2 focus:ring-[#0D8A72]" value={data.maxProjectValue || '10L'} onChange={e => updateData({ maxProjectValue: e.target.value })}>
        <option value="5L">Up to 5 Lakhs</option>
        <option value="10L">Up to 10 Lakhs</option>
        <option value="50L">Up to 50 Lakhs</option>
        <option value="1Cr+">1 Crore +</option>
      </select>
    </div>
    
    <div>
      <label className="block text-sm font-medium mb-1">Total Specialized Engineers</label>
      <input type="number" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.totalEngineers || 0} onChange={e => updateData({ totalEngineers: e.target.value })} />
    </div>

    <div>
      <label className="block text-sm font-medium mb-1">Coverage Type</label>
      <select className="w-full p-3 border rounded-xl bg-white focus:ring-2 focus:ring-[#0D8A72]" value={data.projectCoverageType || 'City Level'} onChange={e => updateData({ projectCoverageType: e.target.value })}>
        <option value="City Level">City Level</option>
        <option value="State Level">State Level</option>
        <option value="Pan India">Pan India</option>
      </select>
    </div>
  </div>
);

export const StepProjectPortfolio = ({ data, updateData }) => (
  <div className="space-y-4 animate-fade-in">
    <h3 className="text-xl font-bold">Past Project Portfolio</h3>
    <p className="text-gray-500 text-sm mb-4">Briefly mention a past significant project you successfully delivered.</p>
    
    <div>
      <label className="block text-sm font-medium mb-1">Project Title</label>
      <input type="text" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.portfolioTitle || ''} onChange={e => updateData({ portfolioTitle: e.target.value })} placeholder="e.g. 500 Node Networking for IT Park" />
    </div>
    
    <div>
      <label className="block text-sm font-medium mb-1">Client Name / Sector</label>
      <input type="text" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.portfolioClient || ''} onChange={e => updateData({ portfolioClient: e.target.value })} placeholder="e.g. TCS / IT Sector" />
    </div>
    
    <div>
      <label className="block text-sm font-medium mb-1">Project Value (₹)</label>
      <input type="number" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72]" value={data.portfolioValue || ''} onChange={e => updateData({ portfolioValue: e.target.value })} placeholder="150000" />
    </div>
  </div>
);

export const StepDocuments = ({ data, updateData }) => {
  const handleFile = (field, e) => {
    const file = e.target.files[0];
    if (file) {
      // Mock upload behavior - in real app, you'd upload to S3 and save URL
      updateData({ [field]: file.name });
    }
  };
  
  const isProject = data.models?.includes('PROJECT');
  const notProprietor = data.incorporationType !== 'Proprietorship';

  const DocumentCard = ({ field, label, subtext }) => {
    const isUploaded = !!data[field];
    return (
      <div className={`p-4 border-2 rounded-xl text-center flex flex-col items-center justify-center h-32 transition-colors cursor-pointer relative ${isUploaded ? 'border-[#0D8A72] bg-teal-50' : 'border-dashed border-gray-300 bg-gray-50 hover:border-[#0D8A72] hover:bg-gray-100'}`}>
        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={e => handleFile(field, e)} title={isUploaded ? "Click to change document" : "Upload document"} />
        
        {isUploaded ? (
          <>
            <FiCheckCircle className="w-8 h-8 mb-2 text-[#0D8A72]" />
            <span className="text-sm font-bold text-[#0D8A72]">Uploaded Successfully</span>
            <span className="text-xs text-teal-700 mt-1 truncate w-full px-2">{data[field] !== 'mock_url_from_s3' ? data[field] : 'Document_Saved.pdf'}</span>
          </>
        ) : (
          <>
            <FiUpload className="w-6 h-6 mb-2 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <span className="text-xs text-gray-500 mt-1">{subtext}</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in flex flex-col h-full">
      <h3 className="text-xl font-bold">Documents & Compliance</h3>
      <p className="text-gray-500 text-sm mb-4">Enterprise clients require strict compliance. Upload the following documents.</p>
      
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          <DocumentCard field="panUrl" label="PAN Card" subtext="Required" />
          <DocumentCard field="gstUrl" label="GST Certificate" subtext={isProject ? 'Required for Projects' : 'Optional'} />
          <DocumentCard field="companyRegUrl" label="Business Registration" subtext="Udyam / MSME / Shop Act" />
          <DocumentCard field="chequeUrl" label="Cancelled Cheque" subtext="For Bank Verification" />

          {isProject && (
            <>
              <DocumentCard field="pfDocumentUrl" label="PF Registration" subtext="Required by Enterprise Clients" />
              <DocumentCard field="esiDocumentUrl" label="ESIC Registration" subtext="Required by Enterprise Clients" />
              <DocumentCard field="workOrderUrl" label="Past Work Order (PO)" subtext="Proof for Portfolio Project" />
            </>
          )}

        </div>

        {isProject && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3 items-start">
            <input 
              type="checkbox" 
              className="mt-1 w-5 h-5 text-[#0D8A72] rounded focus:ring-[#0D8A72]"
              checked={!!data.digitalSLAAccepted}
              onChange={e => updateData({ digitalSLAAccepted: e.target.checked })}
            />
            <div className="text-sm text-red-900">
              <span className="font-bold block">Vendor Enterprise SLA & Legal Liability Agreement</span>
              <p className="mt-1 text-red-700">By checking this box, I digitally acknowledge and accept full financial and legal responsibility for any damage, loss, or misconduct by technicians dispatched under my enterprise account.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
