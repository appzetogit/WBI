import React from 'react';
import { Outlet } from 'react-router-dom';
import { Briefcase, RefreshCw } from 'lucide-react';
import { WorkspaceShell } from '../../../components/enterprise';
import { BusinessIntakeProvider, useBusinessIntake } from '../context/BusinessIntakeContext';
import KYCBanner from './KYCBanner';
import IntakeStatCards from './IntakeStatCards';
import FilterBar from './FilterBar';
import IntakeTabs from './IntakeTabs';
import RightPanel from './RightPanel';
import ProposalBuilderHost from './ProposalBuilderHost';
import { useVendorConfig } from '../../../context/VendorConfigContext';
import { useVendorCounts } from '../../../context/VendorCountsContext';

const BusinessIntakeLayoutInner = () => {
  const { vendorProfile, approvedServices = [] } = useVendorConfig() || {};
  const { triggerRefresh } = useBusinessIntake();
  const { businessIntake: { refresh: refreshCounts } } = useVendorCounts();

  const handleRefresh = () => {
    triggerRefresh();
    refreshCounts();
  };

  const services = (approvedServices || []).filter((s) => s.status !== 'suspended');
  const serviceLabel = services.length
    ? services.map((s) => `${s.categoryName} (${s.categoryCode})`).join(', ')
    : 'your registered services';

  const kycPending =
    vendorProfile?.complianceStatus?.kycStatus !== 'verified' &&
    vendorProfile?.complianceStatus !== 'verified' &&
    !vendorProfile?.kycVerified;

  return (
    <>
      <div className="px-6 lg:px-8 pt-6">
        <KYCBanner show={kycPending} />
      </div>
      <WorkspaceShell
        title={
          <>
            <span className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-white" />
            </span>
            Business Intake
          </>
        }
        subtitle={`Discover, bid, and accept opportunities matched to ${serviceLabel}.`}
        headerExtra={
          services.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {services.map((s) => (
                <span
                  key={s.categoryCode}
                  className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200"
                >
                  {s.categoryCode} · {s.categoryName}
                </span>
              ))}
            </div>
          ) : null
        }
        headerActions={
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
        kpiCards={<IntakeStatCards />}
        filterBar={<FilterBar onApply={triggerRefresh} />}
        tabs={<IntakeTabs />}
        rightRail={<RightPanel />}
      >
        <Outlet />
      </WorkspaceShell>
      <ProposalBuilderHost />
    </>
  );
};

const BusinessIntakeLayout = () => (
  <BusinessIntakeProvider>
    <BusinessIntakeLayoutInner />
  </BusinessIntakeProvider>
);

export default BusinessIntakeLayout;
