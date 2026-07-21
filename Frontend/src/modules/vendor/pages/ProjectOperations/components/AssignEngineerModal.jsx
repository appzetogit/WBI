import React, { useEffect, useState } from 'react';
import { UserPlus, Search, X, CheckCircle2, Loader2 } from 'lucide-react';
import {
  fetchAssignableEngineers,
  assignEngineerToProject,
} from '../../../services/projectOpsService';

/**
 * Modal: vendor picks an engineer after accepting a client request / from Project Ops.
 * On assign → engineer app gets socket + FCM job request.
 */
const AssignEngineerModal = ({ projectId, projectTitle, onClose, onAssigned }) => {
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchAssignableEngineers({ search });
        if (!cancelled) setEngineers(res.data?.data || []);
      } catch {
        if (!cancelled) setEngineers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [search]);

  const handleAssign = async () => {
    if (!selected?._id) {
      setError('Select an engineer');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await assignEngineerToProject(projectId, {
        engineerId: selected._id,
        notes,
      });
      setSuccess(res.data?.message || `Request sent to ${selected.name}`);
      onAssigned?.(res.data?.data);
      setTimeout(() => onClose?.(), 1200);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to assign engineer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
              Assign Engineer
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{projectTitle || 'New project'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <p className="text-sm text-gray-600">
            Engineer ko job request app pe jayegi. Woh Accept/Reject karega — pehle auto-start nahi hota.
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search engineer name, phone..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          {success && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> {success}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading engineers...
            </div>
          ) : engineers.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              No engineers found under this vendor.
              <br />
              Pehle <strong>Workforce → Engineers</strong> mein engineer add/approve karo.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {engineers.map((eng) => (
                <button
                  key={eng._id}
                  type="button"
                  onClick={() => setSelected(eng)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                    selected?._id === eng._id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{eng.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {eng.phone || eng.email || '—'}
                        {eng.city ? ` · ${eng.city}` : ''}
                      </p>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <p>{eng.activeJobs || 0} active</p>
                      <p className={eng.approvalStatus === 'approved' ? 'text-emerald-600' : 'text-amber-600'}>
                        {eng.approvalStatus || 'pending'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Notes for engineer (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Gate code, tools needed, customer preference..."
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50"
          >
            Later
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={submitting || !selected}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Sending...' : 'Send Job to Engineer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignEngineerModal;
