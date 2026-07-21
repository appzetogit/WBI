import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

import AllWorkers from './AllWorkers';
import WorkerJobs from './WorkerJobs';
import WorkerAnalytics from './WorkerAnalytics';
import WorkerPayments from './WorkerPayments';
import WorkerVerifications from './WorkerVerifications';
import AdminHubTabs from '../../components/layout/AdminHubTabs';

const WORKER_TABS = [
  { to: 'all', label: 'All Workers', end: true },
  { to: 'jobs', label: 'Jobs' },
  { to: 'analytics', label: 'Analytics' },
  { to: 'payments', label: 'Payments' },
  { to: 'verifications', label: 'Verification' }
];

const Workers = () => {
  const location = useLocation();

  return (
    <div className="space-y-4">
      <AdminHubTabs basePath="/admin/workers" tabs={WORKER_TABS} />

      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="all" replace />} />
          <Route path="all" element={<AllWorkers />} />
          <Route path="jobs" element={<WorkerJobs />} />
          <Route path="analytics" element={<WorkerAnalytics />} />
          <Route path="payments" element={<WorkerPayments />} />
          <Route path="verifications" element={<WorkerVerifications />} />
        </Routes>
      </motion.div>
    </div>
  );
};

export default Workers;
