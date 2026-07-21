import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import useWorkforceCounts from '../../../hooks/useWorkforceCounts';
import useVendorBasePath from '../../../hooks/useVendorBasePath';

const WorkforceTabs = () => {
  const { counts } = useWorkforceCounts();
  const { basePath } = useVendorBasePath();
  const base = `${basePath}/workforce`;

  const tabs = useMemo(() => [
    { key: 'engineers', label: 'Engineers', path: `${base}/engineers`, countKey: 'totalEngineers' },
    { key: 'company-code', label: 'Company Code', path: `${base}/company-code` },
    { key: 'pending-approvals', label: 'Pending Approvals', path: `${base}/pending-approvals` },
    { key: 'linked-engineers', label: 'My Engineers', path: `${base}/linked-engineers` },
    { key: 'teams', label: 'Project Teams', path: `${base}/teams`, countKey: 'activeTeams' },
    { key: 'structure', label: 'Team Structure', path: `${base}/structure`, countKey: 'totalEngineers' },
    { key: 'skills', label: 'Skill Matrix', path: `${base}/skills`, countKey: 'totalEngineers' },
    { key: 'assignments', label: 'Assignments', path: `${base}/assignments`, countKey: 'openAssignments' },
    { key: 'availability', label: 'Availability', path: `${base}/availability`, countKey: 'available' },
    { key: 'attendance', label: 'Attendance', path: `${base}/attendance`, countKey: 'presentToday' },
    { key: 'leave', label: 'Leave & Calendar', path: `${base}/leave`, countKey: 'pendingLeave' },
    { key: 'certifications', label: 'Certifications', path: `${base}/certifications`, countKey: 'expiringCerts' }
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
            {tab.countKey && (counts[tab.countKey] || 0) > 0 && (
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

export default WorkforceTabs;
