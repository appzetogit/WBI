import React, { useState, useEffect, useMemo } from 'react';
import useBusinessIntakeCounts from '../hooks/useBusinessIntakeCounts';
import useClientsContractsCounts from '../hooks/useClientsContractsCounts';
import useProjectOpsCounts from '../hooks/useProjectOpsCounts';
import useWorkforceCounts from '../hooks/useWorkforceCounts';
import useResourcesCounts from '../hooks/useResourcesCounts';
import useQualityCounts from '../hooks/useQualityCounts';
import useFinanceCounts from '../hooks/useFinanceCounts';
import useGlobalCounts from '../hooks/useGlobalCounts';
import useVendorLogout from '../hooks/useVendorLogout';
import useVendorBasePath from '../hooks/useVendorBasePath';
import VendorLogoutConfirm from './VendorLogoutConfirm';
import { NavLink, useLocation } from 'react-router-dom';
import { useVendorConfig } from '../context/VendorConfigContext';
import {
  LayoutDashboard,
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
  const { counts } = useBusinessIntakeCounts();
  const { counts: ccCounts } = useClientsContractsCounts();
  const { counts: poCounts } = useProjectOpsCounts();
  const { counts: wfCounts } = useWorkforceCounts();
  const { counts: resCounts } = useResourcesCounts();
  const { counts: qcCounts } = useQualityCounts();
  const { counts: finCounts } = useFinanceCounts();
  const { counts: globalCounts } = useGlobalCounts();

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
    return {
    'Dashboard': { path: `${b}/dashboard`, icon: LayoutDashboard },
    'Business Intake': { 
      path: `${b}/business-intake`, 
      icon: Briefcase,
      subItems: [
        { name: 'All Opportunities', path: `${b}/business-intake/all`, badge: counts.allOpportunities },
        { name: 'Client Requests', path: `${b}/business-intake/requests`, badge: counts.clientRequests },
        { name: 'B2B Opportunities', path: `${b}/business-intake/b2b`, badge: counts.b2bOpportunities },
        { name: 'Bulk Requirements', path: `${b}/business-intake/bulk`, badge: counts.bulkRequirements },
        { name: 'Bid / Quote Requests', path: `${b}/business-intake/rfq`, badge: counts.bidQuoteRequests },
        { name: 'Direct Invitations', path: `${b}/business-intake/invitations`, badge: counts.directInvitations, badgeRed: true },
        { name: 'Proposals & Quotations', path: `${b}/business-intake/proposals`, badge: counts.proposalsPending },
        { name: 'Accepted Work', path: `${b}/business-intake/accepted`, badge: counts.acceptedThisWeek }
      ]
    },
    'Clients & Contracts': {
      path: `${b}/clients`,
      icon: Handshake,
      subItems: [
        { name: 'Individual Clients', path: `${b}/clients/individual`, badge: ccCounts.individualClients },
        { name: 'B2B Clients', path: `${b}/clients/b2b`, badge: ccCounts.b2bClients },
        { name: 'Conversations', path: `${b}/clients/conversations`, badge: ccCounts.conversationsUnread, badgeRed: true },
        { name: 'Proposals', path: `${b}/clients/proposals`, badge: ccCounts.proposalsPending },
        { name: 'Contracts', path: `${b}/clients/contracts`, badge: ccCounts.activeContracts },
        { name: 'Scope Changes', path: `${b}/clients/scope-changes`, badge: ccCounts.scopeChangesPending, badgeRed: true }
      ]
    },
    'Project Operations': { 
      path: `${b}/projects`, 
      icon: FolderKanban,
      subItems: [
        { name: 'Project OS', path: `${b}/projects/os`, badge: poCounts.activeProjects },
        { name: 'Sites & Locations', path: `${b}/projects/sites`, badge: poCounts.activeSites },
        { name: 'Milestones & Tasks', path: `${b}/projects/milestones`, badge: poCounts.openMilestones },
        { name: 'Dispatch Center', path: `${b}/projects/dispatch`, badge: poCounts.availableEngineers },
        { name: 'Live Operations', path: `${b}/projects/live`, badge: poCounts.liveJobs, badgeRed: true },
        { name: 'Calendar & Schedule', path: `${b}/projects/calendar`, badge: poCounts.eventsToday }
      ]
    },
    'Workforce': { 
      path: `${b}/workforce`, 
      icon: Users,
      subItems: [
        { name: 'Engineers', path: `${b}/workforce/engineers`, badge: wfCounts.totalEngineers },
        { name: 'Project Teams', path: `${b}/workforce/teams`, badge: wfCounts.activeTeams },
        { name: 'Team Structure', path: `${b}/workforce/structure` },
        { name: 'Skill Matrix', path: `${b}/workforce/skills` },
        { name: 'Assignments', path: `${b}/workforce/assignments`, badge: wfCounts.openAssignments },
        { name: 'Availability', path: `${b}/workforce/availability`, badge: wfCounts.available },
        { name: 'Attendance', path: `${b}/workforce/attendance`, badge: wfCounts.presentToday },
        { name: 'Leave & Calendar', path: `${b}/workforce/leave`, badge: wfCounts.pendingLeave },
        { name: 'Certifications', path: `${b}/workforce/certifications`, badge: wfCounts.expiringCerts, badgeRed: true }
      ]
    },
    'Resources': { 
      path: `${b}/resources`, 
      icon: Box,
      subItems: [
        { name: 'Capacity Center', path: `${b}/resources/capacity` },
        { name: 'Inventory', path: `${b}/resources/inventory`, badge: resCounts.inventoryItems },
        { name: 'Tools & Equipment', path: `${b}/resources/tools`, badge: resCounts.toolsAvailable },
        { name: 'Warehouses', path: `${b}/resources/warehouses`, badge: resCounts.warehouses },
        { name: 'Installed Assets', path: `${b}/resources/assets`, badge: resCounts.installedAssets }
      ]
    },
    'Quality & Control': { 
      path: `${b}/quality`, 
      icon: ShieldCheck,
      subItems: [
        { name: 'Proof Review', path: `${b}/quality/proof`, badge: qcCounts.proofPending },
        { name: 'QA & Rework', path: `${b}/quality/qa`, badge: qcCounts.qaPending },
        { name: 'Client Approvals', path: `${b}/quality/client-approvals`, badge: qcCounts.clientPending },
        { name: 'B2B Approvals', path: `${b}/quality/b2b-approvals`, badge: qcCounts.b2bPending },
        { name: 'Issues & Risks', path: `${b}/quality/issues`, badge: qcCounts.openIssues, badgeRed: true },
        { name: 'Change Requests', path: `${b}/quality/change-requests`, badge: qcCounts.changePending },
        { name: 'Damage Incidents', path: `${b}/quality/damage`, badge: qcCounts.openDamage, badgeRed: true }
      ]
    },
    'Finance': { 
      path: `${b}/finance`, 
      icon: Wallet,
      subItems: [
        { name: 'Master Wallet', path: `${b}/finance/wallet` },
        { name: 'Client Receivables', path: `${b}/finance/client-receivables`, badge: finCounts.clientPending },
        { name: 'B2B Receivables', path: `${b}/finance/b2b-receivables`, badge: finCounts.b2bPending },
        { name: 'Quotations', path: `${b}/finance/quotations`, badge: finCounts.quotations },
        { name: 'Invoices', path: `${b}/finance/invoices`, badge: finCounts.invoicesDue, badgeRed: true },
        { name: 'Payment Milestones', path: `${b}/finance/milestones`, badge: finCounts.milestonesDue }
      ]
    },
    'Performance': { path: `${b}/performance`, icon: Activity },
    'Compliance': { path: `${b}/compliance`, icon: FileCheck, badge: globalCounts.complianceAlerts },
    'Notifications': { path: `${b}/notifications`, icon: Bell, badge: globalCounts.unreadNotifications, badgeRed: true },
    'Support': { path: `${b}/support`, icon: HelpCircle, badge: globalCounts.openTickets },
    'Settings': { path: `${b}/settings`, icon: Settings },
  };
  }, [basePath, counts, ccCounts, poCounts, wfCounts, resCounts, qcCounts, finCounts, globalCounts]);

  // Auto-expand active section
  useEffect(() => {
    sidebarSections?.forEach((section) => {
      const item = NAV_ITEMS[section];
      if (item?.path && location.pathname.startsWith(item.path)) {
        setExpandedSections((prev) => ({ ...prev, [section]: true }));
      }
    });
  }, [location.pathname, sidebarSections]);

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
          {sidebarSections?.map((section) => {
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
