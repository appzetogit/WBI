import React from 'react';
import {
  Building2, MapPin, IndianRupee, Briefcase, Shield, Users, Eye, FileText
} from 'lucide-react';
import { formatINR, statusColors } from '../../../services/clientsContractsService';

const B2BClientCard = ({ client, onView }) => {
  const sc = statusColors[client.status] || statusColors.active;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col h-full overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${sc}`}>{client.status}</span>
            {client.priority !== 'normal' && (
              <span className="text-[10px] font-bold uppercase text-orange-600">{client.priority}</span>
            )}
          </div>
          <h3 className="font-bold text-gray-900 text-base leading-snug">{client.company || client.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{client.industry} · {client.companySize || 'Enterprise'}</p>
        </div>
        <div className="h-10 w-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
          <Building2 className="h-5 w-5" />
        </div>
      </div>

      <div className="px-5 pb-3 space-y-2 text-sm text-gray-600">
        <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-gray-400" /> {(client.cities || [client.city]).filter(Boolean).slice(0, 3).join(', ')}</div>
        <div className="flex items-center gap-2"><Briefcase className="h-3.5 w-3.5 text-gray-400" /> {client.activeProjects || 0} running · {client.totalSites || 1} sites</div>
        <div className="flex items-center gap-2 font-semibold text-blue-700"><IndianRupee className="h-3.5 w-3.5" /> {formatINR(client.totalSpend)} total value</div>
        <div className="flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-gray-400" /> SLA: {client.slaTier || 'standard'}</div>
        {client.assignedTeam?.length > 0 && (
          <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-gray-400" /> {client.assignedTeam.map((t) => t.role).join(', ')}</div>
        )}
      </div>

      <div className="px-5 pb-3 flex flex-wrap gap-1.5">
        {(client.serviceCategoryNames || []).slice(0, 4).map((s) => (
          <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">{s}</span>
        ))}
      </div>

      {client.pendingPayments > 0 && (
        <div className="mx-5 mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Pending invoices: {formatINR(client.pendingPayments)}
        </div>
      )}

      <div className="mt-auto px-5 py-4 border-t border-gray-100 flex gap-2">
        <button onClick={() => onView?.(client)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
          <Eye className="h-4 w-4" /> Open
        </button>
        <button onClick={() => onView?.(client)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">
          <FileText className="h-4 w-4" /> Projects
        </button>
      </div>
    </div>
  );
};

export default B2BClientCard;
