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
import { assignEngineerToJob } from '../../../services/myJobsService';

const AssignJobEngineerModal = ({
  job,
  onClose,
  onAssigned
}) => {
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEngineer, setSelectedEngineer] = useState(null);
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState(job?.priority || 'normal');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/vendor/workforce/engineers', {
          params: { status: 'active', search }
        });
        if (!cancelled && res.data?.success) {
          setEngineers(res.data.data || []);
        }
      } catch {
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

    return () => { cancelled = true; };
  }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEngineer) {
      setError('Please select an engineer from the roster');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const engId = selectedEngineer.engineerId?._id || selectedEngineer.engineerId || selectedEngineer._id || selectedEngineer.id;
      const res = await assignEngineerToJob(job.id, {
        engineerId: engId,
        notes,
        priority
      });

      if (res.success) {
        setSuccess('Engineer assigned successfully!');
        setTimeout(() => {
          onAssigned?.(res.data);
          onClose();
        }, 800);
      } else {
        setError(res.message || 'Failed to assign engineer');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error assigning engineer');
    } finally {
      setSubmitting(false);
    }
  };

  if (!job) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Assign Field Engineer</h3>
              <p className="text-xs text-gray-400 truncate max-w-md">
                Job #{job.jobCode} · {job.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {/* Search Engineer */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Select Available Engineer
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search engineer by name, skills, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Engineer Roster List */}
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {loading ? (
              <div className="py-8 text-center text-gray-400 flex items-center justify-center gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Loading available workforce...
              </div>
            ) : engineers.length === 0 ? (
              <div className="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-500 text-xs">
                No active engineers found matching criteria.
              </div>
            ) : (
              engineers.map((eng) => {
                const engId = eng.engineerId?._id || eng.engineerId || eng._id || eng.id;
                const isSelected = (selectedEngineer?.engineerId?._id || selectedEngineer?._id) === engId;
                const isAvail = eng.availability === 'available';

                return (
                  <div
                    key={engId}
                    onClick={() => setSelectedEngineer(eng)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 shadow-sm ring-1 ring-blue-500'
                        : 'bg-white hover:bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm shrink-0">
                        {eng.avatar ? (
                          <img src={eng.avatar} alt="avatar" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          (eng.name || 'E').charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900 truncate">{eng.name}</p>
                          <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                            isAvail ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isAvail ? 'Available' : (eng.availability || 'Active')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          {eng.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {eng.phone}</span>}
                          {eng.rating > 0 && <span className="flex items-center gap-1 text-amber-600"><Star className="w-3 h-3 fill-amber-500" /> {eng.rating}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 ml-3">
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'
                      }`}>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Priority Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Priority
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['normal', 'high', 'urgent'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold uppercase border transition-all ${
                    priority === p
                      ? p === 'urgent'
                        ? 'bg-red-50 text-red-700 border-red-400 ring-2 ring-red-200'
                        : p === 'high'
                        ? 'bg-amber-50 text-amber-700 border-amber-400 ring-2 ring-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-400 ring-2 ring-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Dispatch Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Special Instructions / Notes for Engineer (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Call customer before arrival, carry spare kit..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedEngineer}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-600/20"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Assigning...
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" /> Confirm Assignment
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

export default AssignJobEngineerModal;
