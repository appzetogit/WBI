import React from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import AllJobs from './AllJobs';
import Disputes from './Disputes';
import Refunds from './Refunds';
import AuditLogs from './AuditLogs';
import Roles from './Roles';
import Locations from './Locations';
import NotificationTemplates from './NotificationTemplates';
import VendorOfferings from './VendorOfferings';
import FinanceReports from './FinanceReports';
import { hasAdminPermission } from '../../utils/adminPermissions';

const CONTROL_CENTER_TABS = [
  ['jobs', 'All Jobs', 'jobs.read', AllJobs],
  ['disputes', 'Disputes', 'disputes.read', Disputes],
  ['refunds', 'Refunds', 'payments.read', Refunds],
  ['reports', 'Finance & B2B Reports', 'reports.read', FinanceReports],
  ['vendor-offerings', 'Vendor Offerings', 'vendors.read', VendorOfferings],
  ['locations', 'Locations', 'services.read', Locations],
  ['notification-templates', 'Notification Templates', 'notifications.read', NotificationTemplates],
  ['audit-logs', 'Audit Logs', 'audit.read', AuditLogs],
  ['roles', 'Roles & Permissions', 'admins.manage', Roles]
];

const ControlCenter = () => {
  const tabs = CONTROL_CENTER_TABS.filter(([, , perm]) => hasAdminPermission(perm));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {tabs.map(([path, label]) => (
          <NavLink key={path} to={`/admin/control-center/${path}`}
            className={({ isActive }) => `px-3 py-1.5 rounded-lg text-xs font-bold ${isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {label}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<Navigate to={tabs[0] ? tabs[0][0] : 'jobs'} replace />} />
        {tabs.map((tab) => { const Page = tab[3]; return <Route key={tab[0]} path={tab[0]} element={<Page />} />; })}
        <Route path="*" element={<p className="text-sm text-gray-500">You don&apos;t have access to this page.</p>} />
      </Routes>
    </div>
  );
};

export default ControlCenter;
