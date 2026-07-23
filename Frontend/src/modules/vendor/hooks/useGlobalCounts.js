import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGlobalCounts } from '../services/globalModulesService';

const EMPTY = { unreadNotifications: 0, openTickets: 0, complianceAlerts: 0 };

const useGlobalCounts = () => {
  const [counts, setCounts] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetchGlobalCounts();
      if (response.data?.success) setCounts(response.data.data);
    } catch (error) {
      console.warn('[GlobalCounts]', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 60000);

    const onUpdate = () => refresh();
    window.addEventListener('vendorNotificationsUpdated', onUpdate);
    window.addEventListener('focus', onUpdate);

    return () => {
      clearInterval(timer.current);
      window.removeEventListener('vendorNotificationsUpdated', onUpdate);
      window.removeEventListener('focus', onUpdate);
    };
  }, [refresh]);

  return { counts, loading, refresh };
};

export default useGlobalCounts;
