import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FiArrowLeft,
  FiBriefcase,
  FiClock,
  FiMapPin,
  FiPhone,
  FiNavigation,
  FiCheckCircle,
  FiCamera,
  FiShield,
  FiDollarSign,
  FiAlertTriangle,
  FiUserCheck,
  FiRefreshCw,
  FiSend,
  FiXCircle,
  FiCheckSquare,
  FiSquare,
  FiFileText,
  FiLock,
  FiHelpCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import engineerService from '../../../../services/engineerService';
import { compressImageToBase64 } from '../../../../utils/imageCompression';
import { getUserFacingError } from '../../../../utils/userFacingError';
import LogoLoader from '../../../../components/common/LogoLoader';

const DEFAULT_CHECKLISTS = {
  Electrical: [
    { itemId: 'el_1', label: 'Main power panel & circuit breaker inspected' },
    { itemId: 'el_2', label: 'Wiring & earthing integrity checked' },
    { itemId: 'el_3', label: 'Electrical load & voltage tested' },
    { itemId: 'el_4', label: 'Fault identified and repaired' },
    { itemId: 'el_5', label: 'Safety insulation & final test completed' }
  ],
  AC: [
    { itemId: 'ac_1', label: 'Indoor & outdoor unit physical inspection' },
    { itemId: 'ac_2', label: 'Air filter cleaned & coil checked' },
    { itemId: 'ac_3', label: 'Gas pressure & cooling temperature measured' },
    { itemId: 'ac_4', label: 'Drainage pipe cleared & leak tested' },
    { itemId: 'ac_5', label: 'Final operational test completed' }
  ],
  Generic: [
    { itemId: 'gn_1', label: 'Initial site inspection & safety check' },
    { itemId: 'gn_2', label: 'Reported issue diagnosed' },
    { itemId: 'gn_3', label: 'Service / repair execution completed' },
    { itemId: 'gn_4', label: 'Work area cleaned and restored' },
    { itemId: 'gn_5', label: 'Final quality & functional verification' }
  ]
};

const REJECTION_REASONS = [
  'Unable to reach location',
  'Schedule conflict',
  'Wrong service / skill gap',
  'Outside service area',
  'Other'
];

