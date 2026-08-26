import React, { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import DynamicSidebar from '../DynamicSidebar';
import { VendorConfigProvider, useVendorConfig } from '../../context/VendorConfigContext';
import { VendorSocketProvider } from '../../context/VendorSocketContext';
import ServiceSlugGuard from '../ServiceSlugGuard';
import useVendorLogout from '../../hooks/useVendorLogout';
import VendorLogoutConfirm from '../VendorLogoutConfirm';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import {
  Bell,
  Search,
  Menu,
  CheckCircle2,
  ChevronDown,
  LogOut,
  Settings,
  User
} from 'lucide-react';

const HeaderBar = ({ onOpenMobileNav }) => {
  const location = useLocation();
  const { vendorProfile, primaryService } = useVendorConfig() || {};
  const { path } = useVendorBasePath();
  const { loggingOut, confirmOpen, openConfirm, closeConfirm, confirmLogout } = useVendorLogout();
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef(null);

  const p = location.pathname;
  const isBusinessIntake = p.includes('/business-intake');
  const isClientsContracts = p.includes('/clients');
  const isProjectOps = p.includes('/projects');
  const isWorkforce = p.includes('/workforce');
  const isResources = p.includes('/resources');
  const isQuality = p.includes('/quality');
  const isFinance = p.includes('/finance');
  const isPerformance = p.includes('/performance');
  const isCompliance = p.includes('/compliance');
  const isNotifications = p.includes('/notifications');
  const isSupport = p.includes('/support');
  const isSettings = p.includes('/settings');
  const isDashboard = p.endsWith('/dashboard') || /\/dashboard\/?$/.test(p);

  const vendorName = vendorProfile?.businessName || vendorProfile?.companyName || 'Vendor Portal';
  const vendorEmail = vendorProfile?.email || '';
  const isVerified = vendorProfile?.complianceStatus?.kycStatus === 'verified' || vendorProfile?.kycVerified;
  const initials = vendorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'V';
  const serviceLabel = primaryService?.categoryName || primaryService?.categoryCode || '';

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
    : isDashboard
    ? (serviceLabel ? `${serviceLabel} Dashboard` : 'Dashboard')
    : null;

  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  return (
    <>
      <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="p-2 text-gray-500 hover:text-gray-700 lg:hidden"
            aria-label="Open menu"
          >
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
          <Link
            to={path('notifications')}
            className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
          </Link>

          <button
            type="button"
            onClick={openConfirm}
            className="relative p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
            aria-label="Log Out"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden sm:inline text-sm font-semibold">Logout</span>
          </button>

          <div className="relative pl-4 border-l border-gray-200" ref={menuRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-3 rounded-lg hover:bg-gray-50 px-1.5 py-1 transition-colors"
              aria-expanded={profileOpen}
              aria-haspopup="menu"
            >
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{vendorName}</p>
                {isVerified ? (
                  <p className="text-xs text-emerald-600 font-medium flex items-center justify-end gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Verified Vendor
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 truncate max-w-[160px]">{vendorEmail || 'Account'}</p>
                )}
              </div>
              <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold ring-2 ring-blue-100">
                {initials}
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 hidden sm:block transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 origin-top-right"
              >
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-bold text-gray-900 truncate">{vendorName}</p>
                  {vendorEmail && <p className="text-xs text-gray-500 truncate mt-0.5">{vendorEmail}</p>}
                </div>
                <div className="py-1">
                  <Link
                    to={path('settings')}
                    role="menuitem"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <User className="mr-3 w-4 h-4 text-gray-400" /> Account
                  </Link>
                  <Link
                    to={path('settings')}
                    role="menuitem"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Settings className="mr-3 w-4 h-4 text-gray-400" /> Settings
                  </Link>
                </div>
                <div className="h-px bg-gray-100 my-1" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    openConfirm();
                  }}
                  disabled={loggingOut}
                  className="flex items-center w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left transition-colors disabled:opacity-60"
                >
                  <LogOut className="mr-3 w-4 h-4" />
                  {loggingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <VendorLogoutConfirm
        open={confirmOpen}
        loggingOut={loggingOut}
        onCancel={closeConfirm}
        onConfirm={confirmLogout}
      />
    </>
  );
};

const DynamicVendorLayout = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <VendorSocketProvider>
      <VendorConfigProvider>
        <ServiceSlugGuard>
          <div className="flex h-screen overflow-hidden bg-gray-50">
            <DynamicSidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <HeaderBar onOpenMobileNav={() => setMobileNavOpen(true)} />
              <main className="flex-1 overflow-y-auto">
                <Outlet />
              </main>
            </div>
          </div>
        </ServiceSlugGuard>
      </VendorConfigProvider>
    </VendorSocketProvider>
  );
};

export default DynamicVendorLayout;
