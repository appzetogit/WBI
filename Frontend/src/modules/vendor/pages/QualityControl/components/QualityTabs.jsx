import React from 'react';
import { NavLink } from 'react-router-dom';
import useQualityCounts from '../../../hooks/useQualityCounts';

const BASE = '/vendor/dynamic/quality';
const TABS = [
  { key: 'proof', label: 'Proof Review', path: `${BASE}/proof`, countKey: 'proofPending' },
  { key: 'qa', label: 'QA & Rework', path: `${BASE}/qa`, countKey: 'qaPending' },
  { key: 'client-approvals', label: 'Client Approvals', path: `${BASE}/client-approvals`, countKey: 'clientPending' },
  { key: 'b2b-approvals', label: 'B2B Approvals', path: `${BASE}/b2b-approvals`, countKey: 'b2bPending' },
  { key: 'issues', label: 'Issues & Risks', path: `${BASE}/issues`, countKey: 'openIssues', red: true },
  { key: 'change-requests', label: 'Change Requests', path: `${BASE}/change-requests`, countKey: 'changePending' },
  { key: 'damage', label: 'Damage Incidents', path: `${BASE}/damage`, countKey: 'openDamage', red: true }
];

const QualityTabs = () => {
  const { counts } = useQualityCounts();
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
              <span className={`ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full items-center justify-center ${
                tab.red ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {counts[tab.countKey]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default QualityTabs;
