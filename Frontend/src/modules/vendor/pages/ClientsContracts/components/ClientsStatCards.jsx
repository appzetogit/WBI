import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Building2, MessageSquare, FileText, FileSignature, GitBranch, ArrowUpRight } from 'lucide-react';
import useClientsContractsCounts from '../../../hooks/useClientsContractsCounts';

const StatCard = ({ icon: Icon, label, value, color, href, loading }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      {href && (
        <Link to={href} className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
          View <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
    </div>
    <div className="mt-4">
      {loading ? (
        <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-gray-900 tracking-tight">{value ?? 0}</p>
      )}
      <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
    </div>
  </div>
);

const ClientsStatCards = () => {
  const { counts, loading } = useClientsContractsCounts();
  const base = '/vendor/dynamic/clients';

  const cards = [
    { icon: Users, label: 'Individual Clients', value: counts.individualClients, color: 'bg-blue-600', href: `${base}/individual` },
    { icon: Building2, label: 'B2B Clients', value: counts.b2bClients, color: 'bg-violet-600', href: `${base}/b2b` },
    { icon: MessageSquare, label: 'Unread Chats', value: counts.conversationsUnread, color: 'bg-amber-500', href: `${base}/conversations` },
    { icon: FileText, label: 'Pending Proposals', value: counts.proposalsPending, color: 'bg-indigo-600', href: `${base}/proposals` },
    { icon: FileSignature, label: 'Active Contracts', value: counts.activeContracts, color: 'bg-emerald-600', href: `${base}/contracts` },
    { icon: GitBranch, label: 'Scope Pending', value: counts.scopeChangesPending, color: 'bg-orange-500', href: `${base}/scope-changes` }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} loading={loading} />
      ))}
    </div>
  );
};

export default ClientsStatCards;
