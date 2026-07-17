import React from 'react';
import { Outlet } from 'react-router-dom';
import { Briefcase, RefreshCw } from 'lucide-react';
import { BusinessIntakeProvider, useBusinessIntake } from '../context/BusinessIntakeContext';
import KYCBanner from './KYCBanner';
import IntakeStatCards from './IntakeStatCards';
import FilterBar from './FilterBar';
import IntakeTabs from './IntakeTabs';
import RightPanel from './RightPanel';
import { useVendorConfig } from '../../../context/VendorConfigContext';
import useBusinessIntakeCounts from '../../../hooks/useBusinessIntakeCounts';

const BusinessIntakeLayoutInner = () => {
  const { vendorProfile } = useVendorConfig() || {};
  const { triggerRefresh } = useBusinessIntake();
  const { refresh: refreshCounts } = useBusinessIntakeCounts();

  const handleRefresh = () => {
    triggerRefresh();
    refreshCounts();
  };

  const kycPending =
    vendorProfile?.complianceStatus?.kycStatus !== 'verified' &&
    vendorProfile?.complianceStatus !== 'verified' &&
    !vendorProfile?.kycVerified;

  return (
    <div className="min-h-full bg-gray-50/80">
      <div className="p-6 lg:p-8">
        <KYCBanner show={kycPending} />

        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-white" />
              </span>
              Business Intake
            </h1>
            <p className="text-sm text-gray-500 mt-1.5 ml-[46px]">
              Discover, bid, and accept opportunities matched to your registered services
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* Stat Cards */}
        <div className="mb-6">
          <IntakeStatCards />
        </div>

        {/* Filter Bar */}
        <div className="mb-4">
          <FilterBar onApply={triggerRefresh} />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-t-xl border border-gray-200 border-b-0">
          <IntakeTabs />
        </div>

        {/* Main workspace: content + right panel */}
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

const BusinessIntakeLayout = () => (
  <BusinessIntakeProvider>
    <BusinessIntakeLayoutInner />
  </BusinessIntakeProvider>
);

export default BusinessIntakeLayout;
