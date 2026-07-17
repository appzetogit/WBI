import React from 'react';
import { Outlet } from 'react-router-dom';
import { FolderKanban, RefreshCw } from 'lucide-react';
import { ProjectOpsProvider, useProjectOps } from '../context/ProjectOpsContext';
import ProjectOpsStatCards from './ProjectOpsStatCards';
import FilterBar from './FilterBar';
import ProjectOpsTabs from './ProjectOpsTabs';
import useProjectOpsCounts from '../../../hooks/useProjectOpsCounts';

const Inner = () => {
  const { triggerRefresh } = useProjectOps();
  const { refresh } = useProjectOpsCounts();
  const handleRefresh = () => { triggerRefresh(); refresh(); };

  return (
    <div className="min-h-full bg-gray-50/80">
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
                <FolderKanban className="h-5 w-5 text-white" />
              </span>
              Project Operations
            </h1>
            <p className="text-sm text-gray-500 mt-1.5 ml-[46px]">
              Execute projects — sites, milestones, dispatch, live ops & schedule. Driven by your registered services.
            </p>
          </div>
          <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
        <div className="mb-6"><ProjectOpsStatCards /></div>
        <div className="mb-4"><FilterBar onApply={triggerRefresh} /></div>
        <div className="bg-white rounded-t-xl border border-gray-200 border-b-0"><ProjectOpsTabs /></div>
        <div className="bg-white rounded-b-xl border border-gray-200 border-t-0 p-5 lg:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

const ProjectOpsLayout = () => (
  <ProjectOpsProvider>
    <Inner />
  </ProjectOpsProvider>
);

export default ProjectOpsLayout;
