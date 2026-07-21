import React, { useCallback, useEffect, useState } from 'react';
import { UserCheck, UserX, Phone, Mail, Clock } from 'lucide-react';
import {
  fetchPendingEngineerApprovals,
  approveLinkedEngineer,
  rejectLinkedEngineer,
} from '../../../services/companyCodeService';
import EmptyState from '../../BusinessIntake/components/EmptyState';

const PendingApprovals = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPendingEngineerApprovals();
      setData(res.data?.data || []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    setActing(id);
    try {
      if (action === 'approve') {
        await approveLinkedEngineer(id);
      } else {
        const reason = window.prompt('Rejection reason (optional):') || '';
        await rejectLinkedEngineer(id, reason);
      }
      await load();
    } catch (e) {
      alert(e.response?.data?.message || 'Action failed');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  }

  if (!data.length) {
    return (
      <EmptyState
        icon={UserCheck}
        title="No pending approvals"
        description="Engineers who sign up with your company code will appear here for approval."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-2">
        Code alone does not activate engineers — you must approve each join request.
      </p>
      {data.map((eng) => (
        <div key={eng._id} className="border border-gray-200 rounded-xl p-4 bg-white flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h3 className="font-bold text-gray-900">{eng.name}</h3>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
              {eng.phone && (
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{eng.phone}</span>
              )}
              {eng.email && (
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{eng.email}</span>
              )}
              {eng.linkedViaCode && (
                <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{eng.linkedViaCode}</span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {eng.createdAt ? new Date(eng.createdAt).toLocaleDateString('en-IN') : '—'}
              </span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              disabled={acting === eng._id}
              onClick={() => act(eng._id, 'approve')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <UserCheck className="h-4 w-4" /> Approve
            </button>
            <button
              type="button"
              disabled={acting === eng._id}
              onClick={() => act(eng._id, 'reject')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              <UserX className="h-4 w-4" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PendingApprovals;
