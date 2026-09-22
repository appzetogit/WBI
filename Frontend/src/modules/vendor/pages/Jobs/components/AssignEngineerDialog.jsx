import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, MapPin, Wrench, Loader2, Briefcase, Wifi, WifiOff, ChevronDown, ChevronUp, UserX } from 'lucide-react';
import { Modal, ErrorState, Skeleton } from '../../../components/ops/OpsUi';
import { getEligibleEngineers, assignJob, reassignJob, errorMessage } from '../../../services/vendorJobsService';

const availabilityChip = (a) => {
  const map = {
    available: 'bg-emerald-100 text-emerald-800',
    busy: 'bg-amber-100 text-amber-800',
    offline: 'bg-gray-100 text-gray-600'
  };
  return map[a] || 'bg-gray-100 text-gray-600';
};

/**
 * Assign (or reassign) a job. The candidate list is computed by the backend
 * (skill + location required; availability and current job count shown) —
 * the UI never builds its own engineer list.
 */
const AssignEngineerDialog = ({ job, mode = 'assign', onClose, onDone }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [excluded, setExcluded] = useState([]);
  const [showExcluded, setShowExcluded] = useState(false);
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getEligibleEngineers(job.id);
      const current = job.engineer?.id;
      setCandidates((res.data || []).filter((c) => c.engineerId !== current));
      setExcluded(res.ineligible || []);
    } catch (err) {
      setError(errorMessage(err, 'Could not load eligible engineers'));
    } finally {
      setLoading(false);
    }
  }, [job.id, job.engineer?.id]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const isReassign = mode === 'reassign';
  const canSubmit = selected && !busy && (!isReassign || text.trim().length >= 3);

  const submit = async () => {
    setBusy(true);
    try {
      if (isReassign) await reassignJob(job.id, selected.engineerId, text.trim());
      else await assignJob(job.id, selected.engineerId, text.trim() || undefined);
      toast.success(isReassign ? `Reassigned to ${selected.name}` : `Assigned to ${selected.name}`);
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Assignment failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={isReassign ? 'Reassign engineer' : 'Assign engineer'}
      subtitle={`${job.jobCode} · ${job.service} · ${job.location?.city || ''} ${job.location?.pincode || ''}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isReassign ? 'Confirm reassignment' : 'Confirm assignment'}
          </button>
        </>
      )}
    >
      {isReassign && job.engineer && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          Currently assigned to <b>{job.engineer.name}</b>. Their assignment will be closed and kept in the job's history; both engineers are notified.
        </div>
      )}

      <p className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
        Eligible engineers {!loading && `(${candidates.length})`}
      </p>

      {loading ? (
        <Skeleton rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : candidates.length === 0 ? (
        <div className="p-6 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <UserX className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-gray-800">No eligible engineer</p>
          <p className="text-xs text-gray-500 mt-1">Nobody in your team has the skill and covers this location right now. See the reasons below.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {candidates.map((c) => {
            const active = selected?.engineerId === c.engineerId;
            return (
              <li key={c.engineerId}>
                <button
                  type="button"
                  onClick={() => setSelected(c)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${active ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{c.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${availabilityChip(c.availability?.status)}`}>
                          {c.availability?.status || 'unknown'}
                        </span>
                        {c.availability?.online ? <Wifi className="w-3.5 h-3.5 text-emerald-600" aria-label="online" /> : <WifiOff className="w-3.5 h-3.5 text-gray-400" aria-label="offline" />}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11px] text-gray-600">
                        <span className="flex items-center gap-1"><Wrench className="w-3 h-3 text-emerald-600" /> Skill match ({String(c.skillMatch?.basis || '').replace(/_/g, ' ')})</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-emerald-600" />
                          {c.locationMatch?.basis === 'distance' ? `${c.locationMatch.distanceKm} km away` : 'Covers this city'}
                        </span>
                        <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" /> {c.activeJobs}/{c.maxActiveJobs} active jobs</span>
                      </div>
                    </div>
                    <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${active ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                      {active && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && excluded.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowExcluded((s) => !s)} className="text-xs font-bold text-gray-600 flex items-center gap-1">
            {showExcluded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {excluded.length} not eligible — why?
          </button>
          {showExcluded && (
            <ul className="mt-2 space-y-1.5">
              {excluded.map((c) => (
                <li key={c.engineerId} className="text-[11px] text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  <b className="text-gray-800">{c.name}</b>: {c.reasons.join('; ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label className="block mt-5">
        <span className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
          {isReassign ? 'Reason for reassignment (required)' : 'Notes for the engineer (optional)'}
        </span>
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder={isReassign ? 'e.g. Engineer unwell, moving to a closer engineer' : 'e.g. Call the site contact before arriving'}
        />
      </label>
    </Modal>
  );
};

export default AssignEngineerDialog;
