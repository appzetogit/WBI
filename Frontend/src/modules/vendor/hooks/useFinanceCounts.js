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

const useFinanceCounts = () => {
  const [counts, setCounts] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetchFinanceCounts();
      if (response.data?.success) setCounts(response.data.data);
    } catch (error) {
      console.warn('[FinanceCounts]', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 60000);
    const onLive = () => refresh();
    window.addEventListener('vendor-finance-updated', onLive);
    return () => {
      clearInterval(timer.current);
      window.removeEventListener('vendor-finance-updated', onLive);
    };
  }, [refresh]);

  return { counts, loading, refresh };
};

export default useFinanceCounts;
