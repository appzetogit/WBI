import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWFCounts } from '../services/workforceOpsService';

const DEFAULT = {
  totalEngineers: 0,
  available: 0,
  activeTeams: 0,
  openAssignments: 0,
  onLeave: 0,
  presentToday: 0,
  pendingLeave: 0,
  expiringCerts: 0
};

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const START_DELAY   = 17500;           // stagger: fire 17.5 s after mount

const useWorkforceCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);
  const retryRef = useRef(null);
  const retryDelay = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetchWFCounts();
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
        console.warn('[WFCounts] 429 — retrying in', delay / 1000, 's');
      } else {
        console.warn('[WFCounts]', e.message);
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

export default useWorkforceCounts;
