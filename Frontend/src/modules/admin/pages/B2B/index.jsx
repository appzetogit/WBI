import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import B2BManagement from '../B2BManagement';
import B2BWallets from './B2BWallets';
import B2BInvoices from './B2BInvoices';
import B2BReports from './B2BReports';
import B2BSupport from './B2BSupport';
import B2BEnterpriseOnboardingAdmin from './B2BEnterpriseOnboarding';
import B2BOnboardingConfigPage from './B2BOnboardingConfig';
import B2BJobSubmissions from './B2BJobSubmissions';
import UnassignedQueue from './UnassignedQueue';
import B2BPricing from './B2BPricing';
import B2BContracts from './B2BContracts';
import B2BTransactions from './B2BTransactions';
import B2BSettings from './B2BSettings';

const B2BAdmin = () => (
  <Routes>
    <Route path="/" element={<Navigate to="companies" replace />} />
    <Route path="companies" element={<B2BManagement />} />
    <Route path="submissions" element={<B2BJobSubmissions />} />
    <Route path="unassigned" element={<UnassignedQueue />} />
    <Route path="onboarding" element={<B2BEnterpriseOnboardingAdmin />} />
    <Route path="onboarding/config" element={<B2BOnboardingConfigPage />} />
    <Route path="wallets" element={<B2BWallets />} />
    <Route path="invoices" element={<B2BInvoices />} />
    <Route path="reports" element={<B2BReports />} />
    <Route path="support" element={<B2BSupport />} />
    <Route path="pricing" element={<B2BPricing />} />
    <Route path="contracts" element={<B2BContracts />} />
    <Route path="transactions" element={<B2BTransactions />} />
    <Route path="settings" element={<B2BSettings />} />
    <Route path="*" element={<Navigate to="companies" replace />} />
  </Routes>
);

export default B2BAdmin;
