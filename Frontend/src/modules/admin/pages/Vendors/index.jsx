import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

import AllVendors from './AllVendors';
import VendorBookings from './VendorBookings';
import VendorAnalytics from './VendorAnalytics';
import VendorPayments from './VendorPayments';
import VendorLedger from './VendorLedger';
import SettlementManagement from '../Settlements';
import VendorServicesPage from '../UserCategories/pages/VendorServicesPage';
import VendorPartsPage from '../UserCategories/pages/VendorPartsPage';
import ProjectTemplates from '../ProjectTemplates';
import AssignmentConfig from '../AssignmentConfig';
import ServiceManagement from '../ServiceManagement';
import FormBuilder from '../FormBuilder';
import AdminHubTabs from '../../components/layout/AdminHubTabs';

const VENDOR_TABS = [
  { to: 'all', label: 'All Vendors', end: true },
  { to: 'bookings', label: 'Bookings' },
  { to: 'analytics', label: 'Analytics' },
  { to: 'payments', label: 'Payments' },
  { to: 'settlements/pending', label: 'Settlements', activePrefix: 'settlements' },
  { to: 'service-management', label: 'Service Mgmt', activePrefix: 'service-management' },
  { to: 'services-catalog', label: 'Services' },
  { to: 'parts-catalog', label: 'Parts' },
  { to: 'project-templates', label: 'Templates', activePrefix: 'project-templates' },
  { to: 'assignment-engine', label: 'Assignment' },
  { to: 'form-builder', label: 'Forms' }
];

const Vendors = () => {
  const location = useLocation();

  return (
    <div className="space-y-4">
      <AdminHubTabs basePath="/admin/vendors" tabs={VENDOR_TABS} />

      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="all" replace />} />
          <Route path="all" element={<AllVendors />} />
          <Route path="bookings" element={<VendorBookings />} />
          <Route path="analytics" element={<VendorAnalytics />} />
          <Route path="payments" element={<VendorPayments />} />
          <Route path="settlements/vendor/:vendorId" element={<VendorLedger />} />
          <Route path="settlements/*" element={<SettlementManagement />} />
          <Route path="service-management" element={<ServiceManagement />} />
          <Route path="services-catalog" element={<VendorServicesPage />} />
          <Route path="parts-catalog" element={<VendorPartsPage />} />
          <Route path="project-templates/*" element={<ProjectTemplates />} />
          <Route path="assignment-engine" element={<AssignmentConfig />} />
          <Route path="form-builder" element={<FormBuilder />} />
        </Routes>
      </motion.div>
    </div>
  );
};

export default Vendors;
