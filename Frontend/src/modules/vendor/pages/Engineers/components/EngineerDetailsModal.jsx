import React, { useEffect, useState } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  MapPin,
  Star,
  Award,
  Briefcase,
  Calendar,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  Zap,
  Activity,
  Ban,
  Power
} from 'lucide-react';
import { fetchVendorEngineerDetails, updateEngineerStatus } from '../../../services/vendorEngineersService';

const AVAILABILITY_CONFIG = {
  available: { label: 'Available', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  busy: { label: 'Busy / On Project', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  leave: { label: 'On Approved Leave', bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  offline: { label: 'Offline / Inactive', bg: 'bg-gray-100 text-gray-600 border-gray-300', dot: 'bg-gray-400' }
};

const EngineerDetailsModal = ({ engineerId, onClose, onOpenAssignJob, onUpdated }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'active_job' | 'history'
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchVendorEngineerDetails(engineerId);
        if (!cancelled && res.success) {
          setData(res.data);
        } else if (!cancelled) {
          setError(res.message || 'Failed to load engineer details');
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || err.message || 'Failed to load details');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [engineerId]);

  const handleStatusAction = async (action) => {
    setActionLoading(true);
    try {
      const res = await updateEngineerStatus(engineerId, { action });
      if (res.success) {
        const refreshed = await fetchVendorEngineerDetails(engineerId);
        if (refreshed.success) setData(refreshed.data);
        if (onUpdated) onUpdated();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  if (!engineerId) return null;

  const avail = AVAILABILITY_CONFIG[data?.availability] || AVAILABILITY_CONFIG.offline;
  const initials = data?.name ? data.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'EN';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white relative flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              {data?.photo ? (
                <img src={data.photo} alt={data.name} className="w-16 h-16 rounded-2xl object-cover border-2 border-white/20 shadow-md" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-teal-600/80 border-2 border-white/20 flex items-center justify-center text-white text-xl font-bold shadow-md">
                  {initials}
                </div>
              )}
              {data && (
                <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${avail.dot}`} />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{data?.name || 'Engineer Profile'}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-white/10 text-slate-200 border border-white/10">
                  {data?.employeeId || 'ENG'}
                </span>
              </div>
              <p className="text-sm text-slate-300 mt-0.5">
                {data?.role || 'Field Engineer'} · <span className="text-teal-400">{data?.serviceCategoryName || data?.serviceCategoryCode || 'Operations'}</span>
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-300">
                <span className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-md">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span className="font-semibold text-white">{data?.rating || 4.5}</span>
                </span>
                <span className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-md">
                  <Award className="w-3.5 h-3.5 text-teal-400" />
                  Score: <span className="font-semibold text-white">{data?.performanceScore || 85}%</span>
                </span>
                <span className="capitalize bg-white/10 px-2 py-0.5 rounded-md">
                  {data?.certificationLevel || 'Mid-Level'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-100 bg-slate-50/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'overview'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Overview & Skills
          </button>
          <button
            onClick={() => setActiveTab('active_job')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'active_job'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>Current Assignment</span>
            {data?.activeJob && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'history'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Work History
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin mb-2" />
              <p className="text-sm text-gray-500 font-medium">Loading engineer details...</p>
            </div>
          ) : error ? (
            <div className="p-6 bg-red-50 text-red-700 rounded-xl border border-red-200 text-center">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="font-semibold">{error}</p>
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW & SKILLS */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Status Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${avail.bg}`}>
                        <span className={`w-2 h-2 rounded-full ${avail.dot}`} />
                        {avail.label}
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-md font-semibold capitalize ${
                        data.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        Account: {data.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {data.status === 'active' ? (
                        <button
                          onClick={() => handleStatusAction('suspend')}
                          disabled={actionLoading}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 transition-colors flex items-center gap-1"
                        >
                          <Ban className="w-3.5 h-3.5" /> Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusAction('activate')}
                          disabled={actionLoading}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-sm"
                        >
                          <Power className="w-3.5 h-3.5" /> Activate
                        </button>
                      )}

                      {data.availability === 'available' && data.status === 'active' && (
                        <button
                          onClick={() => {
                            onClose();
                            if (onOpenAssignJob) onOpenAssignJob(data);
                          }}
                          className="px-4 py-1.5 text-xs font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 transition-colors flex items-center gap-1 shadow-sm"
                        >
                          <Zap className="w-3.5 h-3.5" /> Assign Job
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Contact & Location Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-teal-600" /> Contact Details
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between text-gray-700">
                          <span className="text-gray-400 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone</span>
                          <span className="font-semibold">{data.phone || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-700">
                          <span className="text-gray-400 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</span>
                          <span className="font-semibold truncate max-w-[200px]">{data.email || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-700">
                          <span className="text-gray-400">Attendance</span>
                          <span className="capitalize font-medium text-slate-800">{data.attendanceStatus?.replace('_', ' ') || 'Checked Out'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-teal-600" /> Operational Location
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between text-gray-700">
                          <span className="text-gray-400">Assigned City</span>
                          <span className="font-semibold">{data.city || 'Primary Region'}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-700">
                          <span className="text-gray-400">Current Site</span>
                          <span className="font-medium text-slate-800">{data.currentLocation || 'No live site'}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-700">
                          <span className="text-gray-400">Experience</span>
                          <span className="font-semibold">{data.experienceYears || 0} Years</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Skills & Competencies */}
                  <div className="p-5 rounded-xl border border-gray-200 bg-white space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-teal-600" /> Skills & Proficiency Matrix
                      </h4>
                      <span className="text-xs bg-teal-50 text-teal-700 font-semibold px-2 py-0.5 rounded-md border border-teal-200">
                        Primary: {data.primarySkill || 'General'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(data.skills && data.skills.length > 0 ? data.skills : [{ name: data.primarySkill || 'Core Service Skills', proficiency: 80 }]).map((skill, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                            <span>{skill.name}</span>
                            <span className="text-teal-600">{skill.proficiency || 75}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-teal-600 h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${skill.proficiency || 75}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ACTIVE JOB */}
              {activeTab === 'active_job' && (
                <div className="space-y-4">
                  {data.activeJob ? (
                    <div className="p-5 rounded-2xl border-2 border-teal-500/30 bg-teal-50/20 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-mono font-bold text-teal-700 uppercase bg-teal-100 px-2.5 py-0.5 rounded-md">
                            {data.activeJob.jobCode}
                          </span>
                          <h3 className="text-base font-bold text-gray-900 mt-1.5">{data.activeJob.title}</h3>
                          <p className="text-xs text-gray-500">{data.activeJob.source} · {data.activeJob.service}</p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                          {data.activeJob.status?.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs text-gray-600 border-t border-teal-100">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                          <span>{data.activeJob.location || 'Site Address specified in job details'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                          <span>Scheduled: {data.activeJob.date ? new Date(data.activeJob.date).toLocaleDateString() : 'Active Today'}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-gray-300 bg-slate-50 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-bold text-gray-900">Engineer is Currently Available</h4>
                      <p className="text-sm text-gray-500 max-w-md mx-auto">
                        {data.name} has no conflicting active assignments and is ready to take up new accepted jobs.
                      </p>
                      {data.status === 'active' && (
                        <button
                          onClick={() => {
                            onClose();
                            if (onOpenAssignJob) onOpenAssignJob(data);
                          }}
                          className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 transition-all shadow-md shadow-teal-700/20 inline-flex items-center gap-2"
                        >
                          <Zap className="w-4 h-4" /> Assign Accepted Job Now
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: WORK HISTORY */}
              {activeTab === 'history' && (
                <div className="space-y-3">
                  {data.recentHistory && data.recentHistory.length > 0 ? (
                    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden bg-white">
                      {data.recentHistory.map((item, i) => (
                        <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-slate-700">{item.code}</span>
                              <span className="text-xs text-gray-400">({item.source})</span>
                            </div>
                            <h5 className="text-sm font-semibold text-gray-900">{item.title}</h5>
                            <p className="text-xs text-gray-400">
                              {item.date ? new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'}
                            </p>
                          </div>
                          <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-md border ${
                            item.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {item.status?.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-400">
                      <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No historical assignments logged yet.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {data ? `Worker ID: ${data.employeeId} · Vendor Managed Workforce` : ''}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200/70 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EngineerDetailsModal;
