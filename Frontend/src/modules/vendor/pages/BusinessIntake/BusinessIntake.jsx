import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AllOpportunities from './AllOpportunities';

// Temporary placeholder for unbuilt pages
const Placeholder = ({ title }) => (
  <div className="p-6 bg-gray-50 min-h-screen">
    <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
    <p className="text-gray-500 mt-2">This module is currently being built as per the implementation plan.</p>
  </div>
);

const BusinessIntake = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="all" replace />} />
      <Route path="all" element={<AllOpportunities />} />
      <Route path="requests" element={<Placeholder title="Client Requests" />} />
      <Route path="b2b" element={<Placeholder title="B2B Opportunities" />} />
      <Route path="bulk" element={<Placeholder title="Bulk Requirements" />} />
      <Route path="rfq" element={<Placeholder title="Bid / Quote Requests" />} />
      <Route path="invitations" element={<Placeholder title="Direct Invitations" />} />
      <Route path="proposals" element={<Placeholder title="Proposals & Quotations" />} />
      <Route path="accepted" element={<Placeholder title="Accepted Work" />} />
    </Routes>
  );
};

export default BusinessIntake;
