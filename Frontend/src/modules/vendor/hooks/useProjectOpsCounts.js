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

const useProjectOpsCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchPOCounts();
      if (res.data?.success) setCounts(res.data.data);
    } catch (e) {
      console.warn('[POCounts]', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    ref.current = setInterval(load, 60000);
    return () => clearInterval(ref.current);
  }, [load]);

  return { counts, loading, refresh: load };
};

export default useProjectOpsCounts;
