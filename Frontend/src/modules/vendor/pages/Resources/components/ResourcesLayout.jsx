import React from 'react';
import { Outlet } from 'react-router-dom';
import { Box, RefreshCw } from 'lucide-react';
import { ResourcesProvider, useResourcesOps } from '../context/ResourcesContext';
import ResourcesStatCards from './ResourcesStatCards';
import FilterBar from './FilterBar';
import ResourcesTabs from './ResourcesTabs';
import useResourcesCounts from '../../../hooks/useResourcesCounts';

const Inner = () => {
  const { triggerRefresh } = useResourcesOps();
  const { refresh } = useResourcesCounts();

  const handleRefresh = React.useCallback(() => {
    triggerRefresh();
    refresh();
  }, [triggerRefresh, refresh]);

  React.useEffect(() => {
    const onOps = () => handleRefresh();
    window.addEventListener('vendorOpsUpdated', onOps);
    return () => window.removeEventListener('vendorOpsUpdated', onOps);
  }, [handleRefresh]);

  return (
    <div className="min-h-full bg-gray-50/80">
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
                <Box className="h-5 w-5 text-white" />
              </span>
              Resources
            </h1>
            <p className="text-sm text-gray-500 mt-1.5 ml-[46px]">
              Capacity, inventory, tools, warehouses & installed assets — driven by your registered services.
            </p>
          </div>
          <button type="button" onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
        <div className="mb-6"><ResourcesStatCards /></div>
        <div className="mb-4"><FilterBar onApply={triggerRefresh} /></div>
        <div className="bg-white rounded-t-xl border border-gray-200 border-b-0"><ResourcesTabs /></div>
        <div className="bg-white rounded-b-xl border border-gray-200 border-t-0 p-5 lg:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

const ResourcesLayout = () => (
  <ResourcesProvider>
    <Inner />
  </ResourcesProvider>
);

export default ResourcesLayout;
