import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FiBriefcase,
  FiClock,
  FiMapPin,
  FiPlay,
  FiCheckCircle,
  FiAlertTriangle,
  FiNavigation,
  FiSearch,
  FiXCircle,
  FiEye,
  FiShield,
  FiDollarSign,
  FiUserCheck,
  FiFilter,
  FiRefreshCw
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import engineerService from '../../../../services/engineerService';
import { getUserFacingError } from '../../../../utils/userFacingError';
import LogoLoader from '../../../../components/common/LogoLoader';

const REJECTION_REASONS = [
  'Unable to reach location',
  'Schedule conflict',
  'Wrong service / skill gap',
  'Outside service area',
  'Other'
];

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'assigned', label: 'New / Assigned' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'travelling', label: 'Travelling' },
  { id: 'arrived', label: 'Arrived' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completion_submitted', label: 'Under Review' },
  { id: 'completed', label: 'Completed' },
  { id: 'rejected', label: 'Rejected' }
];

const B2BJobs = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeStatusFilter = searchParams.get('status') || 'all';
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('preferredDate');

  const [acceptModal, setAcceptModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectionReason, setRejectionReason] = useState(REJECTION_REASONS[0]);
  const [rejectionRemarks, setRejectionRemarks] = useState('');

  // Fetch B2B Jobs with active filter & search
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['engineerB2BJobs', activeStatusFilter, searchQuery, sortBy],
    queryFn: () => engineerService.getB2BJobs({ status: activeStatusFilter, search: searchQuery, sortBy }),
    staleTime: 1000 * 15,
    refetchOnWindowFocus: true
  });

  const jobs = data?.jobs || [];
  const counts = data?.counts || {};

  // Accept Mutation
  const acceptMutation = useMutation({
    mutationFn: (jobId) => engineerService.acceptB2BJob(jobId),
    onSuccess: (res, jobId) => {
      toast.success(res.message || 'Job accepted successfully!');
      setAcceptModal(null);
      queryClient.invalidateQueries(['engineerB2BJobs']);
      navigate(`/engineer/b2b-jobs/${jobId}`);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to accept job'))
  });

  // Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: () =>
      engineerService.rejectB2BJob(rejectModal._id, {
        rejectionReason,
        rejectionRemarks
      }),
    onSuccess: (res) => {
      toast.success(res.message || 'Job offer rejected');
      setRejectModal(null);
      setRejectionRemarks('');
      queryClient.invalidateQueries(['engineerB2BJobs']);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to reject job'))
  });

  const handleFilterSelect = (statusId) => {
    if (statusId === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', statusId);
    }
    setSearchParams(searchParams);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'assigned':
        return <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-blue-50 text-blue-700 border border-blue-200">ASSIGNED</span>;
      case 'accepted':
        return <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">ACCEPTED</span>;
      case 'travelling':
        return <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1"><FiNavigation className="animate-pulse" /> TRAVELLING</span>;
      case 'arrived':
        return <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">ARRIVED AT SITE</span>;
      case 'in_progress':
        return <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1"><FiClock className="animate-spin" /> IN PROGRESS</span>;
      case 'completion_submitted':
      case 'admin_review':
        return <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-purple-50 text-purple-700 border border-purple-200">UNDER QA REVIEW</span>;
      case 'completed':
        return <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">COMPLETED</span>;
      case 'rejected':
        return <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-rose-50 text-rose-700 border border-rose-200">REJECTED</span>;
      case 'failed':
        return <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-gray-100 text-gray-700 border border-gray-300">CLOSED / INCOMPLETE</span>;
      default:
        return <span className="px-2.5 py-1 text-[11px] font-extrabold uppercase rounded-full bg-gray-100 text-gray-600">{status}</span>;
    }
  };

  const getPriorityBadge = (priority) => {
    if (priority === 'High') {
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-100 text-rose-700 uppercase">HIGH PRIORITY</span>;
    }
    if (priority === 'Medium') {
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-100 text-amber-800 uppercase">MEDIUM</span>;
    }
    return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700 uppercase">LOW</span>;
  };

  return (
    <div className="min-h-screen bg-[#F8FCFC] pb-24">
      {/* Top Header */}
      <div className="bg-gradient-to-r from-gray-900 via-slate-900 to-teal-950 text-white p-4 pt-6 shadow-md">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-[#10AFA5]/20 text-[#10AFA5]">
                  <FiBriefcase className="w-5 h-5" />
                </span>
                <h1 className="text-xl font-black tracking-tight">B2B Service Jobs</h1>
              </div>
              <p className="text-xs text-gray-300 mt-0.5">Corporate job tickets & site execution</p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all text-sm flex items-center gap-1"
            >
              <FiRefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex gap-2 pt-1">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Job ID, Customer, City..."
                className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-400 focus:outline-none focus:bg-white/20"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value="preferredDate" className="bg-gray-900">Schedule Date</option>
              <option value="priority" className="bg-gray-900">Priority</option>
              <option value="latest" className="bg-gray-900">Newest First</option>
              <option value="route" className="bg-gray-900">Optimized Route (Nearest First)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Horizontal Scrollable Status Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {STATUS_FILTERS.map((tab) => {
            const isActive = activeStatusFilter === tab.id;
            const count = counts[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => handleFilterSelect(tab.id)}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#10AFA5] text-white shadow-sm shadow-teal-500/30'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {tab.label}
                {count !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 text-[10px] rounded-full font-black ${
                      isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <LogoLoader />
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center space-y-3 my-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-teal-50 text-[#10AFA5] flex items-center justify-center">
              <FiBriefcase className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-base">No B2B Jobs Found</p>
              <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                {activeStatusFilter === 'all'
                  ? 'No corporate jobs currently assigned to your account.'
                  : `No jobs currently matching status "${activeStatusFilter}".`}
              </p>
            </div>
            {activeStatusFilter !== 'all' && (
              <button
                onClick={() => handleFilterSelect('all')}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#10AFA5] hover:underline"
              >
                Clear Filter
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const isVendorBased = job.assignmentType === 'vendor_engineer' || !!job.assignedVendorId;
              const vendorName = job.assignedVendorId?.vendorName || job.assignedVendorId?.businessName || job.assignedVendorName || 'Partner Firm';

              return (
                <div
                  key={job._id}
                  className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all space-y-3 relative overflow-hidden"
                >
                  {/* Top Bar: Job ID + Status */}
                  <div className="flex justify-between items-start gap-2 border-b border-gray-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-gray-900 text-sm tracking-tight">{job.jobId}</span>
                        {getPriorityBadge(job.priority)}
                      </div>
                      <p className="text-xs font-bold text-[#10AFA5] mt-0.5">{job.service}</p>
                    </div>
                    {getStatusBadge(job.status)}
                  </div>

                  {/* Customer / Company Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-gray-400">Customer / Company</span>
                      <p className="font-bold text-gray-800 truncate">{job.customerName}</p>
                      {job.companyId?.companyName && (
                        <p className="text-[11px] text-gray-500 truncate">{job.companyId.companyName}</p>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-gray-400">Schedule</span>
                      <p className="font-bold text-gray-800">
                        {job.preferredDate ? new Date(job.preferredDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Flexible'}
                      </p>
                      <p className="text-[11px] text-gray-500 flex items-center gap-1">
                        <FiClock className="w-3 h-3 text-teal-600" /> {job.preferredTime || 'Anytime'}
                      </p>
                    </div>
                  </div>

                  {/* Location Address */}
                  <div className="bg-gray-50/80 rounded-xl p-2.5 text-xs text-gray-600 space-y-1">
                    <p className="font-medium text-gray-700 flex items-start gap-1.5">
                      <FiMapPin className="text-[#10AFA5] w-4 h-4 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{job.address}, {job.city} {job.pincode ? `- ${job.pincode}` : ''}</span>
                    </p>
                  </div>

                  {/* Badges Bar: Vendor Tag & Payout Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {/* Assignment Type Badge */}
                    {isVendorBased ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                        <FiUserCheck className="w-3 h-3" /> Vendor: {vendorName}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1">
                        <FiShield className="w-3 h-3" /> Direct Freelancer
                      </span>
                    )}

                    {/* Payment Info */}
                    {job.charge > 0 && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                        <FiDollarSign className="w-3 h-3 text-emerald-600" /> Est. ₹{job.charge}
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => navigate(`/engineer/b2b-jobs/${job._id}`)}
                      className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-50 transition-all flex items-center justify-center gap-1"
                    >
                      <FiEye className="w-3.5 h-3.5 text-gray-500" /> View Details
                    </button>

                    {['pending', 'searching_engineer', 'assigned'].includes(job.status) && (
                      <>
                        <button
                          type="button"
                          onClick={() => setRejectModal(job)}
                          className="px-3 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-xs transition-all flex items-center gap-1"
                        >
                          <FiXCircle /> Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setAcceptModal(job)}
                          className="flex-1 py-2 rounded-xl bg-[#10AFA5] hover:bg-teal-600 text-white font-bold text-xs shadow-sm shadow-teal-500/30 transition-all flex items-center justify-center gap-1"
                        >
                          <FiCheckCircle /> Accept Offer
                        </button>
                      </>
                    )}

                    {job.status === 'accepted' && (
                      <button
                        type="button"
                        onClick={() => navigate(`/engineer/b2b-jobs/${job._id}`)}
                        className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1"
                      >
                        <FiNavigation /> Start Travel
                      </button>
                    )}

                    {job.status === 'travelling' && (
                      <button
                        type="button"
                        onClick={() => navigate(`/engineer/b2b-jobs/${job._id}`)}
                        className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1"
                      >
                        <FiMapPin /> Confirm Arrival
                      </button>
                    )}

                    {job.status === 'arrived' && (
                      <button
                        type="button"
                        onClick={() => navigate(`/engineer/b2b-jobs/${job._id}`)}
                        className="flex-1 py-2 rounded-xl bg-[#10AFA5] hover:bg-teal-600 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1"
                      >
                        <FiPlay /> Start Job (OTP)
                      </button>
                    )}

                    {job.status === 'in_progress' && (
                      <button
                        type="button"
                        onClick={() => navigate(`/engineer/b2b-jobs/${job._id}`)}
                        className="flex-1 py-2 rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1"
                      >
                        <FiCheckCircle /> Complete Service
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ACCEPT CONFIRMATION MODAL */}
      {acceptModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-xl border border-gray-100">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-[#10AFA5] flex items-center justify-center mx-auto">
              <FiBriefcase className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-extrabold text-gray-900 text-lg">Accept Job Offer?</h3>
              <p className="text-xs text-gray-500">
                Are you ready to accept job <span className="font-bold text-gray-800">{acceptModal.jobId}</span> for{' '}
                <span className="font-bold text-gray-800">{acceptModal.service}</span>?
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
              <p><span className="font-semibold text-gray-700">Customer:</span> {acceptModal.customerName}</p>
              <p><span className="font-semibold text-gray-700">Location:</span> {acceptModal.address}, {acceptModal.city}</p>
              <p><span className="font-semibold text-gray-700">Priority:</span> {acceptModal.priority}</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAcceptModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={acceptMutation.isPending}
                onClick={() => acceptMutation.mutate(acceptModal._id)}
                className="flex-1 py-2.5 rounded-xl bg-[#10AFA5] text-white text-xs font-extrabold shadow-md shadow-teal-500/30 hover:bg-teal-600 transition-all disabled:opacity-50"
              >
                {acceptMutation.isPending ? 'Accepting…' : 'Confirm & Accept'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-xl border border-gray-100">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <FiAlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-extrabold text-gray-900 text-lg">Reject Job Offer</h3>
              <p className="text-xs text-gray-500">
                Please select a mandatory reason for rejecting job <span className="font-bold text-gray-800">{rejectModal.jobId}</span>.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-bold text-gray-700 block">Select Reason *</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {REJECTION_REASONS.map((r) => (
                  <label
                    key={r}
                    onClick={() => setRejectionReason(r)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      rejectionReason === r ? 'border-rose-500 bg-rose-50/50 text-rose-900 font-bold' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rejectionReason"
                      checked={rejectionReason === r}
                      onChange={() => setRejectionReason(r)}
                      className="accent-rose-600"
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="font-bold text-gray-700 text-xs block mb-1">Additional Remarks (Optional)</label>
              <textarea
                value={rejectionRemarks}
                onChange={(e) => setRejectionRemarks(e.target.value)}
                placeholder="Provide context on why you cannot accept..."
                className="w-full border border-gray-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500 min-h-[70px]"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate()}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold shadow-md shadow-rose-500/30 hover:bg-rose-700 transition-all disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting…' : 'Submit Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default B2BJobs;