const B2BJobDetail = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [otp, setOtp] = useState('');
  const [beforePhotoUrl, setBeforePhotoUrl] = useState('');
  const [afterPhotoUrl, setAfterPhotoUrl] = useState('');
  const [workNotes, setWorkNotes] = useState('');
  const [partsReplaced, setPartsReplaced] = useState('');
  const [checklist, setChecklist] = useState([]);
  const [customerSignoffMethod, setCustomerSignoffMethod] = useState('verbal');
  const [customerSignature, setCustomerSignature] = useState('');

  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState(REJECTION_REASONS[0]);
  const [rejectionRemarks, setRejectionRemarks] = useState('');

  const [unavailableModalOpen, setUnavailableModalOpen] = useState(false);
  const [unavailableRemarks, setUnavailableRemarks] = useState('');

  const [resendCooldown, setResendCooldown] = useState(0);

  // Fetch B2B Job Detail
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['engineerB2BJobDetail', jobId],
    queryFn: () => engineerService.getB2BJobById(jobId),
    staleTime: 1000 * 10,
    refetchOnWindowFocus: true
  });

  const job = data?.job;

  // Initialize Checklist based on Service type
  useEffect(() => {
    if (job) {
      if (job.checklist && job.checklist.length > 0) {
        setChecklist(job.checklist);
      } else {
        const serviceCategory = job.service || 'Generic';
        const templateKey = Object.keys(DEFAULT_CHECKLISTS).find((k) =>
          serviceCategory.toLowerCase().includes(k.toLowerCase())
        ) || 'Generic';
        const defaultItems = DEFAULT_CHECKLISTS[templateKey].map((item) => ({
          ...item,
          checked: false,
          checkedAt: null
        }));
        setChecklist(defaultItems);
      }

      if (job.beforePhotos?.length > 0) setBeforePhotoUrl(job.beforePhotos[0]);
      if (job.afterPhotos?.length > 0) setAfterPhotoUrl(job.afterPhotos[0]);
      if (job.workNotes) setWorkNotes(job.workNotes);
      if (job.partsReplaced) setPartsReplaced(job.partsReplaced);

      // LocalStorage Backup Recovery
      const localKey = `b2b_draft_${jobId}`;
      const savedDraft = localStorage.getItem(localKey);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed.workNotes && !job.workNotes) setWorkNotes(parsed.workNotes);
          if (parsed.partsReplaced && !job.partsReplaced) setPartsReplaced(parsed.partsReplaced);
          if (parsed.beforePhotoUrl && !job.beforePhotos?.length) setBeforePhotoUrl(parsed.beforePhotoUrl);
          if (parsed.afterPhotoUrl && !job.afterPhotos?.length) setAfterPhotoUrl(parsed.afterPhotoUrl);
        } catch (e) {
          /* ignore draft parse error */
        }
      }
    }
  }, [job, jobId]);

  // LocalStorage Auto-Save
  useEffect(() => {
    if (jobId && (workNotes || partsReplaced || beforePhotoUrl || afterPhotoUrl)) {
      localStorage.setItem(
        `b2b_draft_${jobId}`,
        JSON.stringify({ workNotes, partsReplaced, beforePhotoUrl, afterPhotoUrl })
      );
    }
  }, [jobId, workNotes, partsReplaced, beforePhotoUrl, afterPhotoUrl]);

  // Resend OTP Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [resendCooldown]);

  // Handle Photo Pick
  const handlePhotoPick = async (e, kind) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToBase64(file);
      if (kind === 'before') setBeforePhotoUrl(dataUrl);
      else setAfterPhotoUrl(dataUrl);
      toast.success(`${kind === 'before' ? 'Before' : 'After'} photo ready ✓`);
    } catch (err) {
      toast.error(getUserFacingError(err, 'Could not process photo'));
    } finally {
      e.target.value = '';
    }
  };

  // Toggle Checklist item
  const toggleChecklistItem = (itemId) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.itemId === itemId
          ? { ...item, checked: !item.checked, checkedAt: !item.checked ? new Date() : null }
          : item
      )
    );
  };

  // Continuous GPS breadcrumb — keeps the B2B/Admin live-tracking map moving
  // in real time while the engineer is en route or actively working, instead
  // of only capturing a single point at each status transition.
  const lastPingRef = useRef(0);
  useEffect(() => {
    const trackableStatuses = ['travelling', 'in_progress'];
    if (!job || !trackableStatuses.includes(job.status)) return undefined;
    if (!navigator.geolocation) return undefined;

    const PING_INTERVAL_MS = 20000;

    const sendPing = async (position) => {
      const now = Date.now();
      if (now - lastPingRef.current < PING_INTERVAL_MS) return;
      lastPingRef.current = now;

      const payload = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        heading: Number.isFinite(position.coords.heading) ? position.coords.heading : undefined,
        speed: Number.isFinite(position.coords.speed) ? position.coords.speed : undefined
      };

      try {
        if (navigator.getBattery) {
          const battery = await navigator.getBattery();
          payload.battery = Math.round(battery.level * 100);
        }
      } catch (_) { /* Battery Status API not available — skip */ }

      engineerService.updateB2BLocation(jobId, payload).catch(() => { /* non-blocking */ });
    };

    const watchId = navigator.geolocation.watchPosition(
      sendPing,
      () => { /* ignore geolocation errors — do not interrupt the job flow */ },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [job?.status, jobId]);

  // Elapsed Time Label
  const elapsedLabel = useMemo(() => {
    if (!job?.startedAt) return null;
    const ms = Date.now() - new Date(job.startedAt).getTime();
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return hrs > 0 ? `${hrs}h ${remMins}m elapsed` : `${mins} min elapsed`;
  }, [job?.startedAt]);

  // MUTATIONS

  const acceptMutation = useMutation({
    mutationFn: () => engineerService.acceptB2BJob(jobId),
    onSuccess: (res) => {
      toast.success(res.message || 'Job Accepted!');
      setAcceptModalOpen(false);
      queryClient.invalidateQueries(['engineerB2BJobDetail', jobId]);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to accept job'))
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      engineerService.rejectB2BJob(jobId, { rejectionReason, rejectionRemarks }),
    onSuccess: (res) => {
      toast.success(res.message || 'Job Rejected');
      setRejectModalOpen(false);
      navigate('/engineer/b2b-jobs');
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to reject job'))
  });

  const startTravelMutation = useMutation({
    mutationFn: () =>
      new Promise((resolve, reject) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              engineerService.startB2BTravel(jobId, { location }).then(resolve).catch(reject);
            },
            () => {
              engineerService.startB2BTravel(jobId).then(resolve).catch(reject);
            },
            { timeout: 5000 }
          );
        } else {
          engineerService.startB2BTravel(jobId).then(resolve).catch(reject);
        }
      }),
    onSuccess: (res) => {
      toast.success(res.message || 'Travel Started!');
      queryClient.invalidateQueries(['engineerB2BJobDetail', jobId]);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to start travel'))
  });

  const arriveMutation = useMutation({
    mutationFn: () =>
      new Promise((resolve, reject) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              engineerService.arriveB2BSite(jobId, { location }).then(resolve).catch(reject);
            },
            () => {
              engineerService.arriveB2BSite(jobId).then(resolve).catch(reject);
            },
            { timeout: 5000 }
          );
        } else {
          engineerService.arriveB2BSite(jobId).then(resolve).catch(reject);
        }
      }),
    onSuccess: (res) => {
      toast.success(res.message || 'Arrived at Site! OTP sent to customer.');
      queryClient.invalidateQueries(['engineerB2BJobDetail', jobId]);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to mark arrival'))
  });

  const resendOtpMutation = useMutation({
    mutationFn: () => engineerService.resendB2BStartOtp(jobId),
    onSuccess: (res) => {
      toast.success(res.message || 'OTP sent to customer!');
      setResendCooldown(45);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to resend OTP'))
  });

  const startJobMutation = useMutation({
    mutationFn: () =>
      engineerService.startB2BJob(jobId, {
        startOtp: otp,
        beforePhotos: beforePhotoUrl ? [beforePhotoUrl] : []
      }),
    onSuccess: (res) => {
      toast.success(res.message || 'Job Started! Timer is running.');
      setOtp('');
      queryClient.invalidateQueries(['engineerB2BJobDetail', jobId]);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to start job'))
  });

  const customerUnavailableMutation = useMutation({
    mutationFn: () =>
      engineerService.markB2BCustomerUnavailable(jobId, {
        remarks: unavailableRemarks,
        photos: beforePhotoUrl ? [beforePhotoUrl] : []
      }),
    onSuccess: (res) => {
      toast.success(res.message || 'Customer unavailable notice recorded.');
      setUnavailableModalOpen(false);
      queryClient.invalidateQueries(['engineerB2BJobDetail', jobId]);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to record notice'))
  });

  const completeJobMutation = useMutation({
    mutationFn: () =>
      engineerService.completeB2BJob(jobId, {
        status: 'completed',
        beforePhotos: beforePhotoUrl ? [beforePhotoUrl] : [],
        afterPhotos: afterPhotoUrl ? [afterPhotoUrl] : [],
        workNotes,
        partsReplaced,
        checklist,
        customerSignature,
        customerSignoffMethod
      }),
    onSuccess: (res) => {
      toast.success(res.message || 'Completion submitted for admin review!');
      localStorage.removeItem(`b2b_draft_${jobId}`);
      queryClient.invalidateQueries(['engineerB2BJobDetail', jobId]);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to submit completion'))
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-[#F8FCFC]">
        <LogoLoader />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen p-4 flex flex-col items-center justify-center bg-[#F8FCFC] text-center space-y-4">
        <FiAlertTriangle className="w-12 h-12 text-amber-500" />
        <h2 className="text-lg font-bold text-gray-900">Job Not Found</h2>
        <p className="text-xs text-gray-500 max-w-xs">You may not be assigned to this job or it was unassigned.</p>
        <button
          onClick={() => navigate('/engineer/b2b-jobs')}
          className="px-4 py-2 bg-[#10AFA5] text-white font-bold text-xs rounded-xl"
        >
          Back to B2B Jobs
        </button>
      </div>
    );
  }

  const isVendorBased = job.assignmentType === 'vendor_engineer' || !!job.assignedVendorId;
  const vendorName = job.assignedVendorId?.vendorName || job.assignedVendorId?.businessName || job.assignedVendorName || 'Partner Firm';
  const hasCoordinates = job.coordinates?.coordinates && job.coordinates.coordinates.length === 2;
  const [lng, lat] = hasCoordinates ? job.coordinates.coordinates : [0, 0];

  return (
    <div className="min-h-screen bg-[#F8FCFC] pb-32">
      {/* Sticky Top Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-gray-900 via-slate-900 to-teal-950 text-white p-4 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/engineer/b2b-jobs')}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>

          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-[#10AFA5] tracking-wider block">B2B JOB TICKET</span>
            <h1 className="text-base font-black tracking-tight">{job.jobId}</h1>
          </div>

          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all text-sm"
          >
            <FiRefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Status & SLA Banner */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <div className="flex justify-between items-start gap-2">
            <div>
              <span className="text-[10px] font-extrabold uppercase text-gray-400">Current Status</span>
              <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">{job.status.replace(/_/g, ' ')}</h2>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-teal-50 text-[#10AFA5] border border-teal-200">
              {job.priority} Priority
            </span>
          </div>

          {elapsedLabel && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-teal-50/70 border border-teal-100 text-xs text-[#10AFA5] font-bold">
              <FiClock className="w-4 h-4 text-[#10AFA5] animate-pulse" />
              <span>Work Timer: {elapsedLabel}</span>
            </div>
          )}

          {job.slaTarget && (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <FiShield className="text-indigo-600" /> SLA Target: {job.slaTarget} Hours
            </p>
          )}
        </div>

        {/* 1. JOB INFORMATION */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <FiBriefcase className="text-[#10AFA5]" /> Job Information
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-400 font-semibold block">Service Type</span>
              <span className="font-bold text-gray-900">{job.service}</span>
            </div>
            <div>
              <span className="text-gray-400 font-semibold block">Requirement / Batch ID</span>
              <span className="font-bold text-gray-900">{job.batchId ? String(job.batchId).slice(-8) : job.jobId}</span>
            </div>
          </div>
          {job.subService && (
            <div className="text-xs">
              <span className="text-gray-400 font-semibold block">Sub Service / Scope</span>
              <span className="font-bold text-gray-800">{job.subService}</span>
            </div>
          )}
        </div>

        {/* 2. CUSTOMER & SITE CONTACT */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <FiUserCheck className="text-[#10AFA5]" /> Customer & Site Contact
            </h3>
            <button
              onClick={() => setUnavailableModalOpen(true)}
              className="text-[11px] font-bold text-amber-600 hover:underline"
            >
              Customer Unavailable?
            </button>
          </div>

          <div className="space-y-1 text-xs">
            <p className="font-bold text-gray-900 text-sm">{job.customerName}</p>
            {job.companyId?.companyName && (
              <p className="text-gray-500 font-medium">Firm: {job.companyId.companyName}</p>
            )}
          </div>

          {job.phone && (
            <div className="pt-1 flex gap-2">
              <a
                href={`tel:${job.phone}`}
                className="flex-1 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#10AFA5] font-extrabold text-xs flex items-center justify-center gap-2 border border-teal-200 transition-all"
              >
                <FiPhone className="w-4 h-4" /> Call Customer ({job.phone})
              </a>
            </div>
          )}
        </div>

        {/* 3. SERVICE LOCATION & NAVIGATION */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <FiMapPin className="text-[#10AFA5]" /> Service Location
          </h3>

          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700 space-y-1">
            <p className="font-bold text-gray-900">{job.address}</p>
            <p className="text-gray-500">{job.city} {job.state ? `, ${job.state}` : ''} - {job.pincode}</p>
          </div>

          {hasCoordinates && lat !== 0 && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all"
            >
              <FiNavigation className="w-4 h-4" /> Open in Google Maps Navigation
            </a>
          )}
        </div>

        {/* 4. SCHEDULE */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <FiClock className="text-[#10AFA5]" /> Schedule & Slot
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-50 p-2.5 rounded-xl">
              <span className="text-gray-400 font-semibold block text-[10px] uppercase">Required Date</span>
              <span className="font-bold text-gray-900">
                {job.preferredDate ? new Date(job.preferredDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Flexible'}
              </span>
            </div>
            <div className="bg-gray-50 p-2.5 rounded-xl">
              <span className="text-gray-400 font-semibold block text-[10px] uppercase">Preferred Time</span>
              <span className="font-bold text-gray-900">{job.preferredTime || 'Anytime'}</span>
            </div>
          </div>
        </div>

        {/* 5. ASSIGNMENT TYPE & VENDOR INFO */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <FiShield className="text-[#10AFA5]" /> Assignment & Fulfillment
          </h3>
          <div className="flex items-center justify-between text-xs bg-gray-50 p-3 rounded-xl">
            <div>
              <span className="text-gray-400 font-semibold block text-[10px] uppercase">Assignment Type</span>
              <span className="font-bold text-gray-900">
                {isVendorBased ? `Vendor-Based (${vendorName})` : 'Freelancer Assignment'}
              </span>
            </div>
            {isVendorBased ? (
              <span className="px-2.5 py-1 text-[10px] font-extrabold rounded-full bg-purple-100 text-purple-800">VENDOR</span>
            ) : (
              <span className="px-2.5 py-1 text-[10px] font-extrabold rounded-full bg-teal-100 text-teal-800">FREELANCER</span>
            )}
          </div>
        </div>

        {/* 6. PAYMENT / PAYOUT VISIBILITY */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <FiDollarSign className="text-[#10AFA5]" /> Payout Status (Read-Only)
          </h3>

          <div className="flex items-center justify-between text-xs bg-emerald-50/60 border border-emerald-100 p-3 rounded-xl">
            <div>
              <span className="text-gray-500 font-semibold block text-[10px] uppercase">Job Payout Status</span>
              <span className="font-extrabold text-emerald-900 uppercase">
                {job.payoutStatus ? job.payoutStatus.replace(/_/g, ' ') : 'PENDING REVIEW'}
              </span>
            </div>
            {job.charge > 0 && (
              <span className="text-sm font-black text-emerald-800">₹{job.charge}</span>
            )}
          </div>

          {job.isDemoPayment && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-bold flex items-center gap-2">
              <FiAlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>DEMO PAYMENT MODE ACTIVE — Transactions are in simulated environment.</span>
            </div>
          )}
        </div>

        {/* 7. STEP-BY-STEP WORKFLOW EXECUTION CONTROLLER */}

        {/* STEP A: ASSIGNED / OFFERED → ACCEPT / REJECT */}
        {['pending', 'searching_engineer', 'assigned'].includes(job.status) && (
          <div className="bg-white rounded-2xl border-2 border-teal-200 p-4 shadow-md space-y-3">
            <h3 className="font-extrabold text-gray-900 text-sm">Action Required: Respond to Job Offer</h3>
            <p className="text-xs text-gray-500">Please review the details above and accept or reject this assignment.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(true)}
                className="flex-1 py-3 rounded-xl border border-rose-300 text-rose-700 font-extrabold text-xs hover:bg-rose-50 transition-all flex items-center justify-center gap-1"
              >
                <FiXCircle className="w-4 h-4" /> Reject Offer
              </button>
              <button
                type="button"
                onClick={() => setAcceptModalOpen(true)}
                className="flex-1 py-3 rounded-xl bg-[#10AFA5] hover:bg-teal-600 text-white font-extrabold text-xs shadow-md shadow-teal-500/30 transition-all flex items-center justify-center gap-1"
              >
                <FiCheckCircle className="w-4 h-4" /> Accept Job Offer
              </button>
            </div>
          </div>
        )}

        {/* STEP B: ACCEPTED → START TRAVEL */}
        {job.status === 'accepted' && (
          <div className="bg-white rounded-2xl border-2 border-indigo-200 p-4 shadow-md space-y-3">
            <h3 className="font-extrabold text-gray-900 text-sm">Job Accepted: Ready to Travel</h3>
            <p className="text-xs text-gray-500">Click "Start Travel" when you begin moving towards the customer location.</p>
            <button
              type="button"
              disabled={startTravelMutation.isPending}
              onClick={() => startTravelMutation.mutate()}
              className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-md shadow-indigo-500/30 transition-all flex items-center justify-center gap-2"
            >
              <FiNavigation className="w-5 h-5 animate-pulse" />
              {startTravelMutation.isPending ? 'Starting Travel…' : 'START TRAVEL TO SITE'}
            </button>
          </div>
        )}

        {/* STEP C: TRAVELLING → ARRIVED AT SITE */}
        {job.status === 'travelling' && (
          <div className="bg-white rounded-2xl border-2 border-indigo-300 p-4 shadow-md space-y-3">
            <div className="flex items-center gap-2 text-indigo-700 font-extrabold text-sm">
              <FiNavigation className="animate-spin" />
              <span>Travelling to Site</span>
            </div>
            <p className="text-xs text-gray-500">When you reach the customer's service address, confirm arrival.</p>
            <button
              type="button"
              disabled={arriveMutation.isPending}
              onClick={() => arriveMutation.mutate()}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md shadow-emerald-500/30 transition-all flex items-center justify-center gap-2"
            >
              <FiMapPin className="w-5 h-5" />
              {arriveMutation.isPending ? 'Recording Arrival…' : 'ARRIVED AT SITE'}
            </button>
          </div>
        )}

        {/* STEP D: ARRIVED / OTP & BEFORE PHOTO */}
        {(job.status === 'arrived' || (job.status === 'in_progress' && !job.startedAt)) && (
          <div className="bg-white rounded-2xl border-2 border-[#10AFA5] p-5 shadow-lg space-y-4">
            <div>
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                <FiLock className="text-[#10AFA5]" /> Customer OTP & Before Photo Required
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Ask the customer for the 6-digit Start OTP sent to their phone, and capture a before-work photo.
              </p>
            </div>

            {/* 6-Digit OTP Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-gray-700 block">Customer 6-Digit Start OTP *</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg font-black text-center tracking-widest focus:border-[#10AFA5] focus:outline-none"
              />
              <div className="flex justify-between items-center text-[11px] pt-1">
                <span className="text-gray-400">OTP sent to customer phone</span>
                <button
                  type="button"
                  disabled={resendCooldown > 0 || resendOtpMutation.isPending}
                  onClick={() => resendOtpMutation.mutate()}
                  className="font-bold text-[#10AFA5] hover:underline disabled:opacity-50"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP to Customer'}
                </button>
              </div>
            </div>

            {/* Before Photo Capture */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-gray-700 block">Before-Work Photo Evidence *</label>
              {beforePhotoUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-900 group">
                  <img src={beforePhotoUrl} alt="Before Work" className="w-full h-44 object-cover" />
                  <label className="absolute bottom-2 right-2 bg-black/70 hover:bg-black text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1">
                    <FiCamera /> Retake Photo
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoPick(e, 'before')} />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 w-full border-2 border-dashed border-gray-300 rounded-2xl p-6 text-xs font-bold text-gray-600 cursor-pointer hover:border-[#10AFA5] hover:bg-teal-50/40 transition-all text-center">
                  <FiCamera className="w-8 h-8 text-[#10AFA5]" />
                  <span>Capture Before-Work Photo</span>
                  <span className="text-[10px] text-gray-400 font-normal">Use device camera to record initial equipment state</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoPick(e, 'before')} />
                </label>
              )}
            </div>

            <button
              type="button"
              disabled={startJobMutation.isPending || !otp || !beforePhotoUrl}
              onClick={() => startJobMutation.mutate()}
              className="w-full py-4 rounded-2xl bg-[#10AFA5] hover:bg-teal-600 text-white font-black text-base shadow-lg shadow-teal-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FiCheckCircle className="w-5 h-5" />
              {startJobMutation.isPending ? 'Verifying & Starting…' : 'VERIFY & START JOB'}
            </button>
          </div>
        )}

        {/* STEP E: ACTIVE JOB (IN_PROGRESS) */}
        {job.status === 'in_progress' && (
          <div className="bg-white rounded-2xl border-2 border-amber-300 p-5 shadow-lg space-y-5">
            <div className="border-b border-gray-100 pb-3">
              <div className="flex justify-between items-center">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                  <FiClock className="animate-spin" /> JOB IN PROGRESS
                </span>
                {elapsedLabel && <span className="text-xs font-bold text-[#10AFA5]">{elapsedLabel}</span>}
              </div>
              <h3 className="font-black text-gray-900 text-base mt-2">Active Service Checklist & Completion</h3>
            </div>

            {/* Service Checklist */}
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold uppercase text-gray-500 tracking-wider flex items-center gap-1">
                <FiCheckSquare className="text-[#10AFA5]" /> Mandatory Service Checklist
              </h4>
              <div className="space-y-2">
                {checklist.map((item) => (
                  <div
                    key={item.itemId}
                    onClick={() => toggleChecklistItem(item.itemId)}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      item.checked
                        ? 'border-teal-300 bg-teal-50/50 text-gray-900 font-bold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {item.checked ? (
                      <FiCheckSquare className="w-5 h-5 text-[#10AFA5] shrink-0" />
                    ) : (
                      <FiSquare className="w-5 h-5 text-gray-300 shrink-0" />
                    )}
                    <span className="text-xs">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Work Notes & Parts Replaced */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">Work Done Remarks & Notes *</label>
                <textarea
                  value={workNotes}
                  onChange={(e) => setWorkNotes(e.target.value)}
                  placeholder="Describe electrical repairs, testing results, or work completed..."
                  className="w-full border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:border-[#10AFA5] min-h-[70px]"
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-1">Parts / Materials Replaced (Optional)</label>
                <input
                  type="text"
                  value={partsReplaced}
                  onChange={(e) => setPartsReplaced(e.target.value)}
                  placeholder="e.g. 32A MCB switch, 2.5mm copper wire 5m"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#10AFA5]"
                />
              </div>
            </div>

            {/* Evidence: Before & After Photos */}
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold uppercase text-gray-500 tracking-wider flex items-center gap-1">
                <FiCamera className="text-[#10AFA5]" /> Work Evidence Photos
              </h4>

              <div className="grid grid-cols-2 gap-3">
                {/* Before Photo Preview */}
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">BEFORE WORK</span>
                  {beforePhotoUrl ? (
                    <img src={beforePhotoUrl} alt="Before" className="w-full h-28 object-cover rounded-xl border border-gray-200" />
                  ) : (
                    <div className="w-full h-28 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">
                      No Photo
                    </div>
                  )}
                </div>

                {/* After Photo Capture */}
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">AFTER WORK *</span>
                  {afterPhotoUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-gray-200">
                      <img src={afterPhotoUrl} alt="After" className="w-full h-28 object-cover" />
                      <label className="absolute bottom-1 right-1 bg-black/70 text-white p-1 rounded text-[9px] font-bold cursor-pointer">
                        Retake
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoPick(e, 'after')} />
                      </label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-teal-300 bg-teal-50/30 rounded-xl text-[11px] font-bold text-[#10AFA5] cursor-pointer hover:bg-teal-50 transition-all text-center p-2">
                      <FiCamera className="w-5 h-5 mb-1" />
                      Capture After Photo
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoPick(e, 'after')} />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Complete Action Button */}
            <button
              type="button"
              disabled={completeJobMutation.isPending || !afterPhotoUrl}
              onClick={() => completeJobMutation.mutate()}
              className="w-full py-4 rounded-2xl bg-gray-900 hover:bg-black text-white font-black text-base shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FiCheckCircle className="w-5 h-5 text-[#10AFA5]" />
              {completeJobMutation.isPending ? 'Submitting…' : 'SUBMIT SERVICE COMPLETION'}
            </button>
          </div>
        )}

        {/* STEP F: COMPLETION SUBMITTED / UNDER REVIEW */}
        {(job.status === 'completion_submitted' || job.status === 'admin_review') && (
          <div className="bg-white rounded-2xl border-2 border-purple-200 p-5 shadow-lg space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-purple-50 text-purple-700 flex items-center justify-center">
              <FiCheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-extrabold text-gray-900 text-lg">Completion Submitted</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                Service work has been submitted successfully and is currently under QA / Admin verification.
              </p>
            </div>

            <div className="bg-purple-50/70 border border-purple-100 rounded-xl p-3 text-xs text-purple-900 space-y-1 text-left">
              <p><span className="font-bold">Submitted At:</span> {job.completionSubmittedAt ? new Date(job.completionSubmittedAt).toLocaleString() : 'Just now'}</p>
              <p><span className="font-bold">Payout Status:</span> PENDING ADMIN APPROVAL</p>
            </div>
          </div>
        )}

        {/* 8. JOB TIMELINE & AUDIT HISTORY */}
        {job.timeline && job.timeline.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <FiFileText className="text-[#10AFA5]" /> Job Timeline Audit
            </h3>
            <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200 pl-7">
              {job.timeline.map((event, idx) => (
                <div key={idx} className="relative text-xs space-y-0.5">
                  <div className="absolute -left-7 top-0.5 w-2.5 h-2.5 rounded-full bg-[#10AFA5] ring-4 ring-white" />
                  <span className="font-extrabold text-gray-900 uppercase block">{event.status.replace(/_/g, ' ')}</span>
                  <p className="text-gray-600 font-medium">{event.remarks}</p>
                  <span className="text-[10px] text-gray-400">{new Date(event.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ACCEPT MODAL */}
      {acceptModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="font-extrabold text-gray-900 text-lg text-center">Accept Job Offer?</h3>
            <p className="text-xs text-gray-500 text-center">Are you ready to accept B2B job ticket {job.jobId}?</p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAcceptModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={acceptMutation.isPending}
                onClick={() => acceptMutation.mutate()}
                className="flex-1 py-2.5 rounded-xl bg-[#10AFA5] text-white text-xs font-extrabold shadow-md"
              >
                {acceptMutation.isPending ? 'Accepting…' : 'Confirm & Accept'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="font-extrabold text-gray-900 text-lg text-center">Reject Job Offer</h3>
            <div className="space-y-2 text-xs">
              <label className="font-bold text-gray-700 block">Select Rejection Reason *</label>
              {REJECTION_REASONS.map((r) => (
                <label
                  key={r}
                  onClick={() => setRejectionReason(r)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer ${
                    rejectionReason === r ? 'border-rose-500 bg-rose-50 text-rose-900 font-bold' : 'border-gray-200'
                  }`}
                >
                  <input type="radio" checked={rejectionReason === r} readOnly className="accent-rose-600" />
                  <span>{r}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate()}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold shadow-md"
              >
                {rejectMutation.isPending ? 'Rejecting…' : 'Submit Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMER UNAVAILABLE MODAL */}
      {unavailableModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="font-extrabold text-gray-900 text-lg text-center">Customer Unavailable</h3>
            <p className="text-xs text-gray-500 text-center">Record that customer / site contact is not available.</p>
            <textarea
              value={unavailableRemarks}
              onChange={(e) => setUnavailableRemarks(e.target.value)}
              placeholder="e.g. Site gate closed, contact number unanswered after 3 calls"
              className="w-full border border-gray-200 rounded-xl p-3 text-xs focus:outline-none min-h-[80px]"
            />
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUnavailableModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={customerUnavailableMutation.isPending}
                onClick={() => customerUnavailableMutation.mutate()}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-extrabold shadow-md"
              >
                {customerUnavailableMutation.isPending ? 'Saving…' : 'Submit Notice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default B2BJobDetail;
