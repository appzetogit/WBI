import { useState, useEffect, useCallback, useRef } from 'react';
import { listJobs } from '../services/vendorJobsService';
import { useVendorSocket } from '../context/VendorSocketContext';

const DEFAULT = { all: 0, new: 0, pending_assignment: 0, assigned: 0, accepted: 0, in_progress: 0, completed: 0, cancelled: 0, rejected: 0, overdue: 0, active: 0 };
const POLL_INTERVAL = 5 * 60 * 1000;
const START_DELAY = 4000;

/**
 * Per-tab job counts for the sidebar badges, from GET /api/vendors/:id/jobs
 * (same counts the Jobs page shows). Refreshes on job socket events.
 */
const useJobCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const { socket } = useVendorSocket() || {};
  const debounce = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await listJobs({ tab: 'all', limit: 1 });
      if (res?.counts) setCounts(res.counts);
    } catch (e) {
      console.warn('[JobCounts]', e.message);
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
    const events = ['job:statusChanged', 'b2b:jobRequestReceived', 'vendor:jobNotice', 'vendor:jobOfferClosed'];
    const onEvent = () => {
      clearTimeout(debounce.current);
      debounce.current = setTimeout(load, 1500);
    };
    events.forEach((e) => socket.on(e, onEvent));
    return () => {
      clearTimeout(debounce.current);
      events.forEach((e) => socket.off?.(e, onEvent));
    };
  }, [socket, load]);

  return { counts, refresh: load };
};

export default useJobCounts;
