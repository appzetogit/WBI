import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PaymentOverview from './PaymentOverview';
import WorkerPayments from './WorkerPayments';
import VendorPayments from './VendorPayments';
import UserPayments from './UserPayments';
import PaymentReports from './PaymentReports';
import AdminRevenue from './AdminRevenue';
import PaymentConfig from './PaymentConfig';
import AdminHubTabs from '../../components/layout/AdminHubTabs';

const PAYMENT_TABS = [
  { to: 'overview', label: 'Overview', end: true },
  { to: 'users', label: 'Users' },
  { to: 'workers', label: 'Workers' },
  { to: 'vendors', label: 'Vendors' },
  { to: 'revenue', label: 'Revenue' },
  { to: 'reports', label: 'Reports' },
  { to: 'config', label: 'Config' }
];

const Payments = () => {
  return (
    <div className="space-y-6">
      <AdminHubTabs basePath="/admin/payments" tabs={PAYMENT_TABS} />
      <div className="min-h-[400px]">
        <Routes>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<PaymentOverview />} />
          <Route path="users" element={<UserPayments />} />
          <Route path="workers" element={<WorkerPayments />} />
          <Route path="vendors" element={<VendorPayments />} />
          <Route path="revenue" element={<AdminRevenue />} />
          <Route path="reports" element={<PaymentReports />} />
          <Route path="config" element={<PaymentConfig />} />
          <Route path="*" element={<Navigate to="overview" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default Payments;
