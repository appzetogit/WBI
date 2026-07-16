import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AllOpportunities from './AllOpportunities';
import ClientRequests from './ClientRequests';
import B2BOpportunities from './B2BOpportunities';
import BulkRequirements from './BulkRequirements';
import BidQuoteRequests from './BidQuoteRequests';
import DirectInvitations from './DirectInvitations';
import ProposalsQuotations from './ProposalsQuotations';
import AcceptedWork from './AcceptedWork';

const BusinessIntake = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="all" replace />} />
      <Route path="all" element={<AllOpportunities />} />
      <Route path="requests" element={<ClientRequests />} />
      <Route path="b2b" element={<B2BOpportunities />} />
      <Route path="bulk" element={<BulkRequirements />} />
      <Route path="rfq" element={<BidQuoteRequests />} />
      {/* Dynamic sidebar paths use "bids" but in router it was "rfq" - let's map both to be safe or just use rfq */}
      <Route path="bids" element={<Navigate to="../rfq" replace />} />
      
      <Route path="invitations" element={<DirectInvitations />} />
      <Route path="proposals" element={<ProposalsQuotations />} />
      <Route path="accepted" element={<AcceptedWork />} />
    </Routes>
  );
};

export default BusinessIntake;
