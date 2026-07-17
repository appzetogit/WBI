import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import DynamicSidebar from '../DynamicSidebar';
import { VendorConfigProvider, useVendorConfig } from '../../context/VendorConfigContext';
import { VendorSocketProvider } from '../../context/VendorSocketContext';
import { Bell, Search, Menu, CheckCircle2 } from 'lucide-react';

const HeaderBar = () => {
  const location = useLocation();
  const { vendorProfile } = useVendorConfig() || {};
  const isBusinessIntake = location.pathname.includes('/business-intake');
  const isClientsContracts = location.pathname.includes('/clients');
  const isProjectOps = location.pathname.includes('/dynamic/projects');
  const isWorkforce = location.pathname.includes('/dynamic/workforce');
  const isResources = location.pathname.includes('/dynamic/resources');
  const isQuality = location.pathname.includes('/dynamic/quality');
  const isFinance = location.pathname.includes('/dynamic/finance');
  const isPerformance = location.pathname.includes('/dynamic/performance');
  const isCompliance = location.pathname.includes('/dynamic/compliance');
  const isNotifications = location.pathname.includes('/dynamic/notifications');
  const isSupport = location.pathname.includes('/dynamic/support');
  const isSettings = location.pathname.includes('/dynamic/settings');

  const vendorName = vendorProfile?.businessName || vendorProfile?.companyName || 'Vendor Demo Pvt. Ltd.';
  const isVerified = vendorProfile?.complianceStatus?.kycStatus === 'verified' || vendorProfile?.kycVerified;
  const initials = vendorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'VD';

  const sectionTitle = isBusinessIntake
    ? 'Business Intake'
    : isClientsContracts
    ? 'Clients & Contracts'
    : isProjectOps
    ? 'Project Operations'
    : isWorkforce
    ? 'Workforce'
    : isResources
    ? 'Resources'
    : isQuality
    ? 'Quality & Control'
    : isFinance
    ? 'Finance'
    : isPerformance
    ? 'Performance'
    : isCompliance
    ? 'Compliance'
    : isNotifications
    ? 'Notifications'
    : isSupport
    ? 'Support'
    : isSettings
    ? 'Settings'
    : null;

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 z-10 shrink-0">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <button className="p-2 text-gray-500 hover:text-gray-700 lg:hidden" aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
        {sectionTitle ? (
          <div className="hidden sm:block">
            <p className="text-xs text-gray-400 font-medium">Vendor Portal</p>
            <p className="text-sm font-semibold text-gray-900">{sectionTitle}</p>
          </div>
        ) : (
          <div className="relative w-full max-w-md hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects, sites, engineers..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-gray-50"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Notifications">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold flex items-center justify-center rounded-full bg-red-500 text-white ring-2 ring-white">
            18
          </span>
        </button>

        <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-semibold text-gray-900 leading-tight">{vendorName}</p>
            {isVerified && (
              <p className="text-xs text-emerald-600 font-medium flex items-center justify-end gap-1">
                <CheckCircle2 className="h-3 w-3" /> Verified Vendor
              </p>
            )}
          </div>
          <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold cursor-pointer ring-2 ring-blue-100">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
};

const DynamicVendorLayout = () => {
  return (
    <VendorSocketProvider>
      <VendorConfigProvider>
        <div className="flex h-screen overflow-hidden bg-gray-50">
          <DynamicSidebar />

          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <HeaderBar />
            <main className="flex-1 overflow-y-auto">
              <Outlet />
            </main>
          </div>
        </div>
      </VendorConfigProvider>
    </VendorSocketProvider>
  );
};

export default DynamicVendorLayout;
