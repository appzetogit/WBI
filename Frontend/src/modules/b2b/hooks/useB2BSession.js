import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';

const readStored = () => {
  try {
    const raw = localStorage.getItem('b2bData') || sessionStorage.getItem('b2bData');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeStored = (fresh) => {
  try {
    for (const store of [localStorage, sessionStorage]) {
      const raw = store.getItem('b2bData');
      if (raw) store.setItem('b2bData', JSON.stringify({ ...JSON.parse(raw), ...fresh }));
    }
  } catch {
    /* storage unavailable — the in-memory copy still works */
  }
};

/**
 * The signed-in B2B company and principal (role + permissions), from /b2b/me.
 * Shared through the query cache, so the layout and pages ask once.
 */
export default function useB2BSession() {
  const query = useQuery({
    queryKey: ['b2bMe'],
    queryFn: async () => {
      const res = await api.get('/b2b/me');
      if (res.data?.company) writeStored(res.data.company);
      return res.data;
    },
    staleTime: 60_000,
    retry: 1
  });

  const company = query.data?.company || readStored();
  const principal = query.data?.principal || null;
  const permissions = principal?.permissions || null;

  // Until the principal loads, show everything: the API still refuses what
  // the user may not do, and hiding the menu on a slow request is worse.
  const can = useCallback(
    (key) => !key || !permissions || permissions.includes(key),
    [permissions]
  );

  return {
    company,
    principal,
    can,
    isLoading: query.isLoading,
    refetch: query.refetch
  };
}
