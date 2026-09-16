import React, { useEffect, useState } from 'react';
import {
  X,
  User,
  Building2,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  FileText,
  DollarSign,
  Shield,
  Phone,
  Loader2,
  ExternalLink,
  Camera,
  KeyRound,
  PenTool,
  CheckSquare,
  Sparkles,
  ArrowRight,
  Info
} from 'lucide-react';
import { fetchJobDetails } from '../../../services/myJobsService';

const STATUS_COLOR_MAP = {
  new: 'bg-gray-100 text-gray-700 border-gray-300',
  accepted: 'bg-blue-50 text-blue-700 border-blue-200',
  assigned: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  dispatched: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  en_route: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200'
};

const STATUS_LABEL_MAP = {
  new: 'New Request',
  accepted: 'Accepted',
  assigned: 'Engineer Assigned',
  dispatched: 'Dispatched',
  en_route: 'En Route',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const JobDetailsModal = ({
  jobId,
  onClose,
  onOpenAssignEngineer
}) => {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'photos' | 'notes' | 'verification' | 'proof'

  useEffect(() => {
    if (!jobId) return;
    let isMounted = true;

    const loadDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchJobDetails(jobId);
        if (isMounted) {
          if (res.success && res.data) {
            setJob(res.data);
          } else {
            setError(res.message || 'Could not load job details');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || err.message || 'Error fetching details');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDetails();
    return () => { isMounted = false; };
  }, [jobId]);

  if (!jobId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-400">
                  {job?.jobCode || 'JOB DETAILS'}
                </span>
                {job?.source && (
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md tracking-wider ${
                    job.sourceType === 'b2b'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {job.source}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-white truncate max-w-lg">
                {job?.title || 'Operational Job'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {job?.status && (
              <span className={`px-3 py-1 text-xs font-bold rounded-full border shadow-sm ${STATUS_COLOR_MAP[job.status] || 'bg-gray-100 text-gray-700'}`}>
                {STATUS_LABEL_MAP[job.status] || job.status}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm font-medium text-gray-600">Loading comprehensive job details...</p>
          </div>
        ) : error ? (
          <div className="py-16 px-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <p className="text-base font-bold text-gray-900 mb-1">Failed to load job details</p>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
            >
              Close
            </button>
          </div>
        ) : job ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* 7-Stage Interactive Status Timeline */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200/80">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Operational Lifecycle Tracker
                </p>
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Current: {STATUS_LABEL_MAP[job.status] || job.status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {(job.timeline || []).map((step, idx) => {
                  const isDone = step.completed;
                  const isCur = step.current;
                  return (
                    <div
                      key={step.key}
                      className={`p-2.5 rounded-lg border flex flex-col justify-between transition-all ${
                        isCur
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-200'
                          : isDone
                          ? 'bg-white text-emerald-700 border-emerald-200 shadow-sm'
                          : 'bg-white/60 text-gray-400 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold opacity-80">0{idx + 1}</span>
                        {isDone ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : isCur ? (
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                        )}
                      </div>
                      <p className="text-xs font-bold truncate leading-tight">{step.label}</p>
                      {step.timestamp ? (
                        <p className={`text-[9px] truncate mt-1 ${isCur ? 'text-blue-100' : 'text-gray-500'}`}>
                          {new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      ) : (
                        <p className={`text-[9px] mt-1 ${isCur ? 'text-blue-100' : 'text-gray-400'}`}>
                          {isDone ? 'Completed' : isCur ? 'Active now' : 'Upcoming'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sub-Navigation Tabs for Detailed Views */}
            <div className="flex items-center gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
              {[
                { key: 'overview', label: 'Overview & Customer', icon: Info },
                { key: 'photos', label: `Photos (${(job.photos?.before?.length || 0) + (job.photos?.after?.length || 0) + (job.photos?.customer?.length || 0)})`, icon: Camera },
                { key: 'notes', label: 'Notes & Remarks', icon: FileText },
                { key: 'verification', label: 'OTP & Signatures', icon: KeyRound },
                { key: 'proof', label: 'Completion Proof', icon: CheckSquare }
              ].map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab: Overview & Scope */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Customer / Company Card */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                      {job.sourceType === 'b2b' ? <Building2 className="w-4 h-4 text-purple-600" /> : <User className="w-4 h-4 text-blue-600" />}
                      {job.sourceType === 'b2b' ? 'Enterprise Client Info' : 'Customer Info'}
                    </p>

                    <div>
                      <p className="text-base font-bold text-gray-900">{job.customer?.name || 'Customer'}</p>
                      {job.customer?.companyName && (
                        <p className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded inline-block mt-0.5">
                          {job.customer.companyName}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs text-gray-600">
                      {job.customer?.phone && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" /> Phone:
                          </span>
                          <a href={`tel:${job.customer.phone}`} className="font-semibold text-blue-600 hover:underline">
                            {job.customer.phone}
                          </a>
                        </div>
                      )}
                      {job.customer?.deviceId && job.customer.deviceId !== 'N/A' && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Device ID:</span>
                          <span className="font-mono font-medium text-gray-900">{job.customer.deviceId}</span>
                        </div>
                      )}
                      {job.customer?.siteId && job.customer.siteId !== 'N/A' && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Site ID:</span>
                          <span className="font-mono font-medium text-gray-900">{job.customer.siteId}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Assigned Engineer Card */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                          <Shield className="w-4 h-4 text-indigo-600" /> Assigned Engineer
                        </p>
                        <button
                          onClick={() => onOpenAssignEngineer?.(job)}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> {job.assignedEngineer ? 'Reassign' : 'Assign'}
                        </button>
                      </div>

                      {job.assignedEngineer ? (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm ring-2 ring-indigo-50">
                            {job.assignedEngineer.avatar ? (
                              <img src={job.assignedEngineer.avatar} alt="avatar" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              job.assignedEngineer.name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{job.assignedEngineer.name}</p>
                            {job.assignedEngineer.phone && (
                              <a href={`tel:${job.assignedEngineer.phone}`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-medium">
                                <Phone className="w-3 h-3" /> {job.assignedEngineer.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="py-3 px-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
                          <p className="text-xs font-semibold text-amber-800 mb-1">No Engineer Assigned Yet</p>
                          <button
                            onClick={() => onOpenAssignEngineer?.(job)}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-bold shadow-sm"
                          >
                            Assign Available Engineer
                          </button>
                        </div>
                      )}
                    </div>

                    {job.assignedEngineer?.skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-100">
                        {job.assignedEngineer.skills.slice(0, 4).map((s, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">
                            {typeof s === 'string' ? s : s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Service Address & Coordinates */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600" /> Location & Address
                  </p>
                  <p className="text-sm font-medium text-gray-900 leading-relaxed">
                    {job.address?.fullAddress || 'On-site execution'}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <span>City: <strong className="text-gray-800">{job.address?.city || 'Local'}</strong></span>
                    {job.address?.coordinates && (
                      <a
                        href={`https://www.google.com/maps?q=${job.address.coordinates.lat},${job.address.coordinates.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-600 font-bold hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View on Map
                      </a>
                    )}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-blue-600">Total Charge</p>
                    <p className="text-lg font-bold text-gray-900">₹{job.financials?.estimatedAmount?.toLocaleString('en-IN') || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-blue-600">Payment Status</p>
                    <span className="text-xs font-bold uppercase px-2 py-0.5 bg-white rounded border border-blue-200 text-blue-800 inline-block mt-1">
                      {job.financials?.paymentStatus || 'unpaid'}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-blue-600">Payout Status</p>
                    <span className="text-xs font-bold uppercase px-2 py-0.5 bg-white rounded border border-blue-200 text-blue-800 inline-block mt-1">
                      {job.financials?.payoutStatus || 'pending'}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-blue-600">Engineer Payout</p>
                    <p className="text-sm font-bold text-emerald-700 mt-1">₹{job.financials?.engineerPayout?.toLocaleString('en-IN') || 0}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Photos Gallery */}
            {activeTab === 'photos' && (
              <div className="space-y-6">
                {/* Before Photos */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Before Photos ({job.photos?.before?.length || 0})
                  </h4>
                  {job.photos?.before?.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {job.photos.before.map((url, i) => (
                        <div
                          key={i}
                          onClick={() => setSelectedPhoto(url)}
                          className="group relative aspect-video bg-gray-100 rounded-lg overflow-hidden border cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                        >
                          <img src={url} alt={`Before ${i + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                            View Full
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic bg-gray-50 p-4 rounded-lg">No before photos uploaded yet.</p>
                  )}
                </div>

                {/* Completion / After Photos */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Completion / After Photos ({job.photos?.after?.length || 0})
                  </h4>
                  {job.photos?.after?.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {job.photos.after.map((url, i) => (
                        <div
                          key={i}
                          onClick={() => setSelectedPhoto(url)}
                          className="group relative aspect-video bg-gray-100 rounded-lg overflow-hidden border cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all"
                        >
                          <img src={url} alt={`After ${i + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                            View Full
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic bg-gray-50 p-4 rounded-lg">No completion photos uploaded yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Notes & Remarks */}
            {activeTab === 'notes' && (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-2">
                  <p className="text-xs font-bold uppercase text-gray-400">Customer Requirements / Instructions</p>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                    {job.notes?.customerInstructions || 'No specific instructions provided.'}
                  </p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-2">
                  <p className="text-xs font-bold uppercase text-gray-400">Engineer Field Notes & Remarks</p>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                    {job.notes?.engineerRemarks || 'No field remarks logged yet.'}
                  </p>
                </div>

                {job.notes?.partsReplaced && (
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 space-y-1">
                    <p className="text-xs font-bold uppercase text-amber-800">Parts Replaced / Materials Used</p>
                    <p className="text-sm font-medium text-amber-900">{job.notes.partsReplaced}</p>
                  </div>
                )}
              </div>
            )}

            {/* Tab: OTP & Signatures */}
            {activeTab === 'verification' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Start OTP */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-2">
                    <p className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-blue-600" /> Start OTP Verification
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-gray-600">Verification Status:</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        job.verification?.startOtpVerified
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {job.verification?.startOtpVerified ? 'Verified' : 'Pending Verification'}
                      </span>
                    </div>
                  </div>

                  {/* End OTP / Customer Confirmation */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-2">
                    <p className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Completion Signoff Method
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-gray-600">Method:</span>
                      <span className="text-xs font-bold uppercase px-2 py-0.5 bg-gray-100 text-gray-800 rounded">
                        {job.verification?.signoffMethod || 'OTP / Signature'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Customer Signature Preview */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-2">
                  <p className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1.5">
                    <PenTool className="w-4 h-4 text-indigo-600" /> Customer Digital Signature
                  </p>
                  {job.verification?.signatureUrl ? (
                    <div className="p-3 bg-gray-50 rounded-lg border max-w-sm">
                      <img src={job.verification.signatureUrl} alt="Signature" className="max-h-24 object-contain mx-auto" />
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic bg-gray-50 p-4 rounded-lg">
                      Signature captured digitally upon completion.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Completion Proof */}
            {activeTab === 'proof' && (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4 text-emerald-600" /> Inspection & Proof Checklist
                    </p>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {job.proof?.completeness || 0}% Complete
                    </span>
                  </div>

                  {job.proof?.items?.length > 0 ? (
                    <div className="space-y-2">
                      {job.proof.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg text-xs">
                          <span className="font-semibold text-gray-800">{item.label}</span>
                          <span className={`px-2 py-0.5 rounded font-bold ${
                            item.submitted ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                          }`}>
                            {item.value || (item.submitted ? 'Verified' : 'Pending')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 italic bg-gray-50 p-4 rounded-lg">
                      Standard operations checklist completed and verified upon finish.
                    </p>
                  )}
                </div>
              </div>
            )}

          </div>
        ) : null}

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold transition-colors"
          >
            Close
          </button>

          {job && !job.assignedEngineer && (
            <button
              onClick={() => onOpenAssignEngineer?.(job)}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all"
            >
              <UserPlus className="w-4 h-4" /> Assign Engineer Now
            </button>
          )}
        </div>

      </div>

      {/* Full-Screen Photo Zoom Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
          <div className="relative max-w-3xl max-h-[85vh]">
            <img src={selectedPhoto} alt="Zoom" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain" />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-3 -right-3 p-2 bg-white text-gray-900 rounded-full shadow-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDetailsModal;
