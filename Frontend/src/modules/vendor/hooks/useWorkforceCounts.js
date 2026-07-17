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

const useWorkforceCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchWFCounts();
      if (res.data?.success) setCounts(res.data.data);
    } catch (e) {
      console.warn('[WFCounts]', e.message);
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

export default useWorkforceCounts;
