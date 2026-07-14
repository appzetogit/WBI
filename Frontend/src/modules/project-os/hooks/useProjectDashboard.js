import { useState, useEffect, useCallback } from 'react';
import { projectApi } from '../services/projectOS.api';
import toast from 'react-hot-toast';

/**
 * Core hook for Project OS Dashboard
 * Fetches project config + metrics + milestones + activity in a single call.
 * Exposes refresh and metric-reload functions.
 */
export function useProjectDashboard(projectId) {
  const [data, setData] = useState(null);      // full dashboard payload
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await projectApi.getDashboard(projectId);
      setData(res.data.data);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load dashboard';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Reload only metrics (for widget auto-refresh without full page reload)
  const refreshMetrics = useCallback(async () => {
    try {
      const res = await projectApi.getMetrics(projectId);
      if (res.data?.data && data) {
        setData(prev => ({
          ...prev,
          widgets: prev.widgets.map(w => ({
            ...w,
            resolvedMetric: res.data.data[w.metricKey] || w.resolvedMetric
          }))
        }));
      }
    } catch {/* silent */ }
  }, [projectId, data]);

  return { data, loading, error, refresh: load, refreshMetrics };
}

/**
 * Hook for sidebar module config
 */
export function useProjectModules(projectId) {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    projectApi.getModules(projectId)
      .then(res => setModules(res.data?.data || []))
      .catch(() => setModules([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  return { modules, loading };
}
