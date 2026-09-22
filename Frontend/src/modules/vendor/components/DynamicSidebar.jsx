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
  ClipboardList,
  Wrench,
  CalendarCheck,
  Receipt,
  BarChart3,
  LogOut,
  X
} from 'lucide-react';

const DynamicSidebar = ({ mobileOpen = false, onCloseMobile }) => {
  const { vendorProfile, primaryService } = useVendorConfig();
  const { basePath } = useVendorBasePath();
  const [expandedSections, setExpandedSections] = useState({});
  const location = useLocation();
  const { loggingOut, confirmOpen, openConfirm, closeConfirm, confirmLogout } = useVendorLogout();
  const {
    businessIntake: { counts },
    engineers: { counts: engCounts },
    global: { counts: globalCounts },
    jobs: { counts: jobCounts },
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
    const red = (n) => Boolean(n > 0);
    return {
      'Dashboard': { path: `${b}/dashboard`, icon: LayoutDashboard },
      'Jobs': {
        path: `${b}/jobs`,
        icon: Briefcase,
        // Same sections, order and counts as the Jobs page (backend TAB_STATES).
        subItems: [
          { name: 'All Jobs', path: `${b}/jobs?tab=all`, badge: jobCounts.all },
          { name: 'New Requests', path: `${b}/jobs?tab=new`, badge: jobCounts.new, badgeRed: red(jobCounts.new) },
          { name: 'Pending Assignment', path: `${b}/jobs?tab=pending_assignment`, badge: jobCounts.pending_assignment, badgeRed: red(jobCounts.pending_assignment) },
          { name: 'Assigned', path: `${b}/jobs?tab=assigned`, badge: jobCounts.assigned },
          { name: 'Accepted', path: `${b}/jobs?tab=accepted`, badge: jobCounts.accepted },
          { name: 'In Progress', path: `${b}/jobs?tab=in_progress`, badge: jobCounts.in_progress },
          { name: 'Completed', path: `${b}/jobs?tab=completed` },
          { name: 'Cancelled', path: `${b}/jobs?tab=cancelled` },
          { name: 'Rejected', path: `${b}/jobs?tab=rejected` }
        ]
      },
      'Engineers': {
        path: `${b}/engineers`,
        icon: Users,
        // Same sections and counts as the Engineers pages (backend vendorEngineers.service).
        subItems: [
          { name: 'All Engineers', path: `${b}/engineers?tab=all`, badge: engCounts.all },
          { name: 'Add Engineer', path: `${b}/engineers/add` },
          { name: 'Pending Engineers', path: `${b}/engineers?tab=pending`, badge: engCounts.pending, badgeRed: red(engCounts.pendingOnVendor) },
          { name: 'Active Engineers', path: `${b}/engineers?tab=active`, badge: engCounts.active },
          { name: 'Inactive Engineers', path: `${b}/engineers?tab=inactive` },
          { name: 'Engineer Skills', path: `${b}/engineers/skills` },
          { name: 'Engineer Availability', path: `${b}/engineers/availability`, badge: engCounts.availability?.available },
          { name: 'Engineer Performance', path: `${b}/engineers/performance` }
        ]
      },
      'Assignments': {
        path: `${b}/assignments`,
        icon: ClipboardList,
        subItems: [
          { name: 'Assign Job', path: `${b}/assignments`, badge: jobCounts.pending_assignment, badgeRed: red(jobCounts.pending_assignment) },
          { name: 'Bulk Assignment', path: `${b}/assignments/bulk` },
          { name: 'Assignment History', path: `${b}/assignments/history` },
          { name: 'Reassignment', path: `${b}/assignments/reassign` }
        ]
      },
      'Services': {
        path: `${b}/services`,
        icon: Wrench,
        subItems: [
          { name: 'My Services', path: `${b}/services` },
          { name: 'Service Coverage', path: `${b}/services/coverage` },
          { name: 'Service Keys', path: `${b}/services/keys` },
          { name: 'Service Areas', path: `${b}/services/areas` }
        ]
      },
      'Parts': {
        path: `${b}/parts`,
        icon: Box,
        subItems: [
          { name: 'Parts', path: `${b}/parts` },
          { name: 'Inventory', path: `${b}/parts/inventory` },
          { name: 'Required Parts', path: `${b}/parts/required` },
          { name: 'Used Parts', path: `${b}/parts/used` }
        ]
      },
      'Bookings': {
        path: `${b}/bookings?tab=user`,
        icon: CalendarCheck,
        badge: counts.clientRequests,
        badgeRed: red(counts.clientRequests)
      },
      'Payments': {
        path: `${b}/payments`,
        icon: Wallet,
        subItems: [
          { name: 'Job Payments', path: `${b}/payments` },
          { name: 'Earnings', path: `${b}/finance/earnings` },
          { name: 'Wallet / Ledger', path: `${b}/finance/wallet` },
          { name: 'Engineer Payments', path: `${b}/finance/engineer-payments` }
        ]
      },
      'Settlements': {
        path: `${b}/settlements`,
        icon: Receipt,
        subItems: [
          { name: 'Job Settlements', path: `${b}/settlements` },
          { name: 'Wallet Payouts', path: `${b}/finance/settlements` }
        ]
      },
      'Support': { path: `${b}/support`, icon: HelpCircle },
      'Analytics': { path: `${b}/analytics`, icon: BarChart3 },
      'Documents': { path: `${b}/documents`, icon: FileCheck },
      'Settings': { path: `${b}/settings`, icon: Settings },
      'Notifications': { path: `${b}/notifications`, icon: Bell, badge: globalCounts.unreadNotifications, badgeRed: true }
    };
  }, [basePath, counts, engCounts, globalCounts, jobCounts]);

  const sectionsToRender = useMemo(() => [
    'Dashboard', 'Jobs', 'Engineers', 'Assignments', 'Services', 'Parts', 'Bookings',
    'Payments', 'Settlements', 'Support', 'Analytics', 'Documents', 'Settings', 'Notifications'
  ], []);

  const pathOf = (to) => to.split('?')[0];

  // A sub-item with a query (?tab=x) is active only on that exact tab; "tab=all"
  // also matches the bare page. Sub-items without a query match their subtree.
  const isSubActive = (to) => {
    const [pathname, query] = to.split('?');
    if (!query) {
      const siblings = Object.values(NAV_ITEMS).flatMap((i) => i.subItems || []).map((si) => pathOf(si.path));
      const moreSpecific = siblings.some((sp) => sp !== pathname && sp.startsWith(`${pathname}/`) && location.pathname.startsWith(sp));
      return !moreSpecific && (location.pathname === pathname || location.pathname.startsWith(`${pathname}/`));
    }
    if (location.pathname !== pathname) return false;
    const have = new URLSearchParams(location.search);
    return [...new URLSearchParams(query)].every(([k, v]) => (have.get(k) || (k === 'tab' ? 'all' : null)) === v);
  };

  // Auto-expand the section that owns the current page
  useEffect(() => {
    sectionsToRender.forEach((section) => {
      const item = NAV_ITEMS[section];
      const paths = [item?.path, ...(item?.subItems || []).map((si) => si.path)].filter(Boolean).map(pathOf);
      if (item?.subItems && paths.some((pp) => location.pathname === pp || location.pathname.startsWith(`${pp}/`))) {
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
            const isActiveMain = location.pathname.startsWith(pathOf(item.path));

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
                        className={() =>
                          `flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            isSubActive(subItem.path)
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
