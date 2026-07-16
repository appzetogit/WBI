import React, { useState } from 'react';
import { X, MapPin, Clock, Users, Building2, TrendingUp, FileText, Download, Send } from 'lucide-react';
import { formatBudget, deadlineCountdown, typeLabels } from '../../../services/businessIntakeService';
import BidForm from './BidForm';

const OpportunityDrawer = ({ opportunity, onClose, onBidSubmitted }) => {
  const [showBidForm, setShowBidForm] = useState(false);

  if (!opportunity) return null;

  const {
    _id, title, type, categoryName, subServices, clientInfo,
    requirements, budget, deadline, priority, description,
    totalBidsCount, myBid, rfqDocumentUrl, technicalSpecsUrl, status
  } = opportunity;

  const typeInfo = typeLabels[type] || { label: type, color: 'bg-gray-100 text-gray-700' };
  const countdown = deadlineCountdown(deadline);
  const isOpen = status === 'open';
  const hasMyBid = !!myBid;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer panel */}
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            {priority === 'urgent' && <span className="text-xs font-bold text-red-600">🔴 Urgent</span>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">
          {/* Title */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{title}</h2>
            <p className="text-sm text-gray-500 mt-1">{categoryName}</p>
          </div>

          {/* Deadline + Bids */}
          <div className="flex gap-4">
            {countdown && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                countdown.expired ? 'bg-gray-100 text-gray-500' :
                countdown.urgent ? 'bg-red-50 text-red-700 border border-red-200' :
                'bg-blue-50 text-blue-700'
              }`}>
                <Clock className="h-4 w-4" />
                {countdown.expired ? 'Deadline passed' : `Deadline: ${countdown.text}`}
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600">
              <Users className="h-4 w-4" />
              {totalBidsCount || 0} bids received
            </div>
          </div>

          {/* Client Info */}
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

          {/* Requirements */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Project Requirements</h3>
            <div className="space-y-2">
              {requirements?.totalSites > 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-2xl font-black text-orange-500">{requirements.totalSites.toLocaleString()}</span>
                  <span className="text-gray-600">sites / locations</span>
                </div>
              )}
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
                  ⚠️ Special: {requirements.specialRequirements}
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

          {/* Sub-services */}
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

          {/* Budget */}
          {budget && (
            <div className="bg-green-50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-green-900 mb-1">Budget Range</h3>
              <p className="text-2xl font-bold text-green-700">{formatBudget(budget)}</p>
              <p className="text-xs text-green-600 mt-1">
                Type: {budget.type === 'per_site' ? 'Per Site' : budget.type === 'per_month' ? 'Per Month' : budget.type}
              </p>
            </div>
          )}

          {/* Description */}
          {description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Project Description</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
            </div>
          )}

          {/* RFQ Documents */}
          {(rfqDocumentUrl || technicalSpecsUrl) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Documents</h3>
              <div className="flex gap-2">
                {rfqDocumentUrl && (
                  <a href={rfqDocumentUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                    <Download className="h-4 w-4" /> RFQ Document
                  </a>
                )}
                {technicalSpecsUrl && (
                  <a href={technicalSpecsUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                    <FileText className="h-4 w-4" /> Technical Specs
                  </a>
                )}
              </div>
            </div>
          )}

          {/* My existing bid */}
          {myBid && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-teal-900 mb-2">Your Submitted Bid</h3>
              <div className="space-y-1 text-sm text-teal-800">
                <p>Amount: <strong>₹{myBid.amount?.toLocaleString('en-IN')}</strong></p>
                <p>Timeline: {myBid.timeline} days</p>
                <p>Team: {myBid.teamSize} members</p>
                <p className="mt-2">Status: <span className={`font-semibold capitalize ${
                  myBid.status === 'accepted' ? 'text-green-700' :
                  myBid.status === 'rejected' ? 'text-red-700' :
                  myBid.status === 'shortlisted' ? 'text-blue-700' :
                  'text-gray-700'
                }`}>{myBid.status}</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Bid Form or Action Buttons */}
        <div className="px-6 pb-6 border-t border-gray-100 pt-4 sticky bottom-0 bg-white">
          {!hasMyBid && isOpen && !countdown?.expired && type !== 'direct_invitation' && (
            <>
              {!showBidForm ? (
                <button
                  onClick={() => setShowBidForm(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                >
                  <Send className="h-5 w-5" />
                  Submit Your Bid
                </button>
              ) : (
                <BidForm
                  opportunityId={_id}
                  type={type}
                  onSuccess={(data) => { onBidSubmitted?.(data); setShowBidForm(false); onClose(); }}
                  onCancel={() => setShowBidForm(false)}
                />
              )}
            </>
          )}
          {countdown?.expired && !hasMyBid && (
            <p className="text-center text-sm text-gray-500 py-2">Bid deadline has passed</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OpportunityDrawer;
