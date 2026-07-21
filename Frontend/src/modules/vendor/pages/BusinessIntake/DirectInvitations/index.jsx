import React, { useState, useEffect, useCallback } from 'react';
import { Star, CheckCircle, XCircle, MapPin, TrendingUp } from 'lucide-react';
import { fetchInvitations, acceptInvitation, declineInvitation, formatBudget } from '../../../services/businessIntakeService';
import CountdownTimer from '../components/CountdownTimer';
import { SkeletonGrid } from '../components/SkeletonCard';
import EmptyState from '../components/EmptyState';
import OpportunityDrawer from '../components/OpportunityDrawer';
import { useBusinessIntake } from '../context/BusinessIntakeContext';

const DeclineModal = ({ invitationId, onDecline, onClose }) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDecline = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await declineInvitation(invitationId, reason);
      onDecline();
    } catch (e) {
      alert('Failed to decline. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">Decline Invitation</h3>
        <p className="text-sm text-gray-500 mb-4">Please share your reason for declining. This helps improve future matching.</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-red-400 outline-none resize-none"
          placeholder="e.g. Currently at capacity, different location required, price mismatch..."
        />
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleDecline} disabled={loading || !reason.trim()}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50">
            {loading ? 'Declining...' : 'Decline Invitation'}
          </button>
        </div>
      </div>
    </div>
  );
};

const InvitationCard = ({ invitation, onAccept, onDecline, onView }) => {
  const [accepting, setAccepting] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [expired, setExpired] = useState(false);

  const isUrgent = invitation.deadline && (new Date(invitation.deadline) - new Date()) < 24 * 60 * 60 * 1000;
  const hasMyBid = invitation.hasMyBid;

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await acceptInvitation(invitation._id);
      onAccept(invitation._id);
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <>
      <div className={`relative bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all duration-300 ${
        hasMyBid ? 'border-green-400' :
        expired ? 'border-gray-200 opacity-60' :
        isUrgent ? 'border-red-400 shadow-red-100' :
        'border-amber-400'
      }`}>
        {/* Premium banner */}
        {!hasMyBid && !expired && (
          <div className={`${isUrgent ? 'bg-red-600' : 'bg-gradient-to-r from-amber-500 to-orange-500'} px-5 py-2`}>
            <p className="text-white text-xs font-bold flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 fill-white" />
              {isUrgent ? '🔴 URGENT — Respond within hours!' : 'You were personally selected for this opportunity'}
            </p>
          </div>
        )}
        {hasMyBid && (
          <div className="bg-green-500 px-5 py-2">
            <p className="text-white text-xs font-bold">✓ You have responded to this invitation</p>
          </div>
        )}

        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="text-base font-bold text-gray-900 line-clamp-2">{invitation.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{invitation.categoryName}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-4">
            {invitation.clientInfo?.company && <span className="font-semibold">{invitation.clientInfo.company}</span>}
            {invitation.requirements?.cities?.[0] && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{invitation.requirements.cities.join(', ')}</span>
            )}
            {invitation.budget && (
              <span className="flex items-center gap-1 font-bold text-blue-700"><TrendingUp className="h-3 w-3" />{formatBudget(invitation.budget)}</span>
            )}
          </div>

          {/* Countdown */}
          {invitation.deadline && !expired && !hasMyBid && (
            <div className={`flex items-center gap-3 mb-4 px-3 py-2 rounded-xl ${isUrgent ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
              <span className="text-xs text-gray-600">Time remaining:</span>
              <CountdownTimer deadline={invitation.deadline} onExpire={() => setExpired(true)} />
            </div>
          )}

          {/* Actions */}
          {!hasMyBid && !expired && (
            <div className="flex gap-3">
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-60 transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                {accepting ? 'Accepting...' : 'Accept Invitation'}
              </button>
              <button
                onClick={() => setShowDeclineModal(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-red-600 border-2 border-red-300 rounded-xl hover:bg-red-50 transition-colors"
              >
                <XCircle className="h-4 w-4" /> Decline
              </button>
            </div>
          )}
          {expired && <p className="text-center text-sm text-gray-400 py-2">This invitation has expired</p>}
          {hasMyBid && <p className="text-center text-sm text-green-600 font-medium py-1">✓ Accepted — project creation in progress</p>}

          <button onClick={() => onView(invitation._id, invitation)} className="w-full mt-2 text-xs text-gray-500 hover:text-blue-600 transition-colors">
            View Full Details
          </button>
        </div>
      </div>

      {showDeclineModal && (
        <DeclineModal
          invitationId={invitation._id}
          onDecline={() => { setShowDeclineModal(false); onDecline(invitation._id); }}
          onClose={() => setShowDeclineModal(false)}
        />
      )}
    </>
  );
};

const DirectInvitations = () => {
  const { refreshKey } = useBusinessIntake();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpp, setSelectedOpp] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchInvitations({ status: 'open' });
      setData(res.data.data || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleAccept = (id) => setData(prev => prev.filter(i => i._id !== id));
  const handleDecline = (id) => setData(prev => prev.filter(i => i._id !== id));

  return (
    <>
      {loading ? (
        <SkeletonGrid count={3} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No active invitations"
          description="When clients personally select you for a project, invitations will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {data.map(inv => (
            <InvitationCard
              key={inv._id}
              invitation={inv}
              onAccept={handleAccept}
              onDecline={handleDecline}
              onView={(id, opp) => setSelectedOpp(opp)}
            />
          ))}
        </div>
      )}

      {selectedOpp && (
        <OpportunityDrawer opportunity={selectedOpp} onClose={() => setSelectedOpp(null)} />
      )}
    </>
  );
};

export default DirectInvitations;
