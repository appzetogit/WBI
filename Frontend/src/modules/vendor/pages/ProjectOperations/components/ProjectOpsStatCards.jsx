import React from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, MapPin, ListChecks, Truck, Radio, Calendar, ArrowUpRight } from 'lucide-react';
import useProjectOpsCounts from '../../../hooks/useProjectOpsCounts';

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

const ProjectOpsStatCards = () => {
  const { counts, loading } = useProjectOpsCounts();
  const b = '/vendor/dynamic/projects';
  const cards = [
    { icon: FolderKanban, label: 'Active Projects', value: counts.activeProjects, color: 'bg-blue-600', href: `${b}/os` },
    { icon: MapPin, label: 'Active Sites', value: counts.activeSites, color: 'bg-emerald-600', href: `${b}/sites` },
    { icon: ListChecks, label: 'Open Milestones', value: counts.openMilestones, color: 'bg-violet-600', href: `${b}/milestones` },
    { icon: Truck, label: 'Available Engineers', value: counts.availableEngineers, color: 'bg-amber-500', href: `${b}/dispatch` },
    { icon: Radio, label: 'Live Jobs', value: counts.liveJobs, color: 'bg-red-500', href: `${b}/live` },
    { icon: Calendar, label: "Today's Events", value: counts.eventsToday, color: 'bg-indigo-600', href: `${b}/calendar` }
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((c) => <Stat key={c.label} {...c} loading={loading} />)}
    </div>
  );
};

export default ProjectOpsStatCards;
