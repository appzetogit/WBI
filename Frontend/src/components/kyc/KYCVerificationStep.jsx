import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { FiCheckCircle, FiAlertCircle, FiUpload, FiLoader, FiShield } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { kycService } from '../../services/kycService';

const KYCVerificationStep = forwardRef(({ role, mobileNumber, entityId, draftId, redirectUrl, onComplete, onBeforeDigiLockerInitiate }, ref) => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifications, setVerifications] = useState({});
  const [activeUploads, setActiveUploads] = useState({});

  useEffect(() => {
    loadRules();
    
    // Check if returning from DigiLocker
    const urlParams = new URLSearchParams(window.location.search);
    const recordId = urlParams.get('recordId');
    if (recordId) {
      handleDigiLockerComplete(recordId);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [role]);

  const loadRules = async () => {
    try {
      const res = await kycService.getDocumentRules(role);
      if (res.success) {
        setRules(res.data);
      }
    } catch (err) {
      toast.error('Failed to load document requirements');
    } finally {
      setLoading(false);
    }
  };

  const handleDigiLockerComplete = async (transactionId) => {
    try {
      const res = await kycService.completeDigiLocker(transactionId);
      if (res.success) {
        toast.success('DigiLocker verification complete!');
        setVerifications(p => ({ ...p, aadhaar: { status: 'verified', data: res.data } }));
      }
    } catch (err) {
      toast.error(err.message || 'DigiLocker verification failed');
    }
  };

  const handleDigiLockerInitiate = async () => {
    try {
      if (!mobileNumber) {
        toast.error('Mobile number is required for DigiLocker');
        return;
      }
      if (onBeforeDigiLockerInitiate) {
        await onBeforeDigiLockerInitiate();
      }
      const finalRedirectUrl = redirectUrl || window.location.href; // Use prop if provided
      const res = await kycService.initiateDigiLocker({ role, mobileNumber, redirectUrl: finalRedirectUrl, entityId, draftId });
      if (res.success && res.data?.authorizationUrl) {
        window.location.href = res.data.authorizationUrl;
      }
    } catch (err) {
      toast.error(err.message || 'Failed to initiate DigiLocker');
    }
  };

  const handleVerifyAadhaar = async (aadhaarNumber) => {
    if (!aadhaarNumber || aadhaarNumber.length !== 12) return toast.error('Valid 12-digit Aadhaar required');
    try {
      setVerifications(p => ({ ...p, aadhaar: { status: 'verifying' } }));
      const res = await kycService.verifyAadhaar({ role, entityId, aadhaarNumber });
      if (res.success) {
        toast.success('Aadhaar verified successfully');
        setVerifications(p => ({ ...p, aadhaar: { status: 'verified', data: res.data } }));
      }
    } catch (err) {
      toast.error(err.message || 'Aadhaar verification failed');
      setVerifications(p => ({ ...p, aadhaar: { status: 'failed', error: err.message, otpSent: false } }));
    }
  };

  const handleVerifyPan = async (panNumber, name) => {
    if (!panNumber || !name) return toast.error('PAN and Name are required');
    try {
      setVerifications(p => ({ ...p, pan: { status: 'verifying' } }));
      const res = await kycService.verifyPan({ role, entityId, panNumber, name });
      if (res.success) {
        toast.success('PAN verified successfully');
        setVerifications(p => ({ ...p, pan: { status: 'verified', data: res.data } }));
      }
    } catch (err) {
      toast.error(err.message || 'PAN verification failed');
      setVerifications(p => ({ ...p, pan: { status: 'failed', error: err.message } }));
    }
  };

  const handleVerifyBank = async (accountNumber, ifsc, name) => {
    if (!accountNumber || !ifsc) return toast.error('Account and IFSC are required');
    try {
      setVerifications(p => ({ ...p, bank: { status: 'verifying' } }));
      const res = await kycService.verifyBank({ role, entityId, accountNumber, ifsc, name });
      if (res.success) {
        toast.success('Bank verified successfully');
        setVerifications(p => ({ ...p, bank: { status: 'verified', data: res.data } }));
      }
    } catch (err) {
      toast.error(err.message || 'Bank verification failed');
      setVerifications(p => ({ ...p, bank: { status: 'failed', error: err.message } }));
    }
  };

  const handleFileUpload = async (e, rule) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > rule.maxFileSize) {
      return toast.error(`File size must be less than ${rule.maxFileSize / (1024 * 1024)}MB`);
    }

    setActiveUploads(p => ({ ...p, [rule.documentType]: true }));
    try {
      // Simulate file upload (replace with actual upload logic to Cloudinary/S3)
      const reader = new FileReader();
      reader.onloadend = async () => {
        const fileUrl = reader.result; 
        const res = await kycService.uploadDocument({ 
          role, entityId, documentType: rule.documentType, fileUrl, fileKey: 'mock-key' 
        });
        if (res.success) {
          toast.success(`${rule.label} uploaded successfully`);
          setVerifications(p => ({ ...p, [rule.documentType]: { status: 'uploaded', fileUrl } }));
        }
        setActiveUploads(p => ({ ...p, [rule.documentType]: false }));
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error(err.message || 'File upload failed');
      setActiveUploads(p => ({ ...p, [rule.documentType]: false }));
    }
  };

  useImperativeHandle(ref, () => ({
    validate: () => {
      for (const rule of rules) {
        if (rule.required) {
          const status = verifications[rule.documentType]?.status;
          if (!status || status === 'failed' || status === 'rejected') {
            toast.error(`Please complete verification for ${rule.label}`);
            return false;
          }
        }
      }
      return true;
    }
  }));

  if (loading) return <div className="p-8 text-center"><FiLoader className="animate-spin text-2xl mx-auto" /></div>;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
        <FiShield className="text-blue-500 w-5 h-5 mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="font-semibold text-blue-900 text-sm">Mandatory Verification</h3>
          <p className="text-xs text-blue-700 mt-1">Please complete all required verifications to proceed. Your data is stored securely.</p>
        </div>
      </div>

      <div className="grid gap-4">
        {rules.map(rule => {
          const vState = verifications[rule.documentType] || {};
          const isVerified = vState.status === 'verified' || vState.status === 'uploaded';
          const isFailed = vState.status === 'failed';

          return (
            <div key={rule.documentType} className={`p-4 border rounded-xl transition-all ${isVerified ? 'border-green-200 bg-green-50/30' : isFailed ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-white'}`}>
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-800 text-sm">{rule.label} {rule.required && <span className="text-red-500">*</span>}</h4>
                {isVerified ? (
                  <span className="flex items-center text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-md"><FiCheckCircle className="mr-1" /> {vState.status === 'verified' ? 'Verified' : 'Uploaded'}</span>
                ) : isFailed ? (
                  <span className="flex items-center text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-md"><FiAlertCircle className="mr-1" /> Failed</span>
                ) : (
                  <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">Pending</span>
                )}
              </div>

              {!isVerified && (
                <div className="mt-2">
                  {(rule.verificationMode === 'digilocker' || rule.documentType === 'aadhaar') && (
                    <div className="space-y-3">
                      <input type="text" id="aadhaarInput" placeholder="Enter 12-digit Aadhaar Number" maxLength="12" className="w-full text-sm border-gray-200 rounded-lg focus:ring-black px-3 py-2 border" />
                      {!vState.otpSent ? (
                        <button 
                          onClick={() => {
                            const val = document.getElementById('aadhaarInput').value;
                            if(val.length !== 12 || isNaN(val)) return toast.error('Enter valid 12-digit Aadhaar');
                            setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, otpSent: true } }));
                            toast.success('OTP sent to Aadhaar linked mobile number');
                          }}
                          className="w-full bg-[#185598] hover:bg-[#124275] text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                        >
                          Get OTP
                        </button>
                      ) : (
                        <>
                          <input type="text" id="aadhaarOtp" placeholder="Enter OTP" maxLength="6" className="w-full text-sm border-gray-200 rounded-lg focus:ring-black px-3 py-2 border mt-2" />
                          <button 
                            onClick={() => {
                               const otp = document.getElementById('aadhaarOtp').value;
                               if(otp.length < 4) return toast.error('Enter valid OTP');
                               handleVerifyAadhaar(document.getElementById('aadhaarInput').value);
                            }}
                            disabled={vState.status === 'verifying'}
                            className="w-full bg-black text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-800"
                          >
                            {vState.status === 'verifying' ? 'Verifying...' : 'Verify OTP & Aadhaar'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {rule.verificationMode === 'api' && rule.documentType === 'pan' && (
                    <div className="space-y-3">
                      <input type="text" id="panInput" placeholder="Enter PAN Number" className="w-full text-sm border-gray-200 rounded-lg focus:ring-black" />
                      <input type="text" id="panName" placeholder="Name as per PAN" className="w-full text-sm border-gray-200 rounded-lg focus:ring-black" />
                      <button 
                        onClick={() => handleVerifyPan(document.getElementById('panInput').value, document.getElementById('panName').value)}
                        disabled={vState.status === 'verifying'}
                        className="w-full bg-black text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-800"
                      >
                        {vState.status === 'verifying' ? 'Verifying...' : 'Verify PAN'}
                      </button>
                    </div>
                  )}

                  {rule.verificationMode === 'api' && rule.documentType === 'bank' && (
                    <div className="space-y-3">
                      <input type="text" id="bankAcc" placeholder="Account Number" className="w-full text-sm border-gray-200 rounded-lg focus:ring-black" />
                      <input type="text" id="bankIfsc" placeholder="IFSC Code" className="w-full text-sm border-gray-200 rounded-lg focus:ring-black" />
                      <input type="text" id="bankName" placeholder="Account Holder Name" className="w-full text-sm border-gray-200 rounded-lg focus:ring-black" />
                      <button 
                        onClick={() => handleVerifyBank(document.getElementById('bankAcc').value, document.getElementById('bankIfsc').value, document.getElementById('bankName').value)}
                        disabled={vState.status === 'verifying'}
                        className="w-full bg-black text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-800"
                      >
                        {vState.status === 'verifying' ? 'Verifying...' : 'Verify Bank Account'}
                      </button>
                    </div>
                  )}

                  {(rule.verificationMode === 'upload_only' || rule.verificationMode === 'ocr' || rule.verificationMode === 'manual') && (
                    <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 hover:bg-gray-50 transition-colors text-center">
                      <input type="file" accept={rule.allowedMimeTypes.join(',')} onChange={(e) => handleFileUpload(e, rule)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <FiUpload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-600">Click or drag file to upload</p>
                      <p className="text-xs text-gray-400 mt-1">Max size: {rule.maxFileSize / (1024 * 1024)}MB</p>
                      {activeUploads[rule.documentType] && <div className="mt-2 text-xs text-blue-600 font-bold">Uploading...</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default KYCVerificationStep;
