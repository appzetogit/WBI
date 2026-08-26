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

const useClientsContractsCounts = () => {
  const [counts, setCounts] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const { socket } = useVendorSocket() || {};
  const intervalRef = useRef(null);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetchCCCounts();
      if (res.data?.success) setCounts(res.data.data);
    } catch (err) {
      console.warn('[CCCounts]', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCounts();
    intervalRef.current = setInterval(loadCounts, 60000);
    return () => clearInterval(intervalRef.current);
  }, [loadCounts]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadCounts();
    socket.on('client_message', refresh);
    return () => socket.off('client_message', refresh);
  }, [socket, loadCounts]);

  return { counts, loading, refresh: loadCounts };
};

export default useClientsContractsCounts;
