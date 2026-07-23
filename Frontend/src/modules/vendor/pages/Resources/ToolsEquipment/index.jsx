import React, { useState, useEffect, useCallback } from 'react';
import { Wrench } from 'lucide-react';
import { fetchTools, updateTool, statusColors } from '../../../services/resourcesOpsService';
import { fetchEngineers } from '../../../services/workforceOpsService';
import { useResourcesOps } from '../context/ResourcesContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 10;

const ToolsEquipment = () => {
  const { search, filters, refreshKey, triggerRefresh } = useResourcesOps();
  const [data, setData] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE });
  const [assignFor, setAssignFor] = useState(null);
  const [selectedEngineerId, setSelectedEngineerId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE };
      if (search) params.search = search;
      if (filters.category) params.category = filters.category;
      if (filters.status) params.status = filters.status;
      const res = await fetchTools(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    fetchEngineers({ status: 'active', limit: 100 })
      .then((res) => setEngineers(res.data.data || []))
      .catch(() => setEngineers([]));
  }, [refreshKey]);

  const afterMutation = () => {
    load();
    triggerRefresh();
    window.dispatchEvent(new Event('vendorOpsUpdated'));
  };

  const act = async (id, action) => {
    try {
      await updateTool(id, { action });
      afterMutation();
    } catch (e) {
      alert(e.response?.data?.message || 'Failed');
    }
  };

  const openAssign = (tool) => {
    setAssignFor(tool);
    setSelectedEngineerId('');
    setProjectName('');
  };

  const confirmAssign = async () => {
    if (!assignFor || !selectedEngineerId) {
      alert('Select an engineer');
      return;
    }
    const eng = engineers.find((e) => e._id === selectedEngineerId);
    setSaving(true);
    try {
      await updateTool(assignFor._id, {
        action: 'assign',
        assignedEngineer: eng?.name || '',
        assignedEngineerId: eng?._id || selectedEngineerId,
        assignedProject: projectName.trim() || undefined
      });
      setAssignFor(null);
      afterMutation();
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to assign');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }
  if (!data.length) {
    return (
      <EmptyState
        icon={Wrench}
        title="No tools"
        description="Add tools & equipment for your approved services. Availability updates when you assign, return, or send to maintenance."
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((t) => {
          const sc = statusColors[t.status] || statusColors.available;
          return (
            <div key={t._id} className="border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col bg-white">
              <div className="flex justify-between gap-2 mb-2">
                <div>
                  <p className="text-[11px] font-mono text-gray-400">{t.toolCode}</p>
                  <h3 className="font-bold text-gray-900">{t.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{t.category} · {t.serviceCategoryName}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>{t.status}</span>
              </div>
              <p className="text-xs text-gray-500 mb-1">SN {t.serialNumber || '—'} · Condition {t.condition}</p>
              <p className="text-xs text-gray-600 mb-3">
                {t.assignedEngineer ? `Assigned: ${t.assignedEngineer}` : 'Unassigned'}
                {t.assignedProject ? ` · ${t.assignedProject}` : ''}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                {t.status === 'available' && (
                  <button
                    type="button"
                    onClick={() => openAssign(t)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg"
                  >
                    Assign
                  </button>
                )}
                {t.status === 'assigned' && (
                  <button
                    type="button"
                    onClick={() => act(t._id, 'return')}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"
                  >
                    Return
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => act(t._id, 'maintenance')}
                  className="px-3 py-1.5 text-xs font-medium border border-amber-200 text-amber-700 rounded-lg"
                >
                  Maintenance
                </button>
                <button
                  type="button"
                  onClick={() => act(t._id, 'inspect')}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"
                >
                  Inspect
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <Pagination
        page={pagination.page}
        pages={pagination.pages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={setPage}
        loading={loading}
      />

      {assignFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-bold text-gray-900 mb-1">Assign {assignFor.name}</h3>
            <p className="text-xs text-gray-500 mb-4">{assignFor.toolCode}</p>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Engineer</label>
            <select
              value={selectedEngineerId}
              onChange={(e) => setSelectedEngineerId(e.target.value)}
              className="w-full mb-3 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select engineer…</option>
              {engineers.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.name} {e.availability ? `(${e.availability})` : ''}
                </option>
              ))}
            </select>
            {!engineers.length && (
              <p className="text-xs text-amber-700 mb-3">
                No workforce engineers found. Sync linked engineers from Workforce first.
              </p>
            )}
            <label className="block text-xs font-semibold text-gray-600 mb-1">Project (optional)</label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Project or job name"
              className="w-full mb-4 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignFor(null)}
                className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !selectedEngineerId}
                onClick={confirmAssign}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Assigning…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ToolsEquipment;
