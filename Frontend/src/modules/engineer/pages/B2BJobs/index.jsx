import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FiClock, FiMapPin, FiPlay, FiCheckCircle, FiAlertTriangle, FiCamera } from 'react-icons/fi';
import toast from 'react-hot-toast';
import engineerService from '../../../../services/engineerService';
import { compressImageToBase64 } from '../../../../utils/imageCompression';
import { getUserFacingError } from '../../../../utils/userFacingError';
import LogoLoader from '../../../../components/common/LogoLoader';

const INCOMPLETE_REASONS = [
  'Spare Parts Required',
  'Customer Dependency',
  'Site Closed',
  'No Access',
  'Other'
];

const B2BJobs = () => {
  const queryClient = useQueryClient();
  const [startModal, setStartModal] = useState(null);
  const [completeModal, setCompleteModal] = useState(null);
  const [otp, setOtp] = useState('');
  const [beforePhotoUrl, setBeforePhotoUrl] = useState('');
  const [afterPhotoUrl, setAfterPhotoUrl] = useState('');
  const [incompleteReason, setIncompleteReason] = useState('Spare Parts Required');
  const [incompleteRemarks, setIncompleteRemarks] = useState('');
  const [completeStatus, setCompleteStatus] = useState('completed');

  const { data, isLoading } = useQuery({
    queryKey: ['engineerB2BJobs'],
    queryFn: () => engineerService.getB2BJobs(),
    staleTime: 1000 * 20,
    refetchOnWindowFocus: false
  });

  const jobs = data?.jobs || [];

  const elapsedLabel = useMemo(() => {
    if (!completeModal?.startedAt) return null;
    const ms = Date.now() - new Date(completeModal.startedAt).getTime();
    const mins = Math.floor(ms / 60000);
    return `${mins} min elapsed`;
  }, [completeModal]);

  const startMutation = useMutation({
    mutationFn: () =>
      engineerService.startB2BJob(startModal._id, {
        startOtp: otp,
        beforePhotos: beforePhotoUrl ? [beforePhotoUrl] : []
      }),
    onSuccess: (res) => {
      toast.success(res.message || 'Job started');
      setStartModal(null);
      setOtp('');
      setBeforePhotoUrl('');
      queryClient.invalidateQueries(['engineerB2BJobs']);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to start job'))
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      engineerService.completeB2BJob(completeModal._id, {
        status: completeStatus,
        afterPhotos: completeStatus === 'completed' && afterPhotoUrl ? [afterPhotoUrl] : [],
        incompleteReason: completeStatus === 'failed' ? incompleteReason : undefined,
        incompleteRemarks: completeStatus === 'failed' ? incompleteRemarks : undefined
      }),
    onSuccess: (res) => {
      toast.success(res.message || 'Updated');
      setCompleteModal(null);
      setAfterPhotoUrl('');
      setIncompleteRemarks('');
      queryClient.invalidateQueries(['engineerB2BJobs']);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to complete job'))
  });

  const handlePhotoPick = async (e, kind) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToBase64(file);
      if (kind === 'before') setBeforePhotoUrl(dataUrl);
      else setAfterPhotoUrl(dataUrl);
      toast.success('Photo ready');
    } catch (err) {
      toast.error(getUserFacingError(err, 'Could not process photo'));
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-black text-gray-900">B2B Jobs</h1>
        <p className="text-xs text-gray-500">Corporate tickets — OTP + before photo required to start</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LogoLoader /></div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
          <FiAlertTriangle className="mx-auto text-gray-300 w-8 h-8 mb-2" />
          <p className="font-bold text-gray-800 text-sm">No B2B jobs yet</p>
          <p className="text-xs text-gray-400 mt-1">New corporate tickets will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job._id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-gray-900">{job.jobId}</p>
                  <p className="text-xs text-gray-500">{job.service} · {job.customerName}</p>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                  {job.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <FiMapPin /> {job.address}, {job.city}
              </p>
              {job.startedAt && (
                <p className="text-xs text-[#10AFA5] flex items-center gap-1">
                  <FiClock /> Started {new Date(job.startedAt).toLocaleString()}
                </p>
              )}
              {job.requiresNewJob && (
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <FiAlertTriangle /> Closed — create a fresh job for parts return
                </p>
              )}
              <div className="flex gap-2 pt-2">
                {job.status === 'assigned' && (
                  <button
                    type="button"
                    onClick={() => setStartModal(job)}
                    className="flex-1 py-2 rounded-xl bg-[#10AFA5] text-white text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <FiPlay /> Start (OTP)
                  </button>
                )}
                {job.status === 'in_progress' && (
                  <button
                    type="button"
                    onClick={() => setCompleteModal(job)}
                    className="flex-1 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <FiCheckCircle /> Complete / Close
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {startModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-bold text-gray-900">Start {startModal.jobId}</h3>
            <p className="text-xs text-gray-500">Enter customer start OTP and capture a before-work photo.</p>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit OTP"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-xl px-3 py-4 text-sm text-gray-600 cursor-pointer hover:border-[#10AFA5]">
              <FiCamera />
              {beforePhotoUrl ? 'Before photo selected ✓' : 'Capture before photo'}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoPick(e, 'before')} />
            </label>
            <button
              type="button"
              className="text-xs text-[#10AFA5] font-bold"
              onClick={async () => {
                try {
                  await engineerService.resendB2BStartOtp(startModal._id);
                  toast.success('OTP resent to customer');
                } catch (e) {
                  toast.error(e.response?.data?.message || 'Resend failed');
                }
              }}
            >
              Resend OTP to customer
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStartModal(null)} className="flex-1 py-2 rounded-xl border text-xs font-bold">
                Cancel
              </button>
              <button
                type="button"
                disabled={startMutation.isPending}
                onClick={() => startMutation.mutate()}
                className="flex-1 py-2 rounded-xl bg-[#10AFA5] text-white text-xs font-bold"
              >
                {startMutation.isPending ? 'Starting…' : 'Verify & Start'}
              </button>
            </div>
          </div>
        </div>
      )}

      {completeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-gray-900">Close {completeModal.jobId}</h3>
            {elapsedLabel && <p className="text-xs text-[#10AFA5]"><FiClock className="inline" /> {elapsedLabel}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCompleteStatus('completed')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${completeStatus === 'completed' ? 'bg-emerald-600 text-white' : 'border'}`}
              >
                Completed
              </button>
              <button
                type="button"
                onClick={() => setCompleteStatus('failed')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${completeStatus === 'failed' ? 'bg-amber-600 text-white' : 'border'}`}
              >
                Incomplete
              </button>
            </div>
            {completeStatus === 'completed' ? (
              <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-xl px-3 py-4 text-sm text-gray-600 cursor-pointer hover:border-[#10AFA5]">
                <FiCamera />
                {afterPhotoUrl ? 'After photo selected ✓' : 'Capture after photo (required)'}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoPick(e, 'after')} />
              </label>
            ) : (
              <>
                <select
                  value={incompleteReason}
                  onChange={(e) => setIncompleteReason(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                >
                  {INCOMPLETE_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <textarea
                  value={incompleteRemarks}
                  onChange={(e) => setIncompleteRemarks(e.target.value)}
                  placeholder="Remarks (required for Spare Parts)"
                  className="w-full border rounded-xl px-3 py-2 text-sm min-h-[80px]"
                />
              </>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setCompleteModal(null)} className="flex-1 py-2 rounded-xl border text-xs font-bold">
                Cancel
              </button>
              <button
                type="button"
                disabled={completeMutation.isPending}
                onClick={() => completeMutation.mutate()}
                className="flex-1 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold"
              >
                {completeMutation.isPending ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default B2BJobs;
