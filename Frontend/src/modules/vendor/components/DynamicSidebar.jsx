import React, { useState, useEffect, useMemo } from 'react';
import { useVendorCounts } from '../context/VendorCountsContext';
import useVendorLogout from '../hooks/useVendorLogout';
import useVendorBasePath from '../hooks/useVendorBasePath';
import VendorLogoutConfirm from './VendorLogoutConfirm';
import { NavLink, useLocation } from 'react-router-dom';
import { useVendorConfig } from '../context/VendorConfigContext';
import {
  LayoutDashboard,
  Inbox,
  Briefcase,
  FolderKanban,
  Users,
  Box,
  ShieldCheck,
  Wallet,
  Activity,
  FileCheck,
  Bell,
  HelpCircle,
  Settings,
  ChevronDown,
  ChevronRight,
  Handshake,
  LogOut,
  X
} from 'lucide-react';

const DynamicSidebar = ({ mobileOpen = false, onCloseMobile }) => {
  const { sidebarSections, vendorProfile, primaryService } = useVendorConfig();
  const { basePath } = useVendorBasePath();
  const [expandedSections, setExpandedSections] = useState({});
  const location = useLocation();
  const { loggingOut, confirmOpen, openConfirm, closeConfirm, confirmLogout } = useVendorLogout();
  const {
    businessIntake: { counts },
    clientsContracts: { counts: ccCounts },
    projectOps: { counts: poCounts },
    workforce: { counts: wfCounts },
    resources: { counts: resCounts },
    quality: { counts: qcCounts },
    finance: { counts: finCounts },
    global: { counts: globalCounts },
  } = useVendorCounts();

  const vendorName = vendorProfile?.businessName || vendorProfile?.companyName || 'Vendor Portal';
  const vendorEmail = vendorProfile?.email || vendorProfile?.phone || 'Partner account';
  const initials = vendorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'V';
  const serviceTag = primaryService?.categoryCode
    ? `${primaryService.categoryCode} · ${primaryService.categoryName}`
    : null;

  useEffect(() => {
    if (onCloseMobile) onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleSection = (sectionName) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  const NAV_ITEMS = useMemo(() => {
    const b = basePath;
    const newJobsCount = (counts.clientRequests || 0) + (counts.b2bOpportunities || 0);
    return {
      'Dashboard': { path: `${b}/dashboard`, icon: LayoutDashboard },
      'My Jobs': {
        path: `${b}/my-jobs`,
        icon: Briefcase,
        subItems: [
          { name: 'All Jobs', path: `${b}/my-jobs?tab=all` },
          { name: 'User Projects', path: `${b}/my-jobs?tab=user`, badge: counts.clientRequests, badgeRed: Boolean(counts.clientRequests > 0) },
          { name: 'B2B Jobs', path: `${b}/my-jobs?tab=b2b`, badge: counts.b2bOpportunities, badgeRed: Boolean(counts.b2bOpportunities > 0) },
          { name: 'In Progress', path: `${b}/my-jobs?status=in_progress`, badge: poCounts.liveJobs, badgeRed: Boolean(poCounts.liveJobs > 0) },
          { name: 'Completed', path: `${b}/my-jobs?status=completed` }
        ]
      },
      'Engineers': {
        path: `${b}/engineers`,
        icon: Users,
        subItems: [
          { name: 'Engineer List', path: `${b}/engineers?tab=all`, badge: wfCounts.totalEngineers },
          { name: 'Available', path: `${b}/engineers?tab=available`, badge: wfCounts.available },
          { name: 'Busy / On Job', path: `${b}/engineers?tab=busy`, badge: wfCounts.openAssignments, badgeRed: Boolean(wfCounts.openAssignments > 0) },
          { name: 'Skills', path: `${b}/engineers?tab=skills` }
        ]
      },
      'Finance': {
        path: `${b}/finance`,
        icon: Wallet,
        subItems: [
          { name: 'Earnings', path: `${b}/finance/earnings` },
          { name: 'Wallet / Ledger', path: `${b}/finance/wallet` },
          { name: 'Engineer Payments', path: `${b}/finance/engineer-payments` },
          { name: 'Settlements', path: `${b}/finance/settlements` }
        ]
      },
      'Notifications': { path: `${b}/notifications`, icon: Bell, badge: globalCounts.unreadNotifications, badgeRed: true }
    };
  }, [basePath, counts, poCounts, wfCounts, globalCounts]);

  const sectionsToRender = useMemo(() => {
    return ['Dashboard', 'My Jobs', 'Engineers', 'Finance', 'Notifications'];
  }, []);

  // Auto-expand active section
  useEffect(() => {
    sectionsToRender.forEach((section) => {
      const item = NAV_ITEMS[section];
      if (item?.path && location.pathname.startsWith(item.path)) {
        setExpandedSections((prev) => ({ ...prev, [section]: true }));
      }
    });
  }, [location.pathname, sectionsToRender, NAV_ITEMS]);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:z-auto ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
      <div className="p-4 flex items-center justify-between border-b border-gray-800">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-wide text-white">
            WBI <span className="text-blue-400 font-normal text-sm">Vendor Portal</span>
          </h2>
          {serviceTag && (
            <p className="text-[10px] text-blue-300/90 truncate mt-0.5 font-medium">{serviceTag}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
        <nav className="space-y-1 px-2">
          {sectionsToRender.map((section) => {
            const item = NAV_ITEMS[section];
            if (!item) return null;
            
            const Icon = item.icon;
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isExpanded = expandedSections[section];
            const isActiveMain = location.pathname.startsWith(item.path) || location.pathname === item.path;

            return (
              <div key={section} className="flex flex-col">
                <div 
                  onClick={() => hasSubItems ? toggleSection(section) : null}
                  className="w-full"
                >
                  <NavLink
                    to={hasSubItems ? '#' : item.path}
                    className={() =>
                      `flex items-center justify-between px-4 py-3 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                        (isActiveMain && !hasSubItems) || (hasSubItems && isExpanded)
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`
                    }
                  >
                    <div className="flex items-center">
                      <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                      {section}
                    </div>
                    {hasSubItems ? (
                      isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                    ) : item.badge > 0 ? (
                      <span className={`ml-2 min-w-[18px] h-[18px] text-[10px] font-bold flex items-center justify-center rounded-full px-1 ${
                        item.badgeRed ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'
                      }`}>
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    ) : null}
                  </NavLink>
                </div>
                
                {hasSubItems && isExpanded && (
                  <div className="ml-9 mt-1 space-y-1 border-l border-gray-700 pl-3">
                    {item.subItems.map((subItem) => (
                      <NavLink
                        key={subItem.name}
                        to={subItem.path}
                        className={({ isActive }) =>
                          `flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? 'text-white font-bold bg-gray-800'
                              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                          }`
                        }
                      >
                        <span>{subItem.name}</span>
                        {subItem.badge > 0 && (
                          <span className={`ml-2 min-w-[18px] h-[18px] text-[10px] font-bold flex items-center justify-center rounded-full px-1 ${
                            subItem.badgeRed ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'
                          }`}>
                            {subItem.badge > 99 ? '99+' : subItem.badge}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-gray-800 space-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{vendorName}</p>
            <p className="text-xs text-gray-400 truncate">{vendorEmail}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openConfirm}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 hover:text-red-200 transition-colors disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #111827; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #374151; 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4B5563; 
        }
      `}</style>
    </aside>

      <VendorLogoutConfirm
        open={confirmOpen}
        loggingOut={loggingOut}
        onCancel={closeConfirm}
        onConfirm={confirmLogout}
      />
    </>
  );
};

export default DynamicSidebar;
