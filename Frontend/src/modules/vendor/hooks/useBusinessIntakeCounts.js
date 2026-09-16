/**
 * useBusinessIntakeCounts
 * Fetches sidebar badge counts every 5 minutes (staggered by 0 s offset).
 * Socket events are debounced so a burst of events causes only one refresh.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCounts } from '../services/businessIntakeService';
import { useVendorSocket } from '../context/VendorSocketContext';

const DEFAULT_COUNTS = {
  allOpportunities: 0,
  clientRequests: 0,
  b2bOpportunities: 0,
  bulkRequirements: 0,
  bidQuoteRequests: 0,
  directInvitations: 0,
  proposalsPending: 0,
  pendingQuotes: 0,
  acceptedWork: 0,
  acceptedThisWeek: 0
};

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const DEBOUNCE_DELAY = 3000;          // 3 s — absorbs event bursts

const useBusinessIntakeCounts = () => {
  const [counts, setCounts] = useState(DEFAULT_COUNTS);
  const [loading, setLoading] = useState(true);
  const { socket } = useVendorSocket();
  const intervalRef = useRef(null);
  const debounceRef = useRef(null);
  const retryRef = useRef(null);
  const retryDelay = useRef(0);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetchCounts();
      if (res.data?.success) {
        setCounts(res.data.data);
        retryDelay.current = 0; // reset backoff on success
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        // Exponential backoff: 10 s → 20 s → 40 s … capped at 5 min
        const delay = Math.min(
          retryDelay.current ? retryDelay.current * 2 : 10000,
          POLL_INTERVAL
        );
        retryDelay.current = delay;
        clearTimeout(retryRef.current);
        retryRef.current = setTimeout(loadCounts, delay);
        console.warn('[BusinessIntakeCounts] 429 — retrying in', delay / 1000, 's');
      } else {
        console.warn('[BusinessIntakeCounts] Failed to fetch counts:', err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced version used by socket events
  const debouncedLoad = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadCounts, DEBOUNCE_DELAY);
  }, [loadCounts]);

  useEffect(() => {
    loadCounts();
    intervalRef.current = setInterval(loadCounts, POLL_INTERVAL);
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(debounceRef.current);
      clearTimeout(retryRef.current);
    };
  }, [loadCounts]);

  // Refresh on socket events — debounced to prevent burst storms
  useEffect(() => {
    if (!socket) return;
    socket.on('new_opportunity', debouncedLoad);
    socket.on('new-opportunity', debouncedLoad);
    socket.on('opportunity:new', debouncedLoad);
    socket.on('bid_status_changed', debouncedLoad);
    socket.on('bid-status-changed', debouncedLoad);
    socket.on('bid_accepted', debouncedLoad);
    socket.on('bid-accepted', debouncedLoad);
    socket.on('direct_invitation', debouncedLoad);
    socket.on('direct-invitation', debouncedLoad);
    return () => {
      socket.off('new_opportunity', debouncedLoad);
      socket.off('new-opportunity', debouncedLoad);
      socket.off('opportunity:new', debouncedLoad);
      socket.off('bid_status_changed', debouncedLoad);
      socket.off('bid-status-changed', debouncedLoad);
      socket.off('bid_accepted', debouncedLoad);
      socket.off('bid-accepted', debouncedLoad);
      socket.off('direct_invitation', debouncedLoad);
      socket.off('direct-invitation', debouncedLoad);
    };
  }, [socket, debouncedLoad]);

  return { counts, loading, refresh: loadCounts };
};

export default useBusinessIntakeCounts;
