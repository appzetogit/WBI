import React from 'react';
import { Link } from 'react-router-dom';
import { Users, UserCheck, UsersRound, ClipboardList, CalendarOff, Clock, FileBadge, ArrowUpRight } from 'lucide-react';
import useWorkforceCounts from '../../../hooks/useWorkforceCounts';
import useVendorBasePath from '../../../hooks/useVendorBasePath';

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

const WorkforceStatCards = () => {
  const { counts, loading } = useWorkforceCounts();
  const { basePath } = useVendorBasePath();
  const b = `${basePath}/workforce`;
  const cards = [
    { icon: Users, label: 'Engineers', value: counts.totalEngineers, color: 'bg-blue-600', href: `${b}/engineers` },
    { icon: UserCheck, label: 'Available', value: counts.available, color: 'bg-emerald-600', href: `${b}/availability` },
    { icon: UsersRound, label: 'Active Teams', value: counts.activeTeams, color: 'bg-violet-600', href: `${b}/teams` },
    { icon: ClipboardList, label: 'Open Assignments', value: counts.openAssignments, color: 'bg-amber-500', href: `${b}/assignments` },
    { icon: Clock, label: 'Present Today', value: counts.presentToday, color: 'bg-indigo-600', href: `${b}/attendance` },
    { icon: CalendarOff, label: 'Pending Leave', value: counts.pendingLeave, color: 'bg-orange-500', href: `${b}/leave` },
    { icon: FileBadge, label: 'Cert Alerts', value: counts.expiringCerts, color: 'bg-red-500', href: `${b}/certifications` }
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
      {cards.map((c) => <Stat key={c.label} {...c} loading={loading} />)}
    </div>
  );
};

export default WorkforceStatCards;
