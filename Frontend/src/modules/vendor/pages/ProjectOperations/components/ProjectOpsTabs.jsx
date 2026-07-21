import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import useProjectOpsCounts from '../../../hooks/useProjectOpsCounts';
import useVendorBasePath from '../../../hooks/useVendorBasePath';

const ProjectOpsTabs = () => {
  const { counts } = useProjectOpsCounts();
  const { basePath } = useVendorBasePath();
  const base = `${basePath}/projects`;

  const tabs = useMemo(() => [
    { key: 'os', label: 'Project OS', path: `${base}/os`, countKey: 'activeProjects' },
    { key: 'sites', label: 'Sites & Locations', path: `${base}/sites`, countKey: 'activeSites' },
    { key: 'milestones', label: 'Milestones & Tasks', path: `${base}/milestones`, countKey: 'openMilestones' },
    { key: 'dispatch', label: 'Dispatch Center', path: `${base}/dispatch`, countKey: 'availableEngineers' },
    { key: 'live', label: 'Live Operations', path: `${base}/live`, countKey: 'liveJobs' },
    { key: 'calendar', label: 'Calendar & Schedule', path: `${base}/calendar`, countKey: 'eventsToday' }
  ], [base]);

  return (
    <div className="border-b border-gray-200 overflow-x-auto">
      <nav className="flex gap-1 min-w-max px-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.path}
            end
            className={({ isActive }) =>
              `relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'text-blue-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-600'
                  : 'text-gray-500 hover:text-gray-800'
              }`
            }
          >
            {tab.label}
            {(counts[tab.countKey] || 0) > 0 && (
              <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-gray-100 text-gray-600 items-center justify-center">
                {counts[tab.countKey]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default ProjectOpsTabs;
