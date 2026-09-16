import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MapPin,
  Star,
  Phone,
  Shield,
  Clock
} from 'lucide-react';
import api from '../../../../../services/api';
import { assignEngineerToRequest } from '../../../services/requestsService';

const AssignEngineerModal = ({
  request,
  onClose,
  onAssigned
}) => {
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEngineer, setSelectedEngineer] = useState(null);
  const [notes, setNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // Fetch real workforce engineers
        const res = await api.get('/vendor/workforce/engineers', {
          params: { availability: 'available', status: 'active', search }
        });
        if (!cancelled && res.data?.success) {
          setEngineers(res.data.data || []);
        }
      } catch (err) {
        // Fallback to assignable engineers
        try {
          const fallbackRes = await api.get('/vendor/project-ops/assignable-engineers', {
            params: { search }
          });
          if (!cancelled && fallbackRes.data?.success) {
            setEngineers(fallbackRes.data.data || []);
          }
        } catch {
          if (!cancelled) setEngineers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search]);

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEngineer?._id && !selectedEngineer?.id) {
      setError('Please select an engineer from the list');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const engId = selectedEngineer._id || selectedEngineer.id;
      const targetId = request?.linkedProjectId || request?.id;

      const res = await assignEngineerToRequest(targetId, {
        engineerId: engId,
        notes,
        scheduledAt: scheduledAt || null
      });

      if (res.data?.success) {
        setSuccess(res.data.message || `Assigned to ${selectedEngineer.name}! Request dispatched to Engineer App.`);
        onAssigned?.(res.data.data);
        setTimeout(() => {
          onClose?.();
        }, 1200);
      } else {
        setError(res.data?.message || 'Failed to assign engineer');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to assign engineer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-blue-50/50">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
              Assign Workforce Engineer
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">
              Target: <strong className="text-gray-800">{request?.title || 'Accepted Job'}</strong> ({request?.requestId || request?.id})
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleAssignSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-xl border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <p className="text-xs text-gray-500">
            The assigned engineer will receive an instant assignment prompt on their Engineer Portal. Once they accept, execution starts on-site.
          </p>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search engineers by name, skill, phone or city..."
              className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Engineer List Selection */}
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {loading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : engineers.length === 0 ? (
              <div className="p-6 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-xs font-semibold text-gray-600">No available engineers found</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Engineers currently on project or leave are not listed.</p>
              </div>
            ) : (
              engineers.map((eng) => {
                const isSelected =
                  (selectedEngineer?._id && selectedEngineer._id === eng._id) ||
                  (selectedEngineer?.id && selectedEngineer.id === eng.id);

                return (
                  <div
                    key={eng._id || eng.id}
                    onClick={() => setSelectedEngineer(eng)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 shadow-xs ring-2 ring-blue-500/20'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/80 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">
                        {eng.name?.[0] || 'E'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs sm:text-sm font-bold text-gray-900 truncate">{eng.name}</h4>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            Available
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {eng.primarySkill || eng.skills?.[0] || 'Field Engineer'} {eng.city ? `· ${eng.city}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 text-xs font-bold text-amber-500">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span>{eng.rating || '4.8'}</span>
                      </div>
                      {eng.phone && <p className="text-[11px] text-gray-400 mt-0.5">{eng.phone}</p>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Optional Schedule & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                Scheduled Execution Date
              </label>
              <input
                type="date"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full p-2.5 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                Engineer Instructions / Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Carry specialized multimeter..."
                className="w-full p-2.5 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedEngineer}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-xs"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  <span>Confirm Assignment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AssignEngineerModal;
