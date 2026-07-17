import React from 'react';
import { Outlet } from 'react-router-dom';
import { Handshake, RefreshCw } from 'lucide-react';
import { ClientsContractsProvider, useClientsContracts } from '../context/ClientsContractsContext';
import ClientsStatCards from './ClientsStatCards';
import FilterBar from './FilterBar';
import ClientsTabs from './ClientsTabs';
import RightPanel from './RightPanel';
import useClientsContractsCounts from '../../../hooks/useClientsContractsCounts';

const LayoutInner = () => {
  const { triggerRefresh } = useClientsContracts();
  const { refresh } = useClientsContractsCounts();

  const handleRefresh = () => {
    triggerRefresh();
    refresh();
  };

  return (
    <div className="min-h-full bg-gray-50/80">
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
                <Handshake className="h-5 w-5 text-white" />
              </span>
              Clients & Contracts
            </h1>
            <p className="text-sm text-gray-500 mt-1.5 ml-[46px]">
              Manage clients, conversations, proposals, contracts & scope — filtered by your registered services
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="mb-6">
          <ClientsStatCards />
        </div>

        <div className="mb-4">
          <FilterBar onApply={triggerRefresh} />
        </div>

        <div className="bg-white rounded-t-xl border border-gray-200 border-b-0">
          <ClientsTabs />
        </div>

        <div className="flex gap-6 bg-white rounded-b-xl border border-gray-200 border-t-0 p-5 lg:p-6">
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
          <RightPanel />
        </div>
      </div>
    </div>
  );
};

const ClientsContractsLayout = () => (
  <ClientsContractsProvider>
    <LayoutInner />
  </ClientsContractsProvider>
);

export default ClientsContractsLayout;
