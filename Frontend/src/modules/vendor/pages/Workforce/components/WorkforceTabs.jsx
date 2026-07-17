import React from 'react';
import { NavLink } from 'react-router-dom';
import useWorkforceCounts from '../../../hooks/useWorkforceCounts';

const BASE = '/vendor/dynamic/workforce';
const TABS = [
  { key: 'engineers', label: 'Engineers', path: `${BASE}/engineers`, countKey: 'totalEngineers' },
  { key: 'teams', label: 'Project Teams', path: `${BASE}/teams`, countKey: 'activeTeams' },
  { key: 'structure', label: 'Team Structure', path: `${BASE}/structure`, countKey: 'totalEngineers' },
  { key: 'skills', label: 'Skill Matrix', path: `${BASE}/skills`, countKey: 'totalEngineers' },
  { key: 'assignments', label: 'Assignments', path: `${BASE}/assignments`, countKey: 'openAssignments' },
  { key: 'availability', label: 'Availability', path: `${BASE}/availability`, countKey: 'available' },
  { key: 'attendance', label: 'Attendance', path: `${BASE}/attendance`, countKey: 'presentToday' },
  { key: 'leave', label: 'Leave & Calendar', path: `${BASE}/leave`, countKey: 'pendingLeave' },
  { key: 'certifications', label: 'Certifications', path: `${BASE}/certifications`, countKey: 'expiringCerts' }
];

const WorkforceTabs = () => {
  const { counts } = useWorkforceCounts();
  return (
    <div className="border-b border-gray-200 overflow-x-auto">
      <nav className="flex gap-1 min-w-max px-1">
        {TABS.map((tab) => (
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

export default WorkforceTabs;
