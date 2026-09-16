import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchResCounts } from '../services/resourcesOpsService';

const DEFAULT = {
  warehouses: 0,
  inventoryItems: 0,
  lowStock: 0,
  toolsAvailable: 0,
  toolsAssigned: 0,
  installedAssets: 0,
  underMaintenance: 0
};

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const START_DELAY   = 3500;           // stagger: fire 3.5 s after mount

const useResourcesCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);
  const retryRef = useRef(null);
  const retryDelay = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetchResCounts();
      if (res.data?.success) {
        setCounts(res.data.data);
        retryDelay.current = 0;
      }
    } catch (e) {
      if (e?.response?.status === 429) {
        const delay = Math.min(retryDelay.current ? retryDelay.current * 2 : 10000, POLL_INTERVAL);
        retryDelay.current = delay;
        clearTimeout(retryRef.current);
        retryRef.current = setTimeout(load, delay);
        console.warn('[ResCounts] 429 — retrying in', delay / 1000, 's');
      } else {
        console.warn('[ResCounts]', e.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const start = setTimeout(() => {
      load();
      ref.current = setInterval(load, POLL_INTERVAL);
    }, START_DELAY);
    return () => {
      clearTimeout(start);
      clearInterval(ref.current);
      clearTimeout(retryRef.current);
    };
  }, [load]);

  return { counts, loading, refresh: load };
};

export default useResourcesCounts;
