import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ClientsContractsLayout from './components/ClientsContractsLayout';
import IndividualClients from './IndividualClients';
import B2BClients from './B2BClients';
import Conversations from './Conversations';
import Proposals from './Proposals';
import Contracts from './Contracts';
import ScopeChanges from './ScopeChanges';

const ClientsContracts = () => (
  <Routes>
    <Route element={<ClientsContractsLayout />}>
      <Route path="/" element={<Navigate to="individual" replace />} />
      <Route path="individual" element={<IndividualClients />} />
      <Route path="b2b" element={<B2BClients />} />
      <Route path="conversations" element={<Conversations />} />
      <Route path="proposals" element={<Proposals />} />
      <Route path="contracts" element={<Contracts />} />
      <Route path="scope-changes" element={<ScopeChanges />} />
    </Route>
  </Routes>
);

export default ClientsContracts;
