import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

import AllEngineers from './AllEngineers';
import EngineerJobs from './EngineerJobs';
import EngineerAnalytics from './EngineerAnalytics';
import EngineerPayments from './EngineerPayments';
import EngineerVerifications from './EngineerVerifications';
import EngineerCoupons from './EngineerCoupons';
import AdminHubTabs from '../../components/layout/AdminHubTabs';

const ENGINEER_TABS = [
  { to: 'all', label: 'All Engineers', end: true },
  { to: 'jobs', label: 'Jobs' },
  { to: 'analytics', label: 'Analytics' },
  { to: 'payments', label: 'Payments' },
  { to: 'coupons', label: 'Coupons & Offers' },
  { to: 'verifications', label: 'Verification' }
];

const Engineers = () => {
  const location = useLocation();

  return (
    <div className="space-y-4">
      <AdminHubTabs basePath="/admin/engineers" tabs={ENGINEER_TABS} />

      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="all" replace />} />
          <Route path="all" element={<AllEngineers />} />
          <Route path="jobs" element={<EngineerJobs />} />
          <Route path="analytics" element={<EngineerAnalytics />} />
          <Route path="payments" element={<EngineerPayments />} />
          <Route path="coupons" element={<EngineerCoupons />} />
          <Route path="verifications" element={<EngineerVerifications />} />
        </Routes>
      </motion.div>
    </div>
  );
};

export default Engineers;
