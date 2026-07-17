import React from 'react';
import { Outlet } from 'react-router-dom';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { QualityProvider, useQuality } from '../context/QualityContext';
import QualityStatCards from './QualityStatCards';
import FilterBar from './FilterBar';
import QualityTabs from './QualityTabs';
import useQualityCounts from '../../../hooks/useQualityCounts';

const Inner = () => {
  const { triggerRefresh } = useQuality();
  const { refresh } = useQualityCounts();
  const handleRefresh = () => { triggerRefresh(); refresh(); };

  return (
    <div className="min-h-full bg-gray-50/80">
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-white" />
              </span>
              Quality & Control
            </h1>
            <p className="text-sm text-gray-500 mt-1.5 ml-[46px]">
              Proof, QA, approvals, issues, change requests & damage — validate before closure & payment.
            </p>
          </div>
          <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
        <div className="mb-6"><QualityStatCards /></div>
        <div className="bg-white rounded-t-xl border border-gray-200 border-b-0"><QualityTabs /></div>
        <div className="bg-white rounded-b-xl border border-gray-200 border-t-0 p-5 lg:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

const QualityLayout = () => (
  <QualityProvider>
    <Inner />
  </QualityProvider>
);

export default QualityLayout;
