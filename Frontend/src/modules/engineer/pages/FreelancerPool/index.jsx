import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FiUsers, FiMapPin, FiAlertTriangle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../services/api';
import { getUserFacingError } from '../../../../utils/userFacingError';
import LogoLoader from '../../../../components/common/LogoLoader';

const fetchPool = async () => {
  const res = await api.get('/engineers/freelancer-pool/pool');
  return res.data?.data?.jobs || [];
};

const emptyConfirm = (required = 1) => ({
  availableTeamSize: String(required),
  canComplete: false,
  canMeetTimeline: false,
  hasResources: false,
  estimatedDays: '',
  notes: ''
});

const FreelancerPool = () => {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(emptyConfirm());

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['freelancerPool'],
    queryFn: fetchPool,
    staleTime: 15_000,
    refetchOnWindowFocus: false
  });

  const acceptMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      api.post(`/engineers/freelancer-pool/pool/${id}/accept`, payload),
    onSuccess: (res) => {
      const data = res.data?.data;
      if (data?.opsWarning) {
        toast.error(data.opsWarning, { duration: 6000 });
      } else if (data?.projectId) {
        toast.success('Project accepted — ops project created');
      } else {
        toast.success('Project accepted');
      }
      setModal(null);
      setConfirm(emptyConfirm());
      queryClient.invalidateQueries(['freelancerPool']);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Could not accept project'))
  });

  const openAccept = (job) => {
    setModal(job);
    setConfirm(emptyConfirm(job.requiredEngineers || 1));
  };

  const confirmAccept = () => {
    const required = modal?.requiredEngineers || 1;
    const available = parseInt(confirm.availableTeamSize, 10);
    if (!available || available < required) {
      toast.error(`Enter at least ${required} engineers in your available team`);
      return;
    }
    if (!confirm.canComplete || !confirm.canMeetTimeline || !confirm.hasResources) {
      toast.error('Confirm team size, completion ability, timeline, and resources');
      return;
    }
    acceptMutation.mutate({
      id: modal._id,
      payload: {
        availableTeamSize: available,
        canComplete: true,
        canMeetTimeline: true,
        hasResources: true,
        estimatedDays: confirm.estimatedDays || undefined,
        notes: confirm.notes || undefined
      }
    });
  };

  const Check = ({ id, label, checked, onChange }) => (
    <label htmlFor={id} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 rounded border-gray-300 text-[#10AFA5] focus:ring-[#10AFA5]"
      />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">
      <div>
        <h1 className="text-xl font-black text-gray-900">Freelancer Projects</h1>
        <p className="text-xs text-gray-500">
          Available when vendors decline or time out. Confirm team, timeline, and resources before accepting.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LogoLoader /></div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <FiAlertTriangle className="mx-auto text-gray-300 w-8 h-8 mb-2" />
          <p className="font-bold text-gray-800 text-sm">No pool projects right now</p>
          <p className="text-xs text-gray-400 mt-1">You will get a push notification when one opens.</p>
        </div>
      ) : (
        jobs.map((job) => (
          <div key={job._id} className="bg-white rounded-2xl border p-4 shadow-sm space-y-2">
            <p className="font-bold text-gray-900">{job.title}</p>
            <p className="text-xs text-gray-500">{job.opportunityCode} · {job.categoryName}</p>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <FiMapPin /> {job.city || 'City TBD'}
            </p>
            <p className="text-xs font-semibold text-[#10AFA5] flex items-center gap-1">
              <FiUsers /> Required team: {job.requiredEngineers || 1}
            </p>
            <button
              type="button"
              onClick={() => openAccept(job)}
              className="w-full py-2.5 rounded-xl bg-[#10AFA5] text-white text-sm font-bold"
            >
              Review & Accept
            </button>
          </div>
        ))
      )}

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-gray-900">Can you complete this project?</h3>
            <p className="text-sm text-gray-600">{modal.title}</p>
            <p className="text-sm">
              Required engineers: <strong>{modal.requiredEngineers || 1}</strong>
            </p>
            <label className="block text-xs font-semibold text-gray-600">
              Your available team size
              <input
                type="number"
                min={1}
                value={confirm.availableTeamSize}
                onChange={(e) =>
                  setConfirm((c) => ({ ...c, availableTeamSize: e.target.value.replace(/\D/g, '') }))
                }
                className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <div className="space-y-2 border rounded-xl p-3 bg-gray-50">
              <Check
                id="fp-complete"
                label="I can complete this project with my team"
                checked={confirm.canComplete}
                onChange={(v) => setConfirm((c) => ({ ...c, canComplete: v }))}
              />
              <Check
                id="fp-timeline"
                label="I can meet the required timeline"
                checked={confirm.canMeetTimeline}
                onChange={(v) => setConfirm((c) => ({ ...c, canMeetTimeline: v }))}
              />
              <Check
                id="fp-resources"
                label="I have the tools / resources needed"
                checked={confirm.hasResources}
                onChange={(v) => setConfirm((c) => ({ ...c, hasResources: v }))}
              />
            </div>
            <label className="block text-xs font-semibold text-gray-600">
              Estimated days (optional)
              <input
                type="number"
                min={1}
                value={confirm.estimatedDays}
                onChange={(e) =>
                  setConfirm((c) => ({ ...c, estimatedDays: e.target.value.replace(/\D/g, '') }))
                }
                className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setModal(null)} className="flex-1 py-2 border rounded-xl text-sm font-bold">
                Reject
              </button>
              <button
                type="button"
                disabled={acceptMutation.isPending}
                onClick={confirmAccept}
                className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-60"
              >
                {acceptMutation.isPending ? '…' : 'Accept & Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FreelancerPool;
