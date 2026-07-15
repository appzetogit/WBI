import React, { useState } from 'react';
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
  const { sidebarSections } = useVendorConfig();
  const [expandedSections, setExpandedSections] = useState({});
  const location = useLocation();

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
        { name: 'All Opportunities', path: '/vendor/dynamic/business-intake/all' },
        { name: 'Client Requests', path: '/vendor/dynamic/business-intake/requests' },
        { name: 'B2B Opportunities', path: '/vendor/dynamic/business-intake/b2b' },
        { name: 'Bulk Requirements', path: '/vendor/dynamic/business-intake/bulk' },
        { name: 'Bid / Quote Requests', path: '/vendor/dynamic/business-intake/bids' },
        { name: 'Direct Invitations', path: '/vendor/dynamic/business-intake/invitations' },
        { name: 'Proposals & Quotations', path: '/vendor/dynamic/business-intake/proposals' },
        { name: 'Accepted Work', path: '/vendor/dynamic/business-intake/accepted' }
      ]
    },
    'Clients & Contracts': {
      path: '/vendor/dynamic/clients',
      icon: Handshake,
      subItems: [
        { name: 'Individual Clients', path: '/vendor/dynamic/clients/individual' },
        { name: 'B2B Clients', path: '/vendor/dynamic/clients/b2b' },
        { name: 'Conversations', path: '/vendor/dynamic/clients/conversations' },
        { name: 'Proposals', path: '/vendor/dynamic/clients/proposals' },
        { name: 'Contracts', path: '/vendor/dynamic/clients/contracts' },
        { name: 'Scope Changes', path: '/vendor/dynamic/clients/scope-changes' }
      ]
    },
    'Project Operations': { 
      path: '/vendor/dynamic/projects', 
      icon: FolderKanban,
      subItems: [
        { name: 'Project OS', path: '/vendor/dynamic/projects/os' },
        { name: 'Sites & Locations', path: '/vendor/dynamic/projects/sites' },
        { name: 'Milestones & Tasks', path: '/vendor/dynamic/projects/milestones' },
        { name: 'Dispatch Center', path: '/vendor/dynamic/projects/dispatch' },
        { name: 'Live Operations', path: '/vendor/dynamic/projects/live' },
        { name: 'Calendar & Schedule', path: '/vendor/dynamic/projects/calendar' }
      ]
    },
    'Workforce': { 
      path: '/vendor/dynamic/workforce', 
      icon: Users,
      subItems: [
        { name: 'Engineers', path: '/vendor/dynamic/workforce/engineers' },
        { name: 'Project Teams', path: '/vendor/dynamic/workforce/teams' },
        { name: 'Team Structure', path: '/vendor/dynamic/workforce/structure' },
        { name: 'Skill Matrix', path: '/vendor/dynamic/workforce/skills' },
        { name: 'Assignments', path: '/vendor/dynamic/workforce/assignments' },
        { name: 'Availability', path: '/vendor/dynamic/workforce/availability' },
        { name: 'Attendance', path: '/vendor/dynamic/workforce/attendance' },
        { name: 'Leave & Calendar', path: '/vendor/dynamic/workforce/leave' },
        { name: 'Certifications', path: '/vendor/dynamic/workforce/certifications' }
      ]
    },
    'Resources': { 
      path: '/vendor/dynamic/resources', 
      icon: Box,
      subItems: [
        { name: 'Capacity Center', path: '/vendor/dynamic/resources/capacity' },
        { name: 'Inventory', path: '/vendor/dynamic/resources/inventory' },
        { name: 'Tools & Equipment', path: '/vendor/dynamic/resources/tools' },
        { name: 'Warehouses', path: '/vendor/dynamic/resources/warehouses' },
        { name: 'Installed Assets', path: '/vendor/dynamic/resources/assets' }
      ]
    },
    'Quality & Control': { 
      path: '/vendor/dynamic/quality', 
      icon: ShieldCheck,
      subItems: [
        { name: 'Proof Review', path: '/vendor/dynamic/quality/proof' },
        { name: 'QA & Rework', path: '/vendor/dynamic/quality/qa' },
        { name: 'Client Approvals', path: '/vendor/dynamic/quality/client-approvals' },
        { name: 'B2B Approvals', path: '/vendor/dynamic/quality/b2b-approvals' },
        { name: 'Issues & Risks', path: '/vendor/dynamic/quality/issues' },
        { name: 'Change Requests', path: '/vendor/dynamic/quality/change-requests' },
        { name: 'Damage Incidents', path: '/vendor/dynamic/quality/damage' }
      ]
    },
    'Finance': { 
      path: '/vendor/dynamic/finance', 
      icon: Wallet,
      subItems: [
        { name: 'Master Wallet', path: '/vendor/dynamic/finance/wallet' },
        { name: 'Client Receivables', path: '/vendor/dynamic/finance/client-receivables' },
        { name: 'B2B Receivables', path: '/vendor/dynamic/finance/b2b-receivables' },
        { name: 'Quotations', path: '/vendor/dynamic/finance/quotations' },
        { name: 'Invoices', path: '/vendor/dynamic/finance/invoices' },
        { name: 'Payment Milestones', path: '/vendor/dynamic/finance/milestones' }
      ]
    },
    'Performance': { path: '/vendor/dynamic/performance', icon: Activity },
    'Compliance': { path: '/vendor/dynamic/compliance', icon: FileCheck },
    'Notifications': { path: '/vendor/dynamic/notifications', icon: Bell },
    'Support': { path: '/vendor/dynamic/support', icon: HelpCircle },
    'Settings': { path: '/vendor/dynamic/settings', icon: Settings },
  };

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col transition-all duration-300">
      <div className="p-4 flex items-center justify-center border-b border-gray-800">
        <h2 className="text-2xl font-bold tracking-wider text-blue-500">WBI<span className="text-white">Partner</span></h2>
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
                    {hasSubItems && (
                      isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                    )}
                  </NavLink>
                </div>
                
                {hasSubItems && isExpanded && (
                  <div className="ml-9 mt-1 space-y-1 border-l border-gray-700 pl-3">
                    {item.subItems.map((subItem) => (
                      <NavLink
                        key={subItem.name}
                        to={subItem.path}
                        className={({ isActive }) =>
                          `block px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? 'text-white font-bold bg-gray-800'
                              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                          }`
                        }
                      >
                        {subItem.name}
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
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center font-bold text-white">
              V
            </div>
          </div>
          <div className="ml-3 w-full">
            <p className="text-sm font-medium text-white truncate">Vendor Portal</p>
            <p className="text-xs font-medium text-gray-400">Dynamic Panel Active</p>
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
