import React from 'react';
import { MapPin, Clock, Users, Building2, TrendingUp, Eye, Zap } from 'lucide-react';
import { formatBudget, deadlineCountdown, typeLabels, priorityConfig } from '../../services/businessIntakeService';

const OpportunityCard = ({ opportunity, onView, onBid, compact = false }) => {
  const {
    _id, title, type, categoryName, clientInfo, requirements,
    budget, deadline, priority, hasMyBid, myBidStatus, status
  } = opportunity;

  const typeInfo = typeLabels[type] || { label: type, color: 'bg-gray-100 text-gray-700' };
  const countdown = deadlineCountdown(deadline);
  const priorityInfo = priorityConfig[priority] || priorityConfig.normal;

  const borderColor = hasMyBid
    ? 'border-l-gray-400'
    : type === 'direct_invitation'
    ? 'border-l-amber-400'
    : countdown?.urgent
    ? 'border-l-red-400'
    : 'border-l-blue-500';

  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${borderColor} shadow-sm hover:shadow-md transition-all duration-200 p-5`}>
      {/* Top row: type badge + priority */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
          {priority !== 'normal' && (
            <span className={`text-xs font-semibold ${priorityInfo.color}`}>
              {priorityInfo.label}
            </span>
          )}
          {hasMyBid && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
              ✓ Bid Submitted
            </span>
          )}
          {status === 'awarded' && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              🏆 Awarded
            </span>
          )}
        </div>
        {countdown && !countdown.expired && (
          <span className={`text-xs font-semibold flex items-center gap-1 ${countdown.urgent ? 'text-red-600' : 'text-gray-500'}`}>
            <Clock className="h-3 w-3" />
            {countdown.text}
          </span>
        )}
        {countdown?.expired && (
          <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Expired
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-gray-900 font-semibold text-base leading-tight mb-1 line-clamp-2">{title}</h3>
      <p className="text-xs text-gray-500 mb-3">{categoryName}</p>

      {/* Details row */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-4">
        {clientInfo?.company && (
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3 text-gray-400" />
            {clientInfo.company}
          </span>
        )}
        {clientInfo?.name && !clientInfo?.company && (
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3 text-gray-400" />
            {clientInfo.name}
          </span>
        )}
        {requirements?.cities?.length > 0 && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3 text-gray-400" />
            {requirements.cities.slice(0, 2).join(', ')}
            {requirements.cities.length > 2 && ` +${requirements.cities.length - 2}`}
          </span>
        )}
        {requirements?.totalSites > 1 && (
          <span className="flex items-center gap-1 font-semibold text-orange-600">
            <Zap className="h-3 w-3" />
            {requirements.totalSites.toLocaleString()} sites
          </span>
        )}
        {budget && (
          <span className="flex items-center gap-1 font-semibold text-blue-700">
            <TrendingUp className="h-3 w-3" />
            {formatBudget(budget)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => onView?.(_id, opportunity)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Eye className="h-4 w-4" />
          View Details
        </button>
        {!hasMyBid && status === 'open' && type !== 'direct_invitation' && (
          <button
            onClick={() => onBid?.(_id, opportunity)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Submit Bid
          </button>
        )}
        {type === 'direct_invitation' && status === 'open' && !hasMyBid && (
          <button
            onClick={() => onBid?.(_id, opportunity)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors"
          >
            Respond
          </button>
        )}
        {hasMyBid && (
          <div className={`flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium rounded-lg capitalize ${
            myBidStatus === 'accepted' ? 'bg-green-100 text-green-700' :
            myBidStatus === 'rejected' ? 'bg-red-100 text-red-700' :
            myBidStatus === 'shortlisted' ? 'bg-blue-100 text-blue-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {myBidStatus === 'submitted' ? '⏳ Under Review' :
             myBidStatus === 'shortlisted' ? '🌟 Shortlisted' :
             myBidStatus === 'accepted' ? '🏆 Won!' :
             myBidStatus === 'rejected' ? '✗ Not Selected' :
             myBidStatus}
          </div>
        )}
      </div>
    </div>
  );
};

export default OpportunityCard;
