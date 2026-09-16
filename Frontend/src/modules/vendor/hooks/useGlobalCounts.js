import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGlobalCounts } from '../services/globalModulesService';

const EMPTY = { unreadNotifications: 0, openTickets: 0, complianceAlerts: 0 };

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const START_DELAY   = 14000;           // stagger: fire 14 s after mount
const FOCUS_DEBOUNCE = 5000;           // prevent focus spam (tab switch)

const useGlobalCounts = () => {
  const [counts, setCounts] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);
  const retryRef = useRef(null);
  const focusDebRef = useRef(null);
  const retryDelay = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetchGlobalCounts();
      if (response.data?.success) {
        setCounts(response.data.data);
        retryDelay.current = 0;
      }
    } catch (error) {
      if (error?.response?.status === 429) {
        const delay = Math.min(retryDelay.current ? retryDelay.current * 2 : 10000, POLL_INTERVAL);
        retryDelay.current = delay;
        clearTimeout(retryRef.current);
        retryRef.current = setTimeout(refresh, delay);
        console.warn('[GlobalCounts] 429 — retrying in', delay / 1000, 's');
      } else {
        console.warn('[GlobalCounts]', error.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const start = setTimeout(() => {
      refresh();
      timer.current = setInterval(refresh, POLL_INTERVAL);
    }, START_DELAY);

    const onUpdate = () => refresh();
    // Debounce focus events so rapid tab switching doesn't spam API calls
    const onFocus = () => {
      clearTimeout(focusDebRef.current);
      focusDebRef.current = setTimeout(refresh, FOCUS_DEBOUNCE);
    };

    window.addEventListener('vendorNotificationsUpdated', onUpdate);
    window.addEventListener('focus', onFocus);

    return () => {
      clearTimeout(start);
      clearInterval(timer.current);
      clearTimeout(retryRef.current);
      clearTimeout(focusDebRef.current);
      window.removeEventListener('vendorNotificationsUpdated', onUpdate);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return { counts, loading, refresh };
};

export default useGlobalCounts;
