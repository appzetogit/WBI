import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import QualityLayout from './components/QualityLayout';
import ProofReview from './ProofReview';
import QARework from './QARework';
import ClientApprovals from './ClientApprovals';
import B2BApprovals from './B2BApprovals';
import IssuesRisks from './IssuesRisks';
import ChangeRequests from './ChangeRequests';
import DamageIncidents from './DamageIncidents';

const QualityControl = () => (
  <Routes>
    <Route element={<QualityLayout />}>
      <Route path="/" element={<Navigate to="proof" replace />} />
      <Route path="proof" element={<ProofReview />} />
      <Route path="qa" element={<QARework />} />
      <Route path="client-approvals" element={<ClientApprovals />} />
      <Route path="b2b-approvals" element={<B2BApprovals />} />
      <Route path="issues" element={<IssuesRisks />} />
      <Route path="change-requests" element={<ChangeRequests />} />
      <Route path="damage" element={<DamageIncidents />} />
    </Route>
  </Routes>
);

export default QualityControl;
