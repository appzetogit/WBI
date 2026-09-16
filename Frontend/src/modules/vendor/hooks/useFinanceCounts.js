import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFinanceCounts } from '../services/financeService';

const EMPTY = {
  availableBalance: 0,
  escrowBalance: 0,
  clientPending: 0,
  b2bPending: 0,
  quotations: 0,
  invoicesDue: 0,
  milestonesDue: 0
};

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const START_DELAY   = 10500;           // stagger: fire 10.5 s after mount

const useFinanceCounts = () => {
  const [counts, setCounts] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);
  const retryRef = useRef(null);
  const retryDelay = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetchFinanceCounts();
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
        console.warn('[FinanceCounts] 429 — retrying in', delay / 1000, 's');
      } else {
        console.warn('[FinanceCounts]', error.message);
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

    const onLive = () => refresh();
    window.addEventListener('vendor-finance-updated', onLive);
    return () => {
      clearTimeout(start);
      clearInterval(timer.current);
      clearTimeout(retryRef.current);
      window.removeEventListener('vendor-finance-updated', onLive);
    };
  }, [refresh]);

  return { counts, loading, refresh };
};

export default useFinanceCounts;
