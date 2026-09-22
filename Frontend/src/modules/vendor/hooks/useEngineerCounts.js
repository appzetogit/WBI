import { useState, useEffect, useCallback, useRef } from 'react';
import { listEngineers } from '../services/vendorJobsService';
import { useVendorSocket } from '../context/VendorSocketContext';

const DEFAULT = {
  all: 0, pending: 0, active: 0, inactive: 0, pendingOnVendor: 0, pendingOnWbi: 0,
  availability: { available: 0, busy: 0, at_capacity: 0, on_leave: 0, off_today: 0, offline: 0 }
};
const POLL_INTERVAL = 5 * 60 * 1000;
const START_DELAY = 5000;

/**
 * Engineer section counts for the sidebar badges, from
 * GET /api/vendors/:id/engineers (same definitions as the Engineers pages).
 * Workload changes with jobs, so job events refresh it.
 */
const useEngineerCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const { socket } = useVendorSocket() || {};
  const debounce = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await listEngineers({ tab: 'all', limit: 1 });
      if (res?.counts) setCounts(res.counts);
    } catch (e) {
      console.warn('[EngineerCounts]', e.message);
    }
  }, []);

  useEffect(() => {
    let interval;
    const start = setTimeout(() => {
      load();
      interval = setInterval(load, POLL_INTERVAL);
    }, START_DELAY);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    if (!socket?.on) return undefined;
    const events = ['job:statusChanged', 'vendor:jobNotice'];
    const onEvent = () => {
      clearTimeout(debounce.current);
      debounce.current = setTimeout(load, 2000);
    };
    events.forEach((e) => socket.on(e, onEvent));
    return () => {
      clearTimeout(debounce.current);
      events.forEach((e) => socket.off?.(e, onEvent));
    };
  }, [socket, load]);

  return { counts, refresh: load };
};

export default useEngineerCounts;
