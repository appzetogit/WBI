import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCCCounts } from '../services/clientsContractsService';
import { useVendorSocket } from '../context/VendorSocketContext';

const DEFAULT = {
  individualClients: 0,
  b2bClients: 0,
  conversationsUnread: 0,
  proposalsPending: 0,
  activeContracts: 0,
  scopeChangesPending: 0,
  totalClients: 0
};

const POLL_INTERVAL  = 5 * 60 * 1000; // 5 minutes
const START_DELAY    = 24500;           // stagger: fire 24.5 s after mount
const DEBOUNCE_DELAY = 3000;           // absorb socket bursts

const useClientsContractsCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const { socket } = useVendorSocket() || {};
  const intervalRef = useRef(null);
  const debounceRef = useRef(null);
  const retryRef = useRef(null);
  const retryDelay = useRef(0);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetchCCCounts();
      if (res.data?.success) {
        setCounts(res.data.data);
        retryDelay.current = 0;
      }
    } catch (err) {
      if (err?.response?.status === 429) {
        const delay = Math.min(retryDelay.current ? retryDelay.current * 2 : 10000, POLL_INTERVAL);
        retryDelay.current = delay;
        clearTimeout(retryRef.current);
        retryRef.current = setTimeout(loadCounts, delay);
        console.warn('[CCCounts] 429 — retrying in', delay / 1000, 's');
      } else {
        console.warn('[CCCounts]', err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedLoad = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadCounts, DEBOUNCE_DELAY);
  }, [loadCounts]);

  useEffect(() => {
    const start = setTimeout(() => {
      loadCounts();
      intervalRef.current = setInterval(loadCounts, POLL_INTERVAL);
    }, START_DELAY);
    return () => {
      clearTimeout(start);
      clearInterval(intervalRef.current);
      clearTimeout(debounceRef.current);
      clearTimeout(retryRef.current);
    };
  }, [loadCounts]);

  useEffect(() => {
    if (!socket) return;
    socket.on('client_message', debouncedLoad);
    return () => socket.off('client_message', debouncedLoad);
  }, [socket, debouncedLoad]);

  return { counts, loading, refresh: loadCounts };
};

export default useClientsContractsCounts;
