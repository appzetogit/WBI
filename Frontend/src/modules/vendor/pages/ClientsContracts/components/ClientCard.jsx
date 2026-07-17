import React from 'react';
import {
  MapPin, Star, Phone, MessageSquare, Eye, IndianRupee, Briefcase, Clock
} from 'lucide-react';
import { formatINR, timeAgo, statusColors } from '../../../services/clientsContractsService';

const ClientCard = ({ client, onView, onChat }) => {
  const sc = statusColors[client.status] || statusColors.active;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col h-full overflow-hidden group">
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center shrink-0">
            {(client.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 truncate group-hover:text-blue-700">{client.name}</h3>
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3" /> {client.city || '—'}{client.state ? `, ${client.state}` : ''}
            </p>
          </div>
        </div>
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border shrink-0 ${sc}`}>
          {client.status}
        </span>
      </div>

      <div className="px-5 pb-3 flex flex-wrap gap-1.5">
        {(client.serviceCategoryNames || []).slice(0, 3).map((s) => (
          <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{s}</span>
        ))}
      </div>

      <div className="px-5 pb-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
        <div className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5 text-gray-400" /> {client.activeProjects || 0} projects</div>
        <div className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-400" /> {client.rating?.toFixed?.(1) || '—'}</div>
        <div className="flex items-center gap-1.5 font-semibold text-blue-700"><IndianRupee className="h-3.5 w-3.5" /> {formatINR(client.totalSpend)}</div>
        <div className="flex items-center gap-1.5 text-amber-700">{client.pendingPayments > 0 ? `Pending ${formatINR(client.pendingPayments)}` : 'No dues'}</div>
      </div>

      <div className="px-5 pb-2 text-[11px] text-gray-400 flex items-center gap-1">
        <Clock className="h-3 w-3" /> Last activity {timeAgo(client.lastActivityAt)}
      </div>

      <div className="mt-auto px-5 py-4 border-t border-gray-100 flex gap-2">
        <button onClick={() => onView?.(client)} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
          <Eye className="h-3.5 w-3.5" /> View
        </button>
        {client.phone && (
          <a href={`tel:${client.phone}`} className="flex items-center justify-center px-2.5 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        <button onClick={() => onChat?.(client)} className="flex items-center justify-center px-2.5 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default ClientCard;
