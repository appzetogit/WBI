import React from 'react';
import {
  MapPin,
  Clock,
  Users,
  Building2,
  IndianRupee,
  Eye,
  Bookmark,
  Wrench,
  CalendarDays,
} from 'lucide-react';
import {
  formatBudget,
  timeAgo,
  typeLabels,
  priorityConfig,
  getActionLabel,
} from '../../../services/businessIntakeService';

const OpportunityCard = ({
  opportunity,
  onView,
  onBid,
  onAccept,
  compact = false,
  bookmarked = false,
  onBookmark,
}) => {
  const {
    _id,
    title,
    type,
    categoryName,
    subServices = [],
    clientInfo,
    requirements,
    budget,
    deadline,
    priority,
    hasMyBid,
    myBidStatus,
    status,
    createdAt,
  } = opportunity;

  const typeInfo = typeLabels[type] || { label: type, color: 'bg-gray-100 text-gray-700', badge: type };
  const priorityInfo = priorityConfig[priority] || priorityConfig.normal;
  const actionLabel = getActionLabel(type);
  const clientName = clientInfo?.company || clientInfo?.name || '—';
  const location =
    requirements?.cities?.[0] ||
    clientInfo?.city ||
    (requirements?.cities?.length ? requirements.cities.join(', ') : '—');
  const duration =
    requirements?.contractDuration ||
    (deadline
      ? `${Math.max(1, Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24)))} Days`
      : '—');
  const engineerReq =
    requirements?.totalSites > 1
      ? `${requirements.totalSites} engineers`
      : requirements?.specialRequirements?.includes('engineer')
      ? '1+ engineers'
      : type === 'bulk_requirement'
      ? 'Team required'
      : null;

  const primaryHandler = type === 'client_request' ? onAccept : onBid;

  if (compact) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${typeInfo.color}`}>
              {typeInfo.badge || typeInfo.label}
            </span>
            <span className="text-xs text-gray-400">{timeAgo(createdAt)}</span>
          </div>
          <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{clientName} · {location} · {formatBudget(budget)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onView?.(_id, opportunity)}
            className="px-3 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            View
          </button>
          {!hasMyBid && status === 'open' && (
            <button
              onClick={() => primaryHandler?.(_id, opportunity)}
              className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col h-full overflow-hidden group">
      {/* Card Header */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${typeInfo.color}`}>
            {typeInfo.badge || typeInfo.label}
          </span>
          {priority !== 'normal' && (
            <span className={`text-[10px] font-bold uppercase ${priorityInfo.color}`}>
              {priorityInfo.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400 font-medium">{timeAgo(createdAt)}</span>
          <button
            onClick={() => onBookmark?.(_id)}
            className={`p-1 rounded-md transition-colors ${
              bookmarked ? 'text-blue-600' : 'text-gray-300 hover:text-gray-500'
            }`}
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            <Bookmark className={`h-4 w-4 ${bookmarked ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="px-5 pb-3">
        <h3 className="text-base font-bold text-gray-900 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
          {title}
        </h3>
        <p className="text-xs text-gray-500 mt-1">{categoryName}</p>
      </div>

      {/* Details Grid */}
      <div className="px-5 pb-3 space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <span className="truncate">{clientName}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <span className="truncate">{location}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <IndianRupee className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <span className="font-semibold text-blue-700">{formatBudget(budget)}</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
            {duration}
          </span>
          {engineerReq && (
            <span className="flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-gray-400" />
              {engineerReq}
            </span>
          )}
        </div>
      </div>

      {/* Skill Tags */}
      {subServices?.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {subServices.slice(0, 4).map((skill) => (
            <span
              key={skill}
              className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
            >
              {skill}
            </span>
          ))}
          {subServices.length > 4 && (
            <span className="text-[11px] text-gray-400">+{subServices.length - 4}</span>
          )}
        </div>
      )}

      {/* Status badges */}
      {(hasMyBid || status === 'awarded') && (
        <div className="px-5 pb-2">
          {hasMyBid && (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                myBidStatus === 'accepted'
                  ? 'bg-green-100 text-green-700'
                  : myBidStatus === 'rejected'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-teal-100 text-teal-700'
              }`}
            >
              {myBidStatus === 'submitted'
                ? 'Bid Submitted'
                : myBidStatus === 'shortlisted'
                ? 'Shortlisted'
                : myBidStatus === 'accepted'
                ? 'Won'
                : myBidStatus === 'rejected'
                ? 'Not Selected'
                : myBidStatus}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto px-5 py-4 border-t border-gray-100 flex gap-2">
        <button
          onClick={() => onView?.(_id, opportunity)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Eye className="h-4 w-4" />
          View Details
        </button>
        {!hasMyBid && status === 'open' && type !== 'direct_invitation' && (
          <button
            onClick={() => primaryHandler?.(_id, opportunity)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {actionLabel}
          </button>
        )}
        {type === 'direct_invitation' && status === 'open' && !hasMyBid && (
          <button
            onClick={() => onBid?.(_id, opportunity)}
            className="flex-1 flex items-center justify-center px-3 py-2.5 text-sm font-semibold text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors"
          >
            Respond
          </button>
        )}
        {hasMyBid && status === 'open' && (
          <div className="flex-1 flex items-center justify-center px-3 py-2.5 text-sm font-medium text-gray-500 bg-gray-50 rounded-lg">
            <Clock className="h-4 w-4 mr-1" />
            Under Review
          </div>
        )}
      </div>
    </div>
  );
};

export default OpportunityCard;
