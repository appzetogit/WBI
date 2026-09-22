import { useMemo } from 'react';
import { useVendorConfig } from '../../context/VendorConfigContext';

/** The vendor's approved services as { serviceKey, serviceName } (suspended ones excluded). */
const useTeamServices = () => {
  const { approvedServices = [] } = useVendorConfig() || {};
  return useMemo(() => {
    const seen = new Set();
    return approvedServices
      .filter((s) => s.categoryCode && s.status !== 'suspended')
      .map((s) => ({ serviceKey: String(s.categoryCode).toUpperCase(), serviceName: s.categoryName || s.categoryCode }))
      .filter((s) => !seen.has(s.serviceKey) && seen.add(s.serviceKey));
  }, [approvedServices]);
};

export default useTeamServices;
