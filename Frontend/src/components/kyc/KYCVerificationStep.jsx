import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef, useCallback } from 'react';
import { FiCheckCircle, FiAlertCircle, FiUpload, FiLoader, FiShield } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { kycService } from '../../services/kycService';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload';

/**
 * Compress an image File/Blob to max 1200px width/height at 80% JPEG quality.
 * Returns a compressed Blob.
 */
const compressImage = (file, { maxWidth = 1200, maxHeight = 1200, quality = 0.8 } = {}) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      // Scale down proportionally
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        else reject(new Error('Compression failed'));
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
};

const KYCVerificationStep = forwardRef(({
  role,
  mobileNumber,
  entityId,
  draftId,
  redirectUrl,
  onComplete,
  onBeforeDigiLockerInitiate,
  rulesOverride = null,
  initialVerifications = null
}, ref) => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifications, setVerifications] = useState({});
  const [activeUploads, setActiveUploads] = useState({});
  const [uploadProgress, setUploadProgress] = useState({}); // { [documentType]: 0-100 }
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [aadhaarOtp, setAadhaarOtp] = useState('');
  const aadhaarSessionKey = entityId ? `kyc_aadhaar_${entityId}` : 'kyc_aadhaar_draft';
  const [videoStream, setVideoStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
  }, [videoStream]);

  // Stop camera when component unmounts
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Bind stream to video element when it mounts
  useEffect(() => {
    if (videoStream && videoRef.current) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setVideoStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast.error('Camera access denied or unavailable');
    }
  };

  const captureAndVerifySelfie = useCallback(async (rule) => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    setVerifications(p => ({ ...p, [rule.documentType]: { status: 'verifying' } }));
    stopCamera();

    canvas.toBlob(async (blob) => {
      try {
        // Compress the captured selfie before uploading
        const selfieFile = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
        const compressed = await compressImage(selfieFile, { maxWidth: 800, maxHeight: 800, quality: 0.75 });

        // 1. Upload directly to Cloudinary (not as base64)
        const fileUrl = await uploadToCloudinary(compressed, 'kyc_selfies');

        // 2. Save the Cloudinary URL to backend
        const uploadRes = await kycService.uploadDocument({ 
          role, entityId, documentType: rule.documentType, fileUrl, fileKey: 'selfie-capture' 
        });

        if (uploadRes.success) {
          // 3. Call Face Match API
          const matchRes = await kycService.verifySelfieMatch({ role, entityId });
          if (matchRes.success) {
             toast.success('Selfie verified successfully against ID document!');
             setVerifications(p => ({ ...p, [rule.documentType]: { status: 'verified', fileUrl } }));
          }
        }
      } catch (err) {
        toast.error(err.message || 'Selfie verification failed');
        setVerifications(p => ({ ...p, [rule.documentType]: { status: 'failed', error: err.message } }));
      }
    }, 'image/jpeg');
  }, [role, entityId, stopCamera]);

  useEffect(() => {
    if (Array.isArray(rulesOverride) && rulesOverride.length > 0) {
      setRules(rulesOverride);
      setLoading(false);
    } else {
      loadRules();
    }
    
    // Check if returning from DigiLocker OAuth (CGPE docs: code + state + codeVerifier)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const codeVerifier = urlParams.get('codeVerifier') || urlParams.get('code_verifier');
    const recordId =
      urlParams.get('recordId') ||
      sessionStorage.getItem('digilockerRecordId') ||
      null;
    if (recordId && (code || urlParams.get('recordId'))) {
      handleDigiLockerComplete({
        recordId,
        transactionId: recordId,
        code,
        state,
        codeVerifier,
        role,
        entityId
      });
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  }, [role, rulesOverride]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(aadhaarSessionKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.aadhaarNumber) setAadhaarNumber(String(saved.aadhaarNumber));
      if (saved.clientId) {
        setVerifications((p) => ({
          ...p,
          aadhaar: {
            ...p.aadhaar,
            otpSent: true,
            clientId: saved.clientId,
            status: p.aadhaar?.status === 'verified' ? 'verified' : 'pending'
          }
        }));
      }
    } catch {
      /* ignore */
    }
  }, [aadhaarSessionKey]);

  useEffect(() => {
    if (!initialVerifications || typeof initialVerifications !== 'object') return;
    setVerifications((prev) => ({ ...initialVerifications, ...prev }));
  }, [initialVerifications]);

  useEffect(() => {
    if (typeof onComplete === 'function') {
      onComplete(verifications);
    }
  }, [verifications, onComplete]);

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

  const handleDigiLockerComplete = async (payload) => {
    try {
      setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'verifying' } }));
      const res = await kycService.completeDigiLocker(payload);
      if (res.success) {
        toast.success('DigiLocker verification complete!');
        sessionStorage.removeItem('digilockerRecordId');
        setVerifications(p => ({ ...p, aadhaar: { status: 'verified', data: res.data } }));
      }
    } catch (err) {
      toast.error(err.message || 'DigiLocker verification failed');
      setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'failed', error: err.message } }));
    }
  };

  const handleDigiLockerInitiate = async () => {
    try {
      if (!mobileNumber) {
        toast.error('Mobile number is required for DigiLocker');
        return;
      }
      setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'generating_otp' } }));
      if (onBeforeDigiLockerInitiate) {
        await onBeforeDigiLockerInitiate();
      }
      const finalRedirectUrl = redirectUrl || window.location.href;
      const res = await kycService.initiateDigiLocker({
        role,
        mobileNumber,
        redirectUrl: finalRedirectUrl,
        entityId,
        draftId
      });
      const authUrl = res.data?.authorizationUrl || res.data?.authUrl;
      const recordId = res.data?.recordId || res.data?.transactionId;
      if (res.success && authUrl) {
        if (recordId) sessionStorage.setItem('digilockerRecordId', recordId);
        window.location.href = authUrl;
      } else {
        toast.error('Failed to start DigiLocker — no auth URL');
        setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'failed' } }));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to initiate DigiLocker');
      setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'failed', error: err.message } }));
    }
  };

  const handleGenerateAadhaarOtp = async (aadhaarNumber) => {
    const cleaned = String(aadhaarNumber || '').replace(/\D/g, '');
    if (cleaned.length !== 12) {
      return toast.error('Valid 12-digit Aadhaar required');
    }
    try {
      setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'generating_otp' } }));
      const res = await kycService.generateAadhaarOtp({ role, entityId, aadhaarNumber: cleaned });
      if (res.success) {
        toast.success(res.data?.message || 'OTP sent to Aadhaar linked mobile number');
        const clientId = res.data.clientId;
        sessionStorage.setItem(
          aadhaarSessionKey,
          JSON.stringify({ clientId, aadhaarNumber: cleaned, flow: res.data.flow || 'doc' })
        );
        setAadhaarNumber(cleaned);
        setVerifications(p => ({ 
          ...p, 
          aadhaar: { ...p.aadhaar, status: 'pending', otpSent: true, clientId } 
        }));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to generate Aadhaar OTP');
      setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'failed', error: err.message, otpSent: false } }));
    }
  };

  const handleVerifyAadhaar = async (clientId, otp, aadhaarNum) => {
    let resolvedClientId = clientId;
    if (!resolvedClientId) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(aadhaarSessionKey) || '{}');
        resolvedClientId = saved.clientId;
      } catch (_) { /* ignore */ }
    }
    if (!resolvedClientId) return toast.error('Session expired. Please tap Get OTP again.');
    const otpClean = String(otp || '').replace(/\D/g, '').trim();
    const aadhaarClean = String(aadhaarNum || '').replace(/\D/g, '');
    if (otpClean.length < 4) return toast.error('Valid OTP is required');
    if (aadhaarClean.length !== 12) return toast.error('Valid 12-digit Aadhaar is required');
    try {
      setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'verifying' } }));
      const res = await kycService.verifyAadhaar({
        role,
        entityId,
        clientId: resolvedClientId,
        otp: otpClean,
        aadhaarNumber: aadhaarClean
      });
      if (res.success) {
        toast.success('Aadhaar verified successfully');
        sessionStorage.removeItem(aadhaarSessionKey);
        setAadhaarOtp('');
        setVerifications(p => ({ ...p, aadhaar: { status: 'verified', data: res.data } }));
      }
    } catch (err) {
      const msg = err?.message || 'Aadhaar verification failed';
      toast.error(msg);
      setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'failed', error: msg } }));
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

  const handleVerifyLicense = async (dlNumber, dob) => {
    if (!dlNumber || !dob) return toast.error('License Number and DOB are required');
    try {
      setVerifications(p => ({ ...p, license: { status: 'verifying' } }));
      const res = await kycService.verifyLicense({ role, entityId, dlNumber, dob });
      if (res.success) {
        toast.success('License verified successfully');
        setVerifications(p => ({ ...p, license: { status: 'verified', data: res.data } }));
      }
    } catch (err) {
      toast.error(err.message || 'License verification failed');
      setVerifications(p => ({ ...p, license: { status: 'failed', error: err.message } }));
    }
  };

  const handleFileUpload = async (e, rule) => {
    const file = e.target.files[0];
    if (!file) return;

    const maxSize = rule.maxFileSize || 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return toast.error(`File size must be less than ${maxSize / (1024 * 1024)}MB`);
    }

    setActiveUploads(p => ({ ...p, [rule.documentType]: true }));
    try {
      let fileToUpload = file;

      // Compress images before upload to reduce upload size & time
      if (file.type.startsWith('image/')) {
        try {
          fileToUpload = await compressImage(file);
        } catch {
          // If compression fails, fall back to original file
          fileToUpload = file;
        }
      }

      // Upload directly to Cloudinary (binary, not base64)
      const fileUrl = await uploadToCloudinary(fileToUpload, 'kyc_documents', (pct) => {
        setUploadProgress(p => ({ ...p, [rule.documentType]: pct }));
      });

      // Save the Cloudinary URL to backend (small JSON payload, not the file bytes)
      const res = await kycService.uploadDocument({ 
        role, entityId, documentType: rule.documentType, fileUrl, fileKey: fileToUpload.name
      });

      if (res.success) {
        toast.success(`${rule.label} uploaded successfully`);
        setVerifications(p => ({ ...p, [rule.documentType]: { status: 'uploaded', fileUrl } }));
      }
    } catch (err) {
      toast.error(err.message || 'File upload failed');
    } finally {
      setActiveUploads(p => ({ ...p, [rule.documentType]: false }));
      setUploadProgress(p => ({ ...p, [rule.documentType]: 0 }));
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
                      {/* DigiLocker is the CGPE-supported Aadhaar path (OTP routes return 404 on verify.cgpey.com) */}
                      <button
                        type="button"
                        onClick={handleDigiLockerInitiate}
                        disabled={vState.status === 'generating_otp' || vState.status === 'verifying'}
                        className="w-full bg-[#185598] hover:bg-[#124275] text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                      >
                        {vState.status === 'generating_otp' || vState.status === 'verifying'
                          ? 'Opening DigiLocker...'
                          : 'Verify Aadhaar via DigiLocker'}
                      </button>
                      <p className="text-[11px] text-gray-500 text-center">
                        Secure UIDAI DigiLocker consent — recommended
                      </p>
                      <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
                        <div className="relative flex justify-center"><span className="bg-white px-2 text-[10px] text-gray-400 uppercase">or OTP</span></div>
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter 12-digit Aadhaar Number"
                        maxLength="12"
                        value={aadhaarNumber}
                        onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, '').slice(0, 12))}
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-black px-3 py-2 border"
                      />
                      {!vState.otpSent ? (
                        <button 
                          type="button"
                          onClick={() => handleGenerateAadhaarOtp(aadhaarNumber)}
                          disabled={vState.status === 'generating_otp'}
                          className="w-full bg-gray-900 hover:bg-black text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                        >
                          {vState.status === 'generating_otp' ? 'Sending OTP...' : 'Get OTP'}
                        </button>
                      ) : (
                        <>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Enter OTP"
                            maxLength="6"
                            value={aadhaarOtp}
                            onChange={(e) => setAadhaarOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full text-sm border-gray-200 rounded-lg focus:ring-black px-3 py-2 border mt-2"
                          />
                          <button 
                            type="button"
                            onClick={() => handleVerifyAadhaar(vState.clientId, aadhaarOtp, aadhaarNumber)}
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

                  {rule.verificationMode === 'api' && rule.documentType === 'license' && (
                    <div className="space-y-3">
                      <input type="text" id="dlNumber" placeholder="Driving License Number" className="w-full text-sm border-gray-200 rounded-lg focus:ring-black uppercase" />
                      <input type="date" id="dlDob" placeholder="Date of Birth" className="w-full text-sm border-gray-200 rounded-lg focus:ring-black" />
                      <button 
                        onClick={() => handleVerifyLicense(document.getElementById('dlNumber').value, document.getElementById('dlDob').value)}
                        disabled={vState.status === 'verifying'}
                        className="w-full bg-black text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-800"
                      >
                        {vState.status === 'verifying' ? 'Verifying...' : 'Verify License'}
                      </button>
                    </div>
                  )}

                  {(rule.verificationMode === 'upload_only' || rule.verificationMode === 'ocr' || rule.verificationMode === 'manual') && (
                    <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 hover:bg-gray-50 transition-colors text-center">
                      <input type="file" accept={rule.allowedMimeTypes ? rule.allowedMimeTypes.join(',') : 'image/*'} onChange={(e) => handleFileUpload(e, rule)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={!!activeUploads[rule.documentType]} />
                      {activeUploads[rule.documentType] ? (
                        <>
                          <FiLoader className="w-6 h-6 text-blue-500 mx-auto mb-2 animate-spin" />
                          <p className="text-sm font-semibold text-blue-600">Uploading... {uploadProgress[rule.documentType] || 0}%</p>
                          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress[rule.documentType] || 0}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <FiUpload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm font-medium text-gray-600">Click or drag file to upload</p>
                          <p className="text-xs text-gray-400 mt-1">Max size: {(rule.maxFileSize || (5 * 1024 * 1024)) / (1024 * 1024)}MB</p>
                        </>
                      )}
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
