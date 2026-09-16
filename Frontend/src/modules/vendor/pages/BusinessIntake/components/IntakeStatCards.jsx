import React, { useMemo } from 'react';
import { Briefcase, UserCircle, Building2, FileText, CheckCircle2 } from 'lucide-react';
import { useVendorCounts } from '../../../context/VendorCountsContext';
import useVendorBasePath from '../../../hooks/useVendorBasePath';
import StatCard from './StatCard';

const IntakeStatCards = () => {
  const { businessIntake: { counts, loading } } = useVendorCounts();
  const { basePath } = useVendorBasePath();
  const b = `${basePath}/business-intake`;

  const cards = useMemo(() => [
    { icon: Briefcase, label: 'Total Opportunities', value: counts.allOpportunities, color: 'bg-blue-600', href: `${b}/all` },
    { icon: UserCircle, label: 'Client Requests', value: counts.clientRequests, color: 'bg-emerald-600', href: `${b}/requests` },
    { icon: Building2, label: 'B2B Opportunities', value: counts.b2bOpportunities, color: 'bg-violet-600', href: `${b}/b2b` },
    { icon: FileText, label: 'Pending Quotes', value: counts.pendingQuotes ?? counts.proposalsPending, color: 'bg-amber-500', href: `${b}/proposals` },
    { icon: CheckCircle2, label: 'Accepted Work', value: counts.acceptedWork ?? counts.acceptedThisWeek, color: 'bg-teal-600', href: `${b}/accepted` },
  ], [b, counts]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <StatCard key={card.label} {...card} loading={loading} />
      ))}
    </div>
  );
};

export default IntakeStatCards;
