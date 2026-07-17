import React, { useState, useEffect } from 'react';
import useBusinessIntakeCounts from '../hooks/useBusinessIntakeCounts';
import useClientsContractsCounts from '../hooks/useClientsContractsCounts';
import useProjectOpsCounts from '../hooks/useProjectOpsCounts';
import useWorkforceCounts from '../hooks/useWorkforceCounts';
import useResourcesCounts from '../hooks/useResourcesCounts';
import useQualityCounts from '../hooks/useQualityCounts';
import useFinanceCounts from '../hooks/useFinanceCounts';
import useGlobalCounts from '../hooks/useGlobalCounts';
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
  Handshake
} from 'lucide-react';

const DynamicSidebar = () => {
  const { sidebarSections, vendorProfile } = useVendorConfig();
  const [expandedSections, setExpandedSections] = useState({});
  const location = useLocation();
  const { counts } = useBusinessIntakeCounts();
  const { counts: ccCounts } = useClientsContractsCounts();
  const { counts: poCounts } = useProjectOpsCounts();
  const { counts: wfCounts } = useWorkforceCounts();
  const { counts: resCounts } = useResourcesCounts();
  const { counts: qcCounts } = useQualityCounts();
  const { counts: finCounts } = useFinanceCounts();
  const { counts: globalCounts } = useGlobalCounts();

  const vendorName = vendorProfile?.businessName || vendorProfile?.companyName || 'Vendor Portal';
  const vendorEmail = vendorProfile?.email || 'Dynamic Panel Active';
  const initials = vendorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'V';

  const toggleSection = (sectionName) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  const NAV_ITEMS = {
    'Dashboard': { path: '/vendor/dynamic/dashboard', icon: LayoutDashboard },
    'Business Intake': { 
      path: '/vendor/dynamic/business-intake', 
      icon: Briefcase,
      subItems: [
        { name: 'All Opportunities', path: '/vendor/dynamic/business-intake/all', badge: counts.allOpportunities },
        { name: 'Client Requests', path: '/vendor/dynamic/business-intake/requests', badge: counts.clientRequests },
        { name: 'B2B Opportunities', path: '/vendor/dynamic/business-intake/b2b', badge: counts.b2bOpportunities },
        { name: 'Bulk Requirements', path: '/vendor/dynamic/business-intake/bulk', badge: counts.bulkRequirements },
        { name: 'Bid / Quote Requests', path: '/vendor/dynamic/business-intake/rfq', badge: counts.bidQuoteRequests },
        { name: 'Direct Invitations', path: '/vendor/dynamic/business-intake/invitations', badge: counts.directInvitations, badgeRed: true },
        { name: 'Proposals & Quotations', path: '/vendor/dynamic/business-intake/proposals', badge: counts.proposalsPending },
        { name: 'Accepted Work', path: '/vendor/dynamic/business-intake/accepted', badge: counts.acceptedThisWeek }
      ]
    },
    'Clients & Contracts': {
      path: '/vendor/dynamic/clients',
      icon: Handshake,
      subItems: [
        { name: 'Individual Clients', path: '/vendor/dynamic/clients/individual', badge: ccCounts.individualClients },
        { name: 'B2B Clients', path: '/vendor/dynamic/clients/b2b', badge: ccCounts.b2bClients },
        { name: 'Conversations', path: '/vendor/dynamic/clients/conversations', badge: ccCounts.conversationsUnread, badgeRed: true },
        { name: 'Proposals', path: '/vendor/dynamic/clients/proposals', badge: ccCounts.proposalsPending },
        { name: 'Contracts', path: '/vendor/dynamic/clients/contracts', badge: ccCounts.activeContracts },
        { name: 'Scope Changes', path: '/vendor/dynamic/clients/scope-changes', badge: ccCounts.scopeChangesPending, badgeRed: true }
      ]
    },
    'Project Operations': { 
      path: '/vendor/dynamic/projects', 
      icon: FolderKanban,
      subItems: [
        { name: 'Project OS', path: '/vendor/dynamic/projects/os', badge: poCounts.activeProjects },
        { name: 'Sites & Locations', path: '/vendor/dynamic/projects/sites', badge: poCounts.activeSites },
        { name: 'Milestones & Tasks', path: '/vendor/dynamic/projects/milestones', badge: poCounts.openMilestones },
        { name: 'Dispatch Center', path: '/vendor/dynamic/projects/dispatch', badge: poCounts.availableEngineers },
        { name: 'Live Operations', path: '/vendor/dynamic/projects/live', badge: poCounts.liveJobs, badgeRed: true },
        { name: 'Calendar & Schedule', path: '/vendor/dynamic/projects/calendar', badge: poCounts.eventsToday }
      ]
    },
    'Workforce': { 
      path: '/vendor/dynamic/workforce', 
      icon: Users,
      subItems: [
        { name: 'Engineers', path: '/vendor/dynamic/workforce/engineers', badge: wfCounts.totalEngineers },
        { name: 'Project Teams', path: '/vendor/dynamic/workforce/teams', badge: wfCounts.activeTeams },
        { name: 'Team Structure', path: '/vendor/dynamic/workforce/structure' },
        { name: 'Skill Matrix', path: '/vendor/dynamic/workforce/skills' },
        { name: 'Assignments', path: '/vendor/dynamic/workforce/assignments', badge: wfCounts.openAssignments },
        { name: 'Availability', path: '/vendor/dynamic/workforce/availability', badge: wfCounts.available },
        { name: 'Attendance', path: '/vendor/dynamic/workforce/attendance', badge: wfCounts.presentToday },
        { name: 'Leave & Calendar', path: '/vendor/dynamic/workforce/leave', badge: wfCounts.pendingLeave },
        { name: 'Certifications', path: '/vendor/dynamic/workforce/certifications', badge: wfCounts.expiringCerts, badgeRed: true }
      ]
    },
    'Resources': { 
      path: '/vendor/dynamic/resources', 
      icon: Box,
      subItems: [
        { name: 'Capacity Center', path: '/vendor/dynamic/resources/capacity' },
        { name: 'Inventory', path: '/vendor/dynamic/resources/inventory', badge: resCounts.inventoryItems },
        { name: 'Tools & Equipment', path: '/vendor/dynamic/resources/tools', badge: resCounts.toolsAvailable },
        { name: 'Warehouses', path: '/vendor/dynamic/resources/warehouses', badge: resCounts.warehouses },
        { name: 'Installed Assets', path: '/vendor/dynamic/resources/assets', badge: resCounts.installedAssets }
      ]
    },
    'Quality & Control': { 
      path: '/vendor/dynamic/quality', 
      icon: ShieldCheck,
      subItems: [
        { name: 'Proof Review', path: '/vendor/dynamic/quality/proof', badge: qcCounts.proofPending },
        { name: 'QA & Rework', path: '/vendor/dynamic/quality/qa', badge: qcCounts.qaPending },
        { name: 'Client Approvals', path: '/vendor/dynamic/quality/client-approvals', badge: qcCounts.clientPending },
        { name: 'B2B Approvals', path: '/vendor/dynamic/quality/b2b-approvals', badge: qcCounts.b2bPending },
        { name: 'Issues & Risks', path: '/vendor/dynamic/quality/issues', badge: qcCounts.openIssues, badgeRed: true },
        { name: 'Change Requests', path: '/vendor/dynamic/quality/change-requests', badge: qcCounts.changePending },
        { name: 'Damage Incidents', path: '/vendor/dynamic/quality/damage', badge: qcCounts.openDamage, badgeRed: true }
      ]
    },
    'Finance': { 
      path: '/vendor/dynamic/finance', 
      icon: Wallet,
      subItems: [
        { name: 'Master Wallet', path: '/vendor/dynamic/finance/wallet' },
        { name: 'Client Receivables', path: '/vendor/dynamic/finance/client-receivables', badge: finCounts.clientPending },
        { name: 'B2B Receivables', path: '/vendor/dynamic/finance/b2b-receivables', badge: finCounts.b2bPending },
        { name: 'Quotations', path: '/vendor/dynamic/finance/quotations', badge: finCounts.quotations },
        { name: 'Invoices', path: '/vendor/dynamic/finance/invoices', badge: finCounts.invoicesDue, badgeRed: true },
        { name: 'Payment Milestones', path: '/vendor/dynamic/finance/milestones', badge: finCounts.milestonesDue }
      ]
    },
    'Performance': { path: '/vendor/dynamic/performance', icon: Activity },
    'Compliance': { path: '/vendor/dynamic/compliance', icon: FileCheck, badge: globalCounts.complianceAlerts },
    'Notifications': { path: '/vendor/dynamic/notifications', icon: Bell, badge: globalCounts.unreadNotifications, badgeRed: true },
    'Support': { path: '/vendor/dynamic/support', icon: HelpCircle, badge: globalCounts.openTickets },
    'Settings': { path: '/vendor/dynamic/settings', icon: Settings },
  };

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
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col transition-all duration-300">
      <div className="p-4 flex items-center justify-center border-b border-gray-800">
        <h2 className="text-lg font-bold tracking-wide text-white">
          WBI <span className="text-blue-400 font-normal text-sm">Vendor Portal</span>
        </h2>
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

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{vendorName}</p>
            <p className="text-xs text-gray-400 truncate">{vendorEmail}</p>
          </div>
        </div>
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
  );
};

export default DynamicSidebar;
