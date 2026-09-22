import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiX } from 'react-icons/fi';
import api from '../../../../../services/api';
import LiveTrackingModal from '../../Jobs/components/LiveTrackingModal';

/**
 * Tracking an engineer means tracking the job they are on for this company.
 * Resolves the engineer's current job, then shows the live job map.
 */
const EngineerTrackingModal = ({ engineerId, onClose }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['b2bEngineerCurrentJob', engineerId],
    queryFn: async () => (await api.get(`/b2b/engineers/${engineerId}/current-job`)).data?.data || null,
    enabled: Boolean(engineerId)
  });

  if (!engineerId) return null;
  if (data?._id) return <LiveTrackingModal jobId={data._id} onClose={onClose} />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-gray-900/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
        <button onClick={onClose} className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-700" aria-label="Close"><FiX /></button>
        {isLoading ? (
          <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full mx-auto" />
        ) : (
          <p className="text-sm text-gray-600">
            {error?.response?.data?.message || 'This engineer is not on one of your jobs right now, so there is nothing to track.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default EngineerTrackingModal;
