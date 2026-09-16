/**
 * VendorCountsContext
 *
 * Centralises ALL sidebar-badge count hooks into a single React context so that
 * no matter how many components call `useBusinessIntakeCounts()` (or any other
 * count hook), only ONE polling interval and ONE API call exists per hook type.
 *
 * Previously each component instance created its own interval, causing 3×
 * BusinessIntakeCounts polls per minute and a cascade of 429 errors.
 */
import React, { createContext, useContext } from 'react';
import useBusinessIntakeCounts from '../hooks/useBusinessIntakeCounts';
import useClientsContractsCounts from '../hooks/useClientsContractsCounts';
import useProjectOpsCounts from '../hooks/useProjectOpsCounts';
import useWorkforceCounts from '../hooks/useWorkforceCounts';
import useResourcesCounts from '../hooks/useResourcesCounts';
import useQualityCounts from '../hooks/useQualityCounts';
import useFinanceCounts from '../hooks/useFinanceCounts';
import useGlobalCounts from '../hooks/useGlobalCounts';

const VendorCountsContext = createContext(null);

export const VendorCountsProvider = ({ children }) => {
  const businessIntake = useBusinessIntakeCounts();
  const clientsContracts = useClientsContractsCounts();
  const projectOps = useProjectOpsCounts();
  const workforce = useWorkforceCounts();
  const resources = useResourcesCounts();
  const quality = useQualityCounts();
  const finance = useFinanceCounts();
  const global = useGlobalCounts();

  return (
    <VendorCountsContext.Provider
      value={{ businessIntake, clientsContracts, projectOps, workforce, resources, quality, finance, global }}
    >
      {children}
    </VendorCountsContext.Provider>
  );
};

export const useVendorCounts = () => {
  const ctx = useContext(VendorCountsContext);
  if (!ctx) throw new Error('useVendorCounts must be used within VendorCountsProvider');
  return ctx;
};
