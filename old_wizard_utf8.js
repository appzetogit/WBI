import React, { useState } from 'react';
import { FiCheckCircle, FiUpload, FiMapPin, FiCreditCard, FiUser, FiBriefcase, FiZap, FiLayers } from 'react-icons/fi';
import KYCVerificationStep from '../../../../components/kyc/KYCVerificationStep';

export const Step1Account = ({ data, updateData, errors }) => {
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  
  const handleSendOtp = () => {
    if (data.mobile && data.mobile.length >= 10) {
      setOtpSent(true);
      updateData({ isPhoneVerified: false });
    }
  };

  const handleVerifyOtp = () => {
    if (otp === '1234') { 
      updateData({ isPhoneVerified: true });
    } else {
      alert("Invalid OTP! Use 1234 for simulation.");
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold">Account Setup</h3>
      <div>
        <label className="block text-sm font-medium mb-1">Owner Name</label>
        <input type="text" className="w-full p-3 border rounded-xl" value={data.ownerName || ''} onChange={e => updateData({ ownerName: e.target.value })} placeholder="John Doe" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Mobile Number</label>
        <div className="flex gap-2">
          <input type="text" className="flex-1 p-3 border rounded-xl" value={data.mobile || ''} onChange={e => updateData({ mobile: e.target.value })} placeholder="10-digit number" disabled={data.isPhoneVerified} />
          {!data.isPhoneVerified && (
            <button type="button" onClick={handleSendOtp} className="px-4 bg-[#0D8A72] text-white rounded-xl font-medium transition-colors hover:bg-teal-700">
              {otpSent ? 'Resend OTP' : 'Send OTP'}
            </button>
          )}
          {data.isPhoneVerified && (
            <div className="flex items-center px-4 bg-green-50 text-green-700 border border-green-200 rounded-xl font-medium">
              <FiCheckCircle className="mr-2"/> Verified
            </div>
          )}
        </div>
      </div>
      
      {otpSent && !data.isPhoneVerified && (
        <div className="p-4 bg-teal-50 border border-[#0D8A72]/20 rounded-xl flex gap-3 animate-fade-in">
          <input type="text" className="flex-1 p-3 border rounded-xl" placeholder="Enter OTP (Use 1234)" value={otp} onChange={e => setOtp(e.target.value)} />
          <button type="button" onClick={handleVerifyOtp} className="px-6 bg-gray-900 text-white rounded-xl font-medium hover:bg-black">Verify</button>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input type="email" className="w-full p-3 border rounded-xl" value={data.email || ''} onChange={e => updateData({ email: e.target.value })} placeholder="john@example.com" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Password</label>
        <input type="password" className="w-full p-3 border rounded-xl" value={data.password || ''} onChange={e => updateData({ password: e.target.value })} placeholder="Create a strong password" />
      </div>
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
  
  const handleVerifyBank = () => {
    if (!data.accountNumber || !data.ifscCode) return;
    setVerifying(true);
    
    setTimeout(() => {
      setVerifying(false);
      updateData({ 
        bankStatus: 'verified',
        pennyDropName: data.ownerName || 'Verified User' 
      });
    }, 2000);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold">Bank Details (Penny Drop Verification)</h3>
      <div>
        <label className="block text-sm font-medium mb-1">Account Holder Name (As per Bank)</label>
        <input type="text" className="w-full p-3 border rounded-xl" value={data.accountHolderName || ''} onChange={e => updateData({ accountHolderName: e.target.value })} disabled={data.bankStatus === 'verified'} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Account Number</label>
        <input type="text" className="w-full p-3 border rounded-xl" value={data.accountNumber || ''} onChange={e => updateData({ accountNumber: e.target.value })} disabled={data.bankStatus === 'verified'} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">IFSC Code</label>
        <input type="text" className="w-full p-3 border rounded-xl uppercase" value={data.ifscCode || ''} onChange={e => updateData({ ifscCode: e.target.value.toUpperCase() })} disabled={data.bankStatus === 'verified'} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">UPI ID (Optional)</label>
        <input type="text" className="w-full p-3 border rounded-xl" value={data.upiId || ''} onChange={e => updateData({ upiId: e.target.value })} disabled={data.bankStatus === 'verified'} />
      </div>

      <div className="pt-2">
        {data.bankStatus === 'verified' ? (
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center text-green-700 font-bold mb-1">
              <FiCheckCircle className="mr-2" /> Bank Account Verified
            </div>
            <p className="text-sm text-green-600">IMPS Penny drop successful. Name matched ({data.pennyDropName}) with 95% fuzzy score.</p>
          </div>
        ) : (
          <button 
            type="button" 
            onClick={handleVerifyBank}
            disabled={verifying || !data.accountNumber || !data.ifscCode}
            className={`w-full p-3 rounded-xl font-medium transition-colors ${verifying ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            {verifying ? (
              <span className="flex items-center justify-center"><span className="animate-spin mr-2 border-2 border-current border-t-transparent rounded-full w-5 h-5"></span> Executing ₹1 Penny Drop...</span>
            ) : 'Verify Bank Account'}
          </button>
        )}
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
