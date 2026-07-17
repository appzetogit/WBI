import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import BusinessIntakeLayout from './components/BusinessIntakeLayout';
import OpportunityList from './components/OpportunityList';
import DirectInvitations from './DirectInvitations';
import ProposalsQuotations from './ProposalsQuotations';
import AcceptedWork from './AcceptedWork';
import BulkRequirements from './BulkRequirements';
import BidQuoteRequests from './BidQuoteRequests';
import { UserCircle, Building2 } from 'lucide-react';

const BusinessIntake = () => {
  return (
    <Routes>
      <Route element={<BusinessIntakeLayout />}>
        <Route path="/" element={<Navigate to="all" replace />} />
        <Route
          path="all"
          element={
            <OpportunityList
              emptyTitle="No opportunities found"
              emptyDescription="New opportunities matching your registered services will appear here."
            />
          }
        />
        <Route
          path="requests"
          element={
            <OpportunityList
              type="client_request"
              emptyIcon={UserCircle}
              emptyTitle="No client requests available"
              emptyDescription="New client requests matching your service categories will appear here."
            />
          }
        />
        <Route
          path="b2b"
          element={
            <OpportunityList
              type="b2b_opportunity"
              emptyIcon={Building2}
              emptyTitle="No B2B opportunities available"
              emptyDescription="Enterprise bulk opportunities from corporate clients will appear here."
            />
          }
        />
        <Route path="bulk" element={<BulkRequirements />} />
        <Route path="rfq" element={<BidQuoteRequests />} />
        <Route path="bids" element={<Navigate to="../rfq" replace />} />
        <Route path="invitations" element={<DirectInvitations />} />
        <Route path="proposals" element={<ProposalsQuotations />} />
        <Route path="accepted" element={<AcceptedWork />} />
      </Route>
    </Routes>
  );
};

export default BusinessIntake;
