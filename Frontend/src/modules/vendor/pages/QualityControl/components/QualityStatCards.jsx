import React from 'react';
import { Link } from 'react-router-dom';
import { FileCheck, ClipboardCheck, UserCheck, Building2, AlertTriangle, GitPullRequest, ShieldAlert, ArrowUpRight } from 'lucide-react';
import useQualityCounts from '../../../hooks/useQualityCounts';

const Stat = ({ icon: Icon, label, value, color, href, loading }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      {href && (
        <Link to={href} className="text-xs text-blue-600 font-medium flex items-center gap-0.5">
          View <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
    </div>
    <div className="mt-3">
      {loading ? <div className="h-7 w-12 bg-gray-100 rounded animate-pulse" /> : (
        <p className="text-2xl font-bold text-gray-900">{value ?? 0}</p>
      )}
      <p className="text-xs text-gray-500 mt-0.5 font-medium">{label}</p>
    </div>
  </div>
);

const QualityStatCards = () => {
  const { counts, loading } = useQualityCounts();
  const b = '/vendor/dynamic/quality';
  const cards = [
    { icon: FileCheck, label: 'Proof Pending', value: counts.proofPending, color: 'bg-amber-500', href: `${b}/proof` },
    { icon: ClipboardCheck, label: 'QA Pending', value: counts.qaPending, color: 'bg-blue-600', href: `${b}/qa` },
    { icon: UserCheck, label: 'Client Approvals', value: counts.clientPending, color: 'bg-emerald-600', href: `${b}/client-approvals` },
    { icon: Building2, label: 'B2B Approvals', value: counts.b2bPending, color: 'bg-violet-600', href: `${b}/b2b-approvals` },
    { icon: AlertTriangle, label: 'Open Issues', value: counts.openIssues, color: 'bg-red-500', href: `${b}/issues` },
    { icon: GitPullRequest, label: 'Change Requests', value: counts.changePending, color: 'bg-indigo-600', href: `${b}/change-requests` },
    { icon: ShieldAlert, label: 'Open Damage', value: counts.openDamage, color: 'bg-orange-500', href: `${b}/damage` }
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
      {cards.map((c) => <Stat key={c.label} {...c} loading={loading} />)}
    </div>
  );
};

export default QualityStatCards;
