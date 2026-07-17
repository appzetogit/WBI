import React from 'react';
import { NavLink } from 'react-router-dom';
import useClientsContractsCounts from '../../../hooks/useClientsContractsCounts';

const BASE = '/vendor/dynamic/clients';

const TABS = [
  { key: 'individual', label: 'Individual Clients', path: `${BASE}/individual`, countKey: 'individualClients' },
  { key: 'b2b', label: 'B2B Clients', path: `${BASE}/b2b`, countKey: 'b2bClients' },
  { key: 'conversations', label: 'Conversations', path: `${BASE}/conversations`, countKey: 'conversationsUnread' },
  { key: 'proposals', label: 'Proposals', path: `${BASE}/proposals`, countKey: 'proposalsPending' },
  { key: 'contracts', label: 'Contracts', path: `${BASE}/contracts`, countKey: 'activeContracts' },
  { key: 'scope-changes', label: 'Scope Changes', path: `${BASE}/scope-changes`, countKey: 'scopeChangesPending' }
];

const ClientsTabs = () => {
  const { counts } = useClientsContractsCounts();

  return (
    <div className="border-b border-gray-200 overflow-x-auto">
      <nav className="flex gap-1 min-w-max px-1" aria-label="Clients & Contracts tabs">
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
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-gray-100 text-gray-600">
                {counts[tab.countKey]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default ClientsTabs;
