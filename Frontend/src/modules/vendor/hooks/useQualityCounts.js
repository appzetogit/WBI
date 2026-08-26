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

const useQualityCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchQCCounts();
      if (res.data?.success) setCounts(res.data.data);
    } catch (e) {
      console.warn('[QCCounts]', e.message);
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

export default useQualityCounts;
