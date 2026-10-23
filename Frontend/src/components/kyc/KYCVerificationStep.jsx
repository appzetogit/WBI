import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef, useCallback } from 'react';
import { FiCheckCircle, FiAlertCircle, FiUpload, FiLoader, FiShield } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { kycService } from '../../services/kycService';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload';
import DocumentUploadCard from '../documents/DocumentUploadCard';
import DocumentPreviewModal from '../documents/DocumentPreviewModal';

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

const sanitizeVerificationMap = (map) => {
  if (!map || typeof map !== 'object') return {};
  const cleaned = {};
  Object.entries(map).forEach(([key, val]) => {
    if (val && typeof val === 'object') {
      cleaned[key] = {
        ...val,
        status: val.status === 'generating_otp' ? 'pending' : val.status
      };
    } else {
      cleaned[key] = val;
    }
  });
  return cleaned;
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
  const [editingDocs, setEditingDocs] = useState({}); // documentType -> force re-entry
  const [activeUploads, setActiveUploads] = useState({});
  const [uploadProgress, setUploadProgress] = useState({}); // { [documentType]: 0-100 }
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [aadhaarOtp, setAadhaarOtp] = useState('');
  const [preview, setPreview] = useState({ open: false, url: '', title: '' });
  const aadhaarSessionKey = entityId ? `kyc_aadhaar_${entityId}` : 'kyc_aadhaar_draft';
  const [videoStream, setVideoStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const hydratedRef = useRef(false);

  // Discrete action loading states — never corrupt document status with temporary in-flight actions
  const [digiLockerLoading, setDigiLockerLoading] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [panVerifying, setPanVerifying] = useState(false);
  const [bankVerifying, setBankVerifying] = useState(false);
  const [licenseVerifying, setLicenseVerifying] = useState(false);

  // Controlled inputs for inline API verification cards
  const [panInput, setPanInput] = useState('');
  const [panName, setPanName] = useState('');
  const [bankAcc, setBankAcc] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [dlDob, setDlDob] = useState('');

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
    
    setVerifications(p => ({ ...p, [rule.documentType]: { ...p[rule.documentType], status: 'verifying' } }));
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
             setVerifications(p => ({ ...p, [rule.documentType]: { status: 'verified', fileUrl, physicalUploaded: true } }));
          } else {
             setVerifications(p => ({ ...p, [rule.documentType]: { status: 'uploaded', fileUrl, physicalUploaded: true } }));
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
        setVerifications((p) => {
          const currentAadhaar = p.aadhaar || {};
          const safeStatus = currentAadhaar.status === 'verified'
            ? 'verified'
            : (currentAadhaar.status === 'generating_otp' ? 'pending' : (currentAadhaar.status || 'pending'));
          return {
            ...p,
            aadhaar: {
              ...currentAadhaar,
              otpSent: true,
              clientId: saved.clientId,
              status: safeStatus
            }
          };
        });
      }
    } catch {
      /* ignore */
    }
  }, [aadhaarSessionKey]);

  useEffect(() => {
    if (!initialVerifications || typeof initialVerifications !== 'object') return;
    setVerifications((prev) => {
      const cleanInit = sanitizeVerificationMap(initialVerifications);
      return { ...prev, ...cleanInit };
    });
  }, [initialVerifications]);

  // Hydrate from server KYC records — never wipe verified state on remount
  useEffect(() => {
    if (!entityId || !role) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await kycService.getStatus(role, entityId);
        if (!res.success || cancelled) return;
        const map = res.data || {};
        setVerifications((prev) => {
          const next = { ...prev };
          Object.entries(map).forEach(([docType, rec]) => {
            if (!rec) return;
            const existing = next[docType] || {};
            // Prefer already-verified local if newer interaction; else server
            if (existing.status === 'verified' && !rec.expired) {
              next[docType] = { ...rec, ...existing, status: 'verified', skipReverify: true };
            } else {
              const safeStatus = rec.status === 'generating_otp' ? 'pending' : (rec.status || existing.status || 'pending');
              const hasFile = Boolean(rec.fileUrl || existing.fileUrl);
              next[docType] = {
                ...existing,
                status: safeStatus,
                fileUrl: rec.fileUrl || existing.fileUrl,
                backFileUrl: rec.backFileUrl || existing.backFileUrl,
                frontUrl: rec.fileUrl || existing.frontUrl || existing.fileUrl,
                masked: rec.masked,
                verifiedAt: rec.verifiedAt,
                provider: rec.provider,
                physicalUploaded:
                  rec.physicalUploadStatus === 'uploaded' || hasFile || existing.physicalUploaded,
                skipReverify: !!rec.skipReverify && !rec.expired,
                expired: !!rec.expired,
                failureReason: rec.failureReason
              };
            }
          });
          return next;
        });
        hydratedRef.current = true;
      } catch {
        /* offline / no records yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityId, role]);

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
        setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'verified', data: res.data } }));
      }
    } catch (err) {
      toast.error(err.message || 'DigiLocker verification failed');
      setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'failed', error: err.message } }));
    }
  };

  const handleDigiLockerInitiate = async () => {
    if (!mobileNumber) {
      toast.error('Mobile number is required for DigiLocker');
      return;
    }
    setDigiLockerLoading(true);
    try {
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
      }
    } catch (err) {
      toast.error(err.message || 'Failed to initiate DigiLocker');
      setVerifications(p => ({
        ...p,
        aadhaar: {
          ...p.aadhaar,
          status: p.aadhaar?.status === 'verified' ? 'verified' : 'pending',
          error: err.message
        }
      }));
    } finally {
      setDigiLockerLoading(false);
    }
  };

  const handleGenerateAadhaarOtp = async (aadhaarNum) => {
    const cleaned = String(aadhaarNum || aadhaarNumber || '').replace(/\D/g, '');
    if (cleaned.length !== 12) {
      return toast.error('Valid 12-digit Aadhaar required');
    }
    setOtpSending(true);
    try {
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
      setVerifications(p => ({
        ...p,
        aadhaar: {
          ...p.aadhaar,
          status: p.aadhaar?.status === 'verified' ? 'verified' : 'pending',
          error: err.message,
          otpSent: false
        }
      }));
    } finally {
      setOtpSending(false);
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
    const otpClean = String(otp || aadhaarOtp || '').replace(/\D/g, '').trim();
    const aadhaarClean = String(aadhaarNum || aadhaarNumber || '').replace(/\D/g, '');
    if (otpClean.length < 4) return toast.error('Valid OTP is required');
    if (aadhaarClean.length !== 12) return toast.error('Valid 12-digit Aadhaar is required');

    setOtpVerifying(true);
    try {
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
        setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'verified', data: res.data } }));
      }
    } catch (err) {
      const msg = err?.message || 'Aadhaar verification failed';
      toast.error(msg);
      setVerifications(p => ({ ...p, aadhaar: { ...p.aadhaar, status: 'failed', error: msg } }));
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleVerifyPan = async (panNum, name) => {
    const panClean = String(panNum || panInput || '').trim().toUpperCase();
    const nameClean = String(name || panName || '').trim();
    if (!panClean || !nameClean) return toast.error('PAN and Name are required');

    setPanVerifying(true);
    try {
      const res = await kycService.verifyPan({ role, entityId, panNumber: panClean, name: nameClean });
      if (res.success) {
        toast.success('PAN verified successfully');
        setVerifications(p => ({ ...p, pan: { ...p.pan, status: 'verified', data: res.data } }));
      }
    } catch (err) {
      toast.error(err.message || 'PAN verification failed');
      setVerifications(p => ({ ...p, pan: { ...p.pan, status: 'failed', error: err.message } }));
    } finally {
      setPanVerifying(false);
    }
  };

  const handleVerifyBank = async (accountNumber, ifsc, name) => {
    const accClean = String(accountNumber || bankAcc || '').trim();
    const ifscClean = String(ifsc || bankIfsc || '').trim().toUpperCase();
    const nameClean = String(name || bankName || '').trim();
    if (!accClean || !ifscClean) return toast.error('Account and IFSC are required');

    setBankVerifying(true);
    try {
      const res = await kycService.verifyBank({ role, entityId, accountNumber: accClean, ifsc: ifscClean, name: nameClean });
      if (res.success) {
        toast.success('Bank verified successfully');
        setVerifications(p => ({ ...p, bank: { ...p.bank, status: 'verified', data: res.data } }));
      }
    } catch (err) {
      toast.error(err.message || 'Bank verification failed');
      setVerifications(p => ({ ...p, bank: { ...p.bank, status: 'failed', error: err.message } }));
    } finally {
      setBankVerifying(false);
    }
  };

  const handleVerifyLicense = async (dlNum, dob) => {
    const dlClean = String(dlNum || dlNumber || '').trim().toUpperCase();
    const dobClean = String(dob || dlDob || '').trim();
    if (!dlClean || !dobClean) return toast.error('License Number and DOB are required');

    setLicenseVerifying(true);
    try {
      const res = await kycService.verifyLicense({ role, entityId, dlNumber: dlClean, dob: dobClean });
      if (res.success) {
        toast.success('License verified successfully');
        setVerifications(p => ({ ...p, license: { ...p.license, status: 'verified', data: res.data } }));
      }
    } catch (err) {
      toast.error(err.message || 'License verification failed');
      setVerifications(p => ({ ...p, license: { ...p.license, status: 'failed', error: err.message } }));
    } finally {
      setLicenseVerifying(false);
    }
  };

  const uploadProgressKey = (documentType, side = 'single') =>
    side === 'single' ? documentType : `${documentType}:${side}`;

  const isCgpeComplete = (rule, vState = {}) => {
    if (vState.skipReverify && vState.status === 'verified' && !vState.expired) return true;
    const status = vState.status;
    if (
      rule.verificationMode === 'upload_only' ||
      rule.verificationMode === 'ocr' ||
      rule.verificationMode === 'manual'
    ) {
      return (
        status === 'uploaded' ||
        status === 'verified' ||
        Boolean(vState.fileUrl || vState.frontUrl || vState.physicalUploaded)
      );
    }
    return status === 'verified';
  };

  const isPhysicalComplete = (rule, vState = {}) => {
    if (
      !rule.requirePhysicalUpload &&
      rule.verificationMode !== 'upload_only' &&
      rule.verificationMode !== 'ocr' &&
      rule.verificationMode !== 'manual'
    ) {
      return true;
    }
    // Server-verified + skip: physical already accepted (file may be on record)
    if (vState.skipReverify && vState.status === 'verified' && !vState.expired) {
      return true;
    }
    if (rule.requiresFrontAndBack) {
      return Boolean((vState.frontUrl || vState.fileUrl) && vState.backUrl);
    }
    return Boolean(vState.fileUrl || vState.frontUrl || vState.physicalUploaded);
  };

  const isRuleComplete = (rule, vState = {}) => {
    if (vState.skipReverify && vState.status === 'verified' && !vState.expired) return true;
    if (vState.status === 'verified') return true;

    const physicalDone = isPhysicalComplete(rule, vState);
    const cgpeDone = isCgpeComplete(rule, vState);

    // upload_only / manual / ocr completes when physical file is uploaded
    if (
      rule.verificationMode === 'upload_only' ||
      rule.verificationMode === 'ocr' ||
      rule.verificationMode === 'manual'
    ) {
      return physicalDone;
    }

    // For digilocker / api verification:
    // If online verified (and physical if required is also done) -> complete!
    if (cgpeDone && (!rule.requirePhysicalUpload || physicalDone)) return true;
    // Or if physical document (e.g. front and back) is uploaded for admin review -> complete!
    if (physicalDone) return true;

    return false;
  };

  const handlePhysicalUpload = async (file, rule, side = 'single') => {
    if (!file) return;
    const maxSize = rule.maxFileSize || 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return toast.error(`File size must be less than ${maxSize / (1024 * 1024)}MB`);
    }

    const key = uploadProgressKey(rule.documentType, side);
    setActiveUploads((p) => ({ ...p, [key]: true }));
    try {
      let fileToUpload = file;
      if (file.type.startsWith('image/')) {
        try {
          fileToUpload = await compressImage(file);
        } catch {
          fileToUpload = file;
        }
      }

      const fileUrl = await uploadToCloudinary(fileToUpload, 'kyc_documents', (pct) => {
        setUploadProgress((p) => ({ ...p, [key]: pct }));
      });

      // Prefer Cloudinary public_id from delivery URL (not original filename)
      let cloudinaryPublicId = fileUrl;
      try {
        const m = String(fileUrl).match(/\/upload\/(?:.*\/)?v\d+\/(.+)\.[a-zA-Z0-9]+(?:\?|$)/);
        if (m?.[1]) cloudinaryPublicId = m[1];
      } catch {
        cloudinaryPublicId = fileUrl;
      }

      const res = await kycService.uploadDocument({
        role,
        entityId,
        documentType: rule.documentType,
        fileUrl,
        fileKey: cloudinaryPublicId,
        side,
        mimeType: fileToUpload.type || file.type,
        fileSize: fileToUpload.size || file.size
      });

      if (res.success) {
        toast.success(`${rule.label}${side !== 'single' ? ` (${side})` : ''} uploaded`);
        setVerifications((p) => {
          const prev = p[rule.documentType] || {};
          const next = { ...prev };
          if (side === 'front') next.frontUrl = fileUrl;
          else if (side === 'back') next.backUrl = fileUrl;
          else {
            next.fileUrl = fileUrl;
            next.frontUrl = next.frontUrl || fileUrl;
          }

          // upload_only rules: mark uploaded; CGPE rules keep verified status if already verified
          if (
            rule.verificationMode === 'upload_only' ||
            rule.verificationMode === 'ocr' ||
            rule.verificationMode === 'manual'
          ) {
            next.status = 'uploaded';
          } else if (!next.status || next.status === 'failed') {
            next.status = prev.status || 'pending';
          }
          next.physicalUploaded = true;
          return { ...p, [rule.documentType]: next };
        });
      }
    } catch (err) {
      toast.error(err.message || 'File upload failed');
    } finally {
      setActiveUploads((p) => ({ ...p, [key]: false }));
      setUploadProgress((p) => ({ ...p, [key]: 0 }));
    }
  };

  const handleFileUpload = async (e, rule) => {
    const file = e.target.files?.[0];
    if (e?.target) e.target.value = '';
    await handlePhysicalUpload(file, rule, 'single');
  };

  useImperativeHandle(ref, () => ({
    validate: () => {
      for (const rule of rules) {
        if (!rule.required) continue;
        const vState = verifications[rule.documentType] || {};
        if (!isRuleComplete(rule, vState)) {
          if (rule.requiresFrontAndBack && !(vState.frontUrl && vState.backUrl)) {
            toast.error(`Please upload front and back images for ${rule.label}`);
          } else if (rule.requirePhysicalUpload || rule.verificationMode === 'upload_only') {
            toast.error(`Please upload document or complete verification for ${rule.label}`);
          } else {
            toast.error(`Please complete verification for ${rule.label}`);
          }
          return false;
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
          const cgpeDone = isCgpeComplete(rule, vState);
          const physicalDone = isPhysicalComplete(rule, vState);
          const isComplete = isRuleComplete(rule, vState);
          const isFailed = vState.status === 'failed';
          const forceEdit = !!editingDocs[rule.documentType];
          const lockedVerified =
            !forceEdit &&
            (vState.status === 'verified' || vState.skipReverify) &&
            !vState.expired;
          const needsPhysical =
            rule.requirePhysicalUpload ||
            rule.verificationMode === 'upload_only' ||
            rule.verificationMode === 'ocr' ||
            rule.verificationMode === 'manual';
          
          // Physical uploader is available for any document that needs physical upload
          const showPhysicalUploader = !lockedVerified && needsPhysical;

          return (
            <div key={rule.documentType} className={`p-4 border rounded-xl transition-all ${isComplete || lockedVerified ? 'border-green-200 bg-green-50/30' : isFailed ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-white'}`}>
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-800 text-sm">{rule.label} {rule.required && <span className="text-red-500">*</span>}</h4>
                <div className="flex flex-wrap items-center gap-1.5 justify-end">
                  {lockedVerified || (vState.status === 'verified') ? (
                    <span className="flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">
                      <FiCheckCircle className="mr-1" /> Verified
                    </span>
                  ) : null}
                  {needsPhysical && physicalDone && (
                    <span className="flex items-center text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-md">
                      <FiCheckCircle className="mr-1" /> File Uploaded
                    </span>
                  )}
                  {vState.status === 'rejected' ? (
                    <span className="flex items-center text-[10px] font-bold text-red-700 bg-red-100 px-2 py-1 rounded-md">
                      Rejected
                    </span>
                  ) : isFailed ? (
                    <span className="flex items-center text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-md">
                      <FiAlertCircle className="mr-1" /> Failed
                    </span>
                  ) : isComplete || lockedVerified ? (
                    <span className="flex items-center text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-md">
                      <FiCheckCircle className="mr-1" /> Complete
                    </span>
                  ) : (
                    <>
                      {needsPhysical && !physicalDone && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md">
                          Upload pending
                        </span>
                      )}
                      <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                        Pending
                      </span>
                    </>
                  )}
                </div>
              </div>

              {lockedVerified && (
                <div className="mt-1 mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-emerald-800">
                    {vState.masked ? `Saved: ${vState.masked}` : 'Already verified — no need to verify again.'}
                    {vState.fileUrl ? ' Document on file.' : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditingDocs((p) => ({ ...p, [rule.documentType]: true }))}
                    className="text-[11px] font-bold text-teal-700 hover:underline shrink-0"
                  >
                    Update document
                  </button>
                </div>
              )}

              {!lockedVerified && !cgpeDone && (
                <div className="mt-2">
                  {(rule.verificationMode === 'digilocker' || rule.documentType === 'aadhaar') && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={handleDigiLockerInitiate}
                        disabled={digiLockerLoading || otpSending || otpVerifying}
                        className="w-full bg-[#185598] hover:bg-[#124275] text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {digiLockerLoading ? (
                          <>
                            <FiLoader className="w-4 h-4 animate-spin" /> Opening DigiLocker...
                          </>
                        ) : (
                          'Verify Aadhaar via DigiLocker'
                        )}
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
                          disabled={otpSending || digiLockerLoading || !aadhaarNumber || aadhaarNumber.length !== 12}
                          className="w-full bg-gray-900 hover:bg-black text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {otpSending ? (
                            <>
                              <FiLoader className="w-4 h-4 animate-spin" /> Sending OTP...
                            </>
                          ) : (
                            'Get OTP'
                          )}
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
                            disabled={otpVerifying || !aadhaarOtp || aadhaarOtp.length < 4}
                            className="w-full bg-black text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-800 flex items-center justify-center gap-2 disabled:opacity-60"
                          >
                            {otpVerifying ? (
                              <>
                                <FiLoader className="w-4 h-4 animate-spin" /> Verifying...
                              </>
                            ) : (
                              'Verify OTP & Aadhaar'
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {rule.verificationMode === 'api' && rule.documentType === 'pan' && (
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Enter PAN Number"
                        maxLength="10"
                        value={panInput}
                        onChange={(e) => setPanInput(e.target.value.toUpperCase().slice(0, 10))}
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-black px-3 py-2 border uppercase"
                      />
                      <input
                        type="text"
                        placeholder="Name as per PAN"
                        value={panName}
                        onChange={(e) => setPanName(e.target.value)}
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-black px-3 py-2 border"
                      />
                      <button
                        type="button"
                        onClick={() => handleVerifyPan(panInput, panName)}
                        disabled={panVerifying || !panInput || !panName}
                        className="w-full bg-black text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-800 flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {panVerifying ? (
                          <>
                            <FiLoader className="w-4 h-4 animate-spin" /> Verifying...
                          </>
                        ) : (
                          'Verify PAN'
                        )}
                      </button>
                    </div>
                  )}

                  {rule.verificationMode === 'api' && rule.documentType === 'bank' && (
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Account Number"
                        value={bankAcc}
                        onChange={(e) => setBankAcc(e.target.value.replace(/\D/g, ''))}
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-black px-3 py-2 border"
                      />
                      <input
                        type="text"
                        placeholder="IFSC Code"
                        maxLength="11"
                        value={bankIfsc}
                        onChange={(e) => setBankIfsc(e.target.value.toUpperCase().slice(0, 11))}
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-black px-3 py-2 border uppercase"
                      />
                      <input
                        type="text"
                        placeholder="Account Holder Name"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-black px-3 py-2 border"
                      />
                      <button
                        type="button"
                        onClick={() => handleVerifyBank(bankAcc, bankIfsc, bankName)}
                        disabled={bankVerifying || !bankAcc || !bankIfsc}
                        className="w-full bg-black text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-800 flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {bankVerifying ? (
                          <>
                            <FiLoader className="w-4 h-4 animate-spin" /> Verifying...
                          </>
                        ) : (
                          'Verify Bank Account'
                        )}
                      </button>
                    </div>
                  )}

                  {rule.verificationMode === 'api' && rule.documentType === 'license' && (
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Driving License Number"
                        value={dlNumber}
                        onChange={(e) => setDlNumber(e.target.value.toUpperCase())}
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-black px-3 py-2 border uppercase"
                      />
                      <input
                        type="date"
                        placeholder="Date of Birth"
                        value={dlDob}
                        onChange={(e) => setDlDob(e.target.value)}
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-black px-3 py-2 border"
                      />
                      <button
                        type="button"
                        onClick={() => handleVerifyLicense(dlNumber, dlDob)}
                        disabled={licenseVerifying || !dlNumber || !dlDob}
                        className="w-full bg-black text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-800 flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {licenseVerifying ? (
                          <>
                            <FiLoader className="w-4 h-4 animate-spin" /> Verifying...
                          </>
                        ) : (
                          'Verify License'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {showPhysicalUploader && (
                <div className={`mt-3 space-y-2 ${cgpeDone || rule.verificationMode === 'digilocker' || rule.verificationMode === 'api' ? 'border-t border-gray-100 pt-3' : ''}`}>
                  {cgpeDone && rule.requirePhysicalUpload && rule.verificationMode !== 'upload_only' ? (
                    <p className="text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded-lg">
                      ✓ Online verification completed. You can also upload a clear photo/scan of the physical document for admin records.
                    </p>
                  ) : !cgpeDone && (rule.verificationMode === 'digilocker' || rule.verificationMode === 'api') ? (
                    <p className="text-[11px] text-gray-500">
                      Upload clear photo/scan of document (front & back) or complete online verification above.
                    </p>
                  ) : null}
                  {rule.requiresFrontAndBack ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <DocumentUploadCard
                        label={`${rule.label} — Front`}
                        required={rule.required}
                        accept={(rule.allowedMimeTypes || []).join(',') || undefined}
                        maxSizeBytes={rule.maxFileSize}
                        fileUrl={vState.frontUrl || ''}
                        uploading={!!activeUploads[uploadProgressKey(rule.documentType, 'front')]}
                        progress={uploadProgress[uploadProgressKey(rule.documentType, 'front')] || 0}
                        onSelect={(file) => handlePhysicalUpload(file, rule, 'front')}
                        onPreview={(url) => setPreview({ open: true, url, title: `${rule.label} Front` })}
                      />
                      <DocumentUploadCard
                        label={`${rule.label} — Back`}
                        required={rule.required}
                        accept={(rule.allowedMimeTypes || []).join(',') || undefined}
                        maxSizeBytes={rule.maxFileSize}
                        fileUrl={vState.backUrl || ''}
                        uploading={!!activeUploads[uploadProgressKey(rule.documentType, 'back')]}
                        progress={uploadProgress[uploadProgressKey(rule.documentType, 'back')] || 0}
                        onSelect={(file) => handlePhysicalUpload(file, rule, 'back')}
                        onPreview={(url) => setPreview({ open: true, url, title: `${rule.label} Back` })}
                      />
                    </div>
                  ) : (
                    <DocumentUploadCard
                      label={rule.label}
                      required={rule.required}
                      accept={(rule.allowedMimeTypes || []).join(',') || undefined}
                      maxSizeBytes={rule.maxFileSize}
                      fileUrl={vState.fileUrl || vState.frontUrl || ''}
                      uploading={!!activeUploads[uploadProgressKey(rule.documentType, 'single')] || !!activeUploads[rule.documentType]}
                      progress={uploadProgress[uploadProgressKey(rule.documentType, 'single')] || uploadProgress[rule.documentType] || 0}
                      onSelect={(file) => handlePhysicalUpload(file, rule, 'single')}
                      onPreview={(url) => setPreview({ open: true, url, title: rule.label })}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DocumentPreviewModal
        open={preview.open}
        url={preview.url}
        title={preview.title}
        onClose={() => setPreview({ open: false, url: '', title: '' })}
      />
    </div>
  );
});

export default KYCVerificationStep;
