import React, { useState } from 'react';
import {
  X, MapPin, Clock, Users, Building2, FileText, Download, Send, FilePlus, CheckCircle2, Trophy
} from 'lucide-react';
import {
  formatBudget,
  deadlineCountdown,
  typeLabels,
  acceptClientRequest,
  declineClientRequest,
  awardMyBid,
} from '../../../services/businessIntakeService';
import BidForm from './BidForm';
import { useBusinessIntake } from '../context/BusinessIntakeContext';
import { useVendorConfig } from '../../../context/VendorConfigContext';

const OpportunityDrawer = ({ opportunity, onClose, onBidSubmitted, onAccepted }) => {
  const [showBidForm, setShowBidForm] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [actionError, setActionError] = useState('');
  const [acceptTeamSize, setAcceptTeamSize] = useState('');
  const { openProposalBuilder, triggerRefresh } = useBusinessIntake();
  const { vendorProfile } = useVendorConfig() || {};

  if (!opportunity) return null;

  const {
    _id, title, type, categoryName, subServices, clientInfo,
    requirements, budget, deadline, priority, description,
    totalBidsCount, myBid, rfqDocumentUrl, technicalSpecsUrl, status,
    hasMyBid: hasMyBidFlag, myBidStatus, assignment
  } = opportunity;

  const requiredEngineers = assignment?.requiredEngineers || requirements?.requiredEngineers || 1;

  const typeInfo = typeLabels[type] || { label: type, color: 'bg-gray-100 text-gray-700' };
  const countdown = deadlineCountdown(deadline);
  const isOpen = status === 'open';
  const hasMyBid = !!(myBid || hasMyBidFlag);
  const bidStatus = myBid?.status || myBidStatus;

  const kycStatus =
    vendorProfile?.complianceStatus?.kycStatus ||
    vendorProfile?.kycStatus;
  // Soft gate: show warning but allow approved vendors (matches backend)
  const kycPending = kycStatus && kycStatus !== 'verified';

  // Queue-driven work is accept/reject; only open opportunities go to bidding.
  const isQueueDriven = (assignment?.vendorQueue || []).length > 0;
  const isClientRequest = type === 'client_request' || isQueueDriven;
  const isCompetitive =
    !isQueueDriven && ['b2b_opportunity', 'bulk_requirement', 'bid_quote_request'].includes(type);

  const handleCreateProposal = () => {
    openProposalBuilder({
      _id,
      title,
      budget,
      timelineDays: requirements?.contractDuration
        ? parseInt(String(requirements.contractDuration), 10) || 30
        : 30,
    });
    onClose?.();
  };

  const handleAcceptRequest = async () => {
    setActionError('');
    const required = opportunity.assignment?.requiredEngineers || opportunity.requiredEngineers || 1;
    const team = parseInt(acceptTeamSize || String(required), 10);
    if (!team || team < required) {
      setActionError(`Confirm team size of at least ${required} engineer(s)`);
      return;
    }
    setAccepting(true);
    try {
      const amount = budget?.max || budget?.min || 0;
      const res = await acceptClientRequest(_id, {
        amount,
        proposalText: `Accepted: ${title}`,
        timeline: 30,
        teamSize: team,
      });
      triggerRefresh?.();
      onAccepted?.(res.data);
      onBidSubmitted?.(res.data);
      onClose?.();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to accept request');
    } finally {
      setAccepting(false);
    }
  };

  const handleDeclineRequest = async () => {
    setActionError('');
    setDeclining(true);
    try {
      await declineClientRequest(_id, 'Not a fit for current capacity');
      triggerRefresh?.();
      onClose?.();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to decline request');
    } finally {
      setDeclining(false);
    }
  };

  const handleConfirmAward = async () => {
    setActionError('');
    setAwarding(true);
    try {
      const res = await awardMyBid(_id);
      triggerRefresh?.();
      onAccepted?.(res.data);
      onBidSubmitted?.(res.data);
      onClose?.();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to confirm award');
    } finally {
      setAwarding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />

      <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            {priority === 'urgent' && <span className="text-xs font-bold text-red-600">Urgent</span>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{title}</h2>
            <p className="text-sm text-gray-500 mt-1">{categoryName}</p>
          </div>

          <div className="flex gap-4 flex-wrap">
            {countdown && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                countdown.expired && !isClientRequest ? 'bg-gray-100 text-gray-500' :
                countdown.expired && isClientRequest ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                countdown.urgent ? 'bg-red-50 text-red-700 border border-red-200' :
                'bg-blue-50 text-blue-700'
              }`}>
                <Clock className="h-4 w-4" />
                {countdown.expired
                  ? (isClientRequest ? 'Response window ended (still open)' : 'Deadline passed')
                  : `Respond by: ${countdown.text}`}
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600">
              <Users className="h-4 w-4" />
              {totalBidsCount || 0} bids received
            </div>
          </div>

          {clientInfo && (
            <div className="bg-blue-50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Client Information</h3>
              <div className="space-y-1 text-sm text-blue-800">
                {clientInfo.company && <p><Building2 className="inline h-4 w-4 mr-1" />{clientInfo.company}</p>}
                {clientInfo.name && <p><Users className="inline h-4 w-4 mr-1" />{clientInfo.name}</p>}
                {clientInfo.city && <p><MapPin className="inline h-4 w-4 mr-1" />{clientInfo.city}{clientInfo.state ? `, ${clientInfo.state}` : ''}</p>}
                {clientInfo.companySize && <p>Company Size: {clientInfo.companySize}</p>}
                {clientInfo.industry && <p>Industry: {clientInfo.industry}</p>}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Project Requirements</h3>
            <div className="space-y-2">
              {requirements?.totalSites > 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-2xl font-black text-orange-500">{requirements.totalSites.toLocaleString()}</span>
                  <span className="text-gray-600">sites / locations</span>
                </div>
              )}
              <p className="text-sm text-gray-600">
                Required engineers: <strong>{requiredEngineers}</strong>
              </p>
              {requirements?.cities?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {requirements.cities.map(city => (
                    <span key={city} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{city}</span>
                  ))}
                </div>
              )}
              {requirements?.description && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{requirements.description}</p>
              )}
              {requirements?.specialRequirements && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200">
                  Note: {requirements.specialRequirements}
                </p>
              )}
              {requirements?.contractDuration && (
                <p className="text-sm text-gray-600">Contract Duration: <strong>{requirements.contractDuration}</strong></p>
              )}
              {requirements?.startDate && (
                <p className="text-sm text-gray-600">
                  Expected Start: <strong>{new Date(requirements.startDate).toLocaleDateString('en-IN')}</strong>
                </p>
              )}
            </div>
          </div>

          {subServices?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Services Required</h3>
              <div className="flex flex-wrap gap-2">
                {subServices.map(svc => (
                  <span key={svc} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">{svc}</span>
                ))}
              </div>
            </div>
          )}

          {budget && (
            <div className="bg-green-50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-green-900 mb-1">Budget Range</h3>
              <p className="text-2xl font-bold text-green-700">{formatBudget(budget)}</p>
            </div>
          )}

          {description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Project Description</h3>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{description}</p>
            </div>
          )}

          {(rfqDocumentUrl || technicalSpecsUrl) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Documents</h3>
              <div className="flex gap-2">
                {rfqDocumentUrl && (
                  <a href={rfqDocumentUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                    <Download className="h-4 w-4" /> RFQ Document
                  </a>
                )}
                {technicalSpecsUrl && (
                  <a href={technicalSpecsUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                    <FileText className="h-4 w-4" /> Technical Specs
                  </a>
                )}
              </div>
            </div>
          )}

          {myBid && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-teal-900 mb-2">Your Submitted Bid</h3>
              <div className="space-y-1 text-sm text-teal-800">
                <p>Amount: <strong>₹{myBid.amount?.toLocaleString('en-IN')}</strong></p>
                <p>Timeline: {myBid.timeline} days</p>
                <p>Team: {myBid.teamSize} members</p>
                <p className="mt-2">Status: <span className="font-semibold capitalize">{bidStatus || myBid.status}</span></p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 border-t border-gray-100 pt-4 sticky bottom-0 bg-white space-y-2">
          {actionError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {actionError}
            </div>
          )}
          {kycPending && isOpen && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              KYC still pending — approved vendors can still bid/accept. Complete KYC for full access.
            </p>
          )}

          {/* Client request: Accept & Start Project (deadline soft — still allow accept) */}
          {isClientRequest && isOpen && !hasMyBid && !showBidForm && (
            <div className="flex flex-col gap-2">
              {opportunity.isMyTurnToRespond === false && (
                <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  This project is assigned to another vendor for review right now. You will be notified when it is your turn.
                </p>
              )}
              {opportunity.isMyTurnToRespond !== false && (
                <>
              {countdown?.expired && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Response SLA window ended — you can still accept this open client request.
                </p>
              )}
              <label className="block text-xs font-semibold text-gray-600">
                Confirm team size (required: {opportunity.assignment?.requiredEngineers || 1})
                <input
                  type="number"
                  min={1}
                  value={acceptTeamSize || String(opportunity.assignment?.requiredEngineers || 1)}
                  onChange={(e) => setAcceptTeamSize(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <button
                onClick={handleAcceptRequest}
                disabled={accepting}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-60"
              >
                <CheckCircle2 className="h-5 w-5" />
                {accepting ? 'Accepting...' : 'Accept & Start Project'}
              </button>
              <button
                type="button"
                onClick={handleDeclineRequest}
                disabled={declining}
                className="w-full py-2.5 border border-red-200 text-red-700 font-medium rounded-xl hover:bg-red-50 disabled:opacity-60"
              >
                {declining ? 'Declining…' : 'Reject / Pass'}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBidForm(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-blue-200 text-blue-700 font-medium rounded-xl hover:bg-blue-50"
                >
                  <Send className="h-4 w-4" /> Submit Quote First
                </button>
                <button
                  onClick={handleCreateProposal}
                  className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
                  title="Create Proposal"
                >
                  <FilePlus className="h-5 w-5" />
                </button>
              </div>
                </>
              )}
            </div>
          )}

          {/* Competitive: Submit Bid — hard deadline */}
          {isCompetitive && isOpen && !countdown?.expired && !hasMyBid && (
            <>
              {!showBidForm ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowBidForm(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700"
                  >
                    <Send className="h-5 w-5" />
                    Submit Your Bid
                  </button>
                  <button
                    onClick={handleCreateProposal}
                    className="px-4 py-3 border border-blue-200 text-blue-700 font-semibold rounded-xl hover:bg-blue-50"
                    title="Create Proposal"
                  >
                    <FilePlus className="h-5 w-5" />
                  </button>
                </div>
              ) : null}
            </>
          )}

          {showBidForm && isOpen && !hasMyBid && (isClientRequest || !countdown?.expired) && (
            <BidForm
              opportunityId={_id}
              type={type}
              onSuccess={(data) => {
                setShowBidForm(false);
                onBidSubmitted?.(data);
                triggerRefresh?.();
              }}
              onCancel={() => setShowBidForm(false)}
            />
          )}

          {/* After bid: confirm client award → Accepted Work + Project */}
          {hasMyBid && isOpen && bidStatus !== 'accepted' && status === 'open' && (
            <button
              onClick={handleConfirmAward}
              disabled={awarding}
              className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-60"
            >
              <Trophy className="h-5 w-5" />
              {awarding ? 'Confirming...' : 'Confirm Award (Client Accepted)'}
            </button>
          )}

          {hasMyBid && isOpen && (
            <p className="text-center text-sm text-teal-700 font-medium py-1">
              Bid submitted — open Proposals tab for linked quote
            </p>
          )}

          {countdown?.expired && !hasMyBid && isCompetitive && (
            <p className="text-center text-sm text-gray-500 py-2">Bid deadline has passed</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OpportunityDrawer;
