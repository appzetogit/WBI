import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchQCCounts } from '../services/qualityControlService';

const DEFAULT = {
  proofPending: 0,
  qaPending: 0,
  clientPending: 0,
  b2bPending: 0,
  openIssues: 0,
  changePending: 0,
  openDamage: 0
};

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const START_DELAY   = 7000;           // stagger: fire 7 s after mount

const useQualityCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);
  const retryRef = useRef(null);
  const retryDelay = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetchQCCounts();
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
        console.warn('[QCCounts] 429 — retrying in', delay / 1000, 's');
      } else {
        console.warn('[QCCounts]', e.message);
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

export default useQualityCounts;
