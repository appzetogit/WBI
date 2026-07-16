/**
 * useBusinessIntakeCounts
 * Fetches sidebar badge counts every 60 seconds.
 * Also refreshes on socket events.
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
  acceptedThisWeek: 0
};

const useBusinessIntakeCounts = () => {
  const [counts, setCounts] = useState(DEFAULT_COUNTS);
  const [loading, setLoading] = useState(true);
  const { socket } = useVendorSocket();
  const intervalRef = useRef(null);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetchCounts();
      if (res.data?.success) {
        setCounts(res.data.data);
      }
    } catch (err) {
      // Silently fail — counts are non-critical
      console.warn('[BusinessIntakeCounts] Failed to fetch counts:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCounts();
    // Poll every 60 seconds
    intervalRef.current = setInterval(loadCounts, 60000);
    return () => clearInterval(intervalRef.current);
  }, [loadCounts]);

  // Refresh on socket events
  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadCounts();
    socket.on('new-opportunity', refresh);
    socket.on('bid-status-changed', refresh);
    socket.on('bid-accepted', refresh);
    socket.on('direct-invitation', refresh);
    return () => {
      socket.off('new-opportunity', refresh);
      socket.off('bid-status-changed', refresh);
      socket.off('bid-accepted', refresh);
      socket.off('direct-invitation', refresh);
    };
  }, [socket, loadCounts]);

  return { counts, loading, refresh: loadCounts };
};

export default useBusinessIntakeCounts;
