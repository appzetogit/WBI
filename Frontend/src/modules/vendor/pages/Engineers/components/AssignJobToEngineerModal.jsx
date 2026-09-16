import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MapPin,
  Calendar,
  Briefcase,
  Sparkles,
  Shield,
  Tag
} from 'lucide-react';
import { fetchAssignableJobs, assignJobToEngineer } from '../../../services/vendorEngineersService';

const AssignJobToEngineerModal = ({ engineer, onClose, onAssigned }) => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState('normal');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetchAssignableJobs({ search });
        if (!cancelled && res.success) {
          setJobs(res.data || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load assignable jobs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedJob) {
      setError('Please select an eligible job to assign');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const res = await assignJobToEngineer(engineer._id, {
        jobId: selectedJob.id,
        jobType: selectedJob.jobType,
        notes,
        priority
      });

      if (res.success) {
        setSuccess(res.message || 'Job successfully assigned to engineer!');
        setTimeout(() => {
          if (onAssigned) onAssigned(selectedJob);
          onClose();
        }, 1200);
      } else {
        setError(res.message || 'Failed to assign job');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Assignment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const engSkills = [engineer?.primarySkill, ...(engineer?.skills?.map((s) => s.name) || [])].filter(Boolean);

  const checkSkillMatch = (jobService) => {
    if (!jobService || !engSkills.length) return false;
    const js = jobService.toLowerCase();
    return engSkills.some((sk) => js.includes(sk.toLowerCase()) || sk.toLowerCase().includes(js));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400">
                <Zap className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-white">Assign Job to Engineer</h2>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Select an accepted project or B2B job for <strong className="text-white">{engineer?.name}</strong> ({engineer?.employeeId})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Engineer Quick Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-700 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                {engineer?.name?.slice(0, 2).toUpperCase() || 'EN'}
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">{engineer?.name}</h4>
                <p className="text-xs text-gray-500">{engineer?.role} · Primary: <span className="text-teal-700 font-semibold">{engineer?.primarySkill || 'General'}</span></p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Ready for Dispatch
            </span>
          </div>

          {/* Search Job Pool */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Select Eligible Accepted Job ({jobs.length})
              </label>
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter jobs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                />
              </div>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin text-teal-600 mb-2" />
                <p className="text-xs">Fetching eligible jobs...</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-10 text-center rounded-xl border border-dashed border-gray-300 bg-slate-50/50 p-4">
                <Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-1.5" />
                <p className="text-sm font-semibold text-gray-700">No Eligible Jobs Available</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Accept incoming requests from the Requests section to assign them here.
                </p>
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1 divide-y-0">
                {jobs.map((job) => {
                  const isSelected = selectedJob?.id === job.id;
                  const hasSkillMatch = checkSkillMatch(job.service);

                  return (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50/40 ring-1 ring-teal-600 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                            {job.jobCode}
                          </span>
                          <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">
                            {job.source}
                          </span>
                          {hasSkillMatch && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" /> Skill Match
                            </span>
                          )}
                        </div>

                        <h5 className="text-sm font-bold text-gray-900 truncate">{job.title}</h5>
                        
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3 text-gray-400" /> {job.service}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-gray-400" /> {job.location}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            {job.date ? new Date(job.date).toLocaleDateString() : 'Scheduled'}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center">
                        <input
                          type="radio"
                          checked={isSelected}
                          onChange={() => setSelectedJob(job)}
                          className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assignment Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Execution Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full text-xs p-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="normal">Normal Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent / Emergency</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Special Dispatch Instructions</label>
              <input
                type="text"
                placeholder="e.g. Carry AC multimeter & ladder"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-xs p-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedJob}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-all shadow-md shadow-teal-700/20 flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Assigning...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
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

export default AssignJobToEngineerModal;
