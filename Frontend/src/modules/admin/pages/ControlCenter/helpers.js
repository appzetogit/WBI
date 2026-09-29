import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';

/* Non-component helpers shared by the Control Center pages. */

export const errMsg = (e, fallback = 'Something went wrong') =>
  e?.response?.data?.message || e?.message || fallback;

/** GET `url` with `params`; refetches when either changes. */
export const useApi = (url, params = {}) => {
  const key = JSON.stringify(params);
  const [state, setState] = useState({ loading: true, data: null, error: null, raw: null });
  const fetchData = useCallback(async () => {
    try {
      const res = await api.get(url, { params: JSON.parse(key) });
      setState({ loading: false, data: res.data?.data, error: null, raw: res.data });
    } catch (e) {
      setState({ loading: false, data: null, error: errMsg(e), raw: null });
    }
  }, [url, key]);
  useEffect(() => {
    let alive = true;
    api.get(url, { params: JSON.parse(key) })
      .then((res) => { if (alive) setState({ loading: false, data: res.data?.data, error: null, raw: res.data }); })
      .catch((e) => { if (alive) setState({ loading: false, data: null, error: errMsg(e), raw: null }); });
    return () => { alive = false; };
  }, [url, key]);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return fetchData();
  }, [fetchData]);
  return { ...state, reload };
};

/** Run a write call with a toast; returns the response body or null. */
export const act = async (fn, success) => {
  try {
    const res = await fn();
    toast.success(res.data?.message || success || 'Done');
    return res.data;
  } catch (e) {
    toast.error(errMsg(e));
    return null;
  }
};

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export const statusTone = (s = '') => {
  const v = String(s).toLowerCase();
  if (/(complete|resolved|approved|success|paid|processed|active|released)/.test(v)) return 'green';
  if (/(cancel|reject|fail|disput|escalat|suspend)/.test(v)) return 'red';
  if (/(pending|open|review|new|waiting|draft)/.test(v)) return 'amber';
  return 'blue';
};

export const inputCls = 'w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-200';
