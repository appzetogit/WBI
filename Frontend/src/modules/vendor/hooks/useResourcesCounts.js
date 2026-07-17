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

const useResourcesCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchResCounts();
      if (res.data?.success) setCounts(res.data.data);
    } catch (e) {
      console.warn('[ResCounts]', e.message);
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

export default useResourcesCounts;
