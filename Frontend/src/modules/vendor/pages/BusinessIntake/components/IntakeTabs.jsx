import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useVendorCounts } from '../../../context/VendorCountsContext';
import useVendorBasePath from '../../../hooks/useVendorBasePath';

const IntakeTabs = () => {
  const { businessIntake: { counts } } = useVendorCounts();
  const { basePath } = useVendorBasePath();
  const base = `${basePath}/business-intake`;

  const tabs = useMemo(() => [
    { key: 'all', label: 'All Opportunities', path: `${base}/all`, countKey: 'allOpportunities' },
    { key: 'requests', label: 'Client Requests', path: `${base}/requests`, countKey: 'clientRequests' },
    { key: 'b2b', label: 'B2B Opportunities', path: `${base}/b2b`, countKey: 'b2bOpportunities' },
    { key: 'bulk', label: 'Bulk Requirements', path: `${base}/bulk`, countKey: 'bulkRequirements' },
    { key: 'rfq', label: 'Bid Requests', path: `${base}/rfq`, countKey: 'bidQuoteRequests' },
    { key: 'invitations', label: 'Invitations', path: `${base}/invitations`, countKey: 'directInvitations' },
    { key: 'proposals', label: 'Proposals', path: `${base}/proposals`, countKey: 'proposalsPending' },
    { key: 'accepted', label: 'Accepted Work', path: `${base}/accepted`, countKey: 'acceptedWork' },
  ], [base]);

  return (
    <div className="border-b border-gray-200 overflow-x-auto">
      <nav className="flex gap-1 min-w-max px-1" aria-label="Business Intake tabs">
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
            {(counts[tab.countKey] ?? counts[tab.countKey === 'acceptedWork' ? 'acceptedThisWeek' : tab.countKey]) > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-gray-100 text-gray-600">
                {counts[tab.countKey] ?? counts.acceptedThisWeek}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default IntakeTabs;
