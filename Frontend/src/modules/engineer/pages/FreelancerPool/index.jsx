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

const FreelancerPool = () => {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [teamSize, setTeamSize] = useState('');

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['freelancerPool'],
    queryFn: fetchPool,
    staleTime: 15_000,
    refetchOnWindowFocus: false
  });

  const acceptMutation = useMutation({
    mutationFn: ({ id, availableTeamSize }) =>
      api.post(`/engineers/freelancer-pool/pool/${id}/accept`, { availableTeamSize }),
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
      setTeamSize('');
      queryClient.invalidateQueries(['freelancerPool']);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Could not accept project'))
  });

  const openAccept = (job) => {
    setModal(job);
    setTeamSize(String(job.requiredEngineers || 1));
  };

  const confirmAccept = () => {
    const required = modal?.requiredEngineers || 1;
    const available = parseInt(teamSize, 10);
    if (!available || available < required) {
      toast.error(`Enter at least ${required} engineers in your available team`);
      return;
    }
    acceptMutation.mutate({ id: modal._id, availableTeamSize: available });
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">
      <div>
        <h1 className="text-xl font-black text-gray-900">Freelancer Projects</h1>
        <p className="text-xs text-gray-500">
          Available when vendors decline or time out. Confirm your team size before accepting.
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
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-bold text-gray-900">Can you complete this project?</h3>
            <p className="text-sm text-gray-600">{modal.title}</p>
            <p className="text-sm">
              Required engineers: <strong>{modal.requiredEngineers || 1}</strong>
            </p>
            <label className="block text-xs font-semibold text-gray-600">
              Your available team
              <input
                type="number"
                min={1}
                value={teamSize}
                onChange={(e) => setTeamSize(e.target.value.replace(/\D/g, ''))}
                className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setModal(null)} className="flex-1 py-2 border rounded-xl text-sm font-bold">
                No
              </button>
              <button
                type="button"
                disabled={acceptMutation.isPending}
                onClick={confirmAccept}
                className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-60"
              >
                {acceptMutation.isPending ? '…' : 'Yes, Accept'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FreelancerPool;
