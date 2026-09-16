import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPOCounts } from '../services/projectOpsService';

const DEFAULT = {
  activeProjects: 0,
  activeSites: 0,
  openMilestones: 0,
  availableEngineers: 0,
  liveJobs: 0,
  eventsToday: 0
};

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const START_DELAY   = 21000;           // stagger: fire 21 s after mount

const useProjectOpsCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);
  const retryRef = useRef(null);
  const retryDelay = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetchPOCounts();
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
        console.warn('[POCounts] 429 — retrying in', delay / 1000, 's');
      } else {
        console.warn('[POCounts]', e.message);
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

export default useProjectOpsCounts;
