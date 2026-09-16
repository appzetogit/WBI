import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiEye,
  FiSearch,
  FiFilter,
  FiShield,
  FiCamera,
  FiUserCheck,
  FiDollarSign,
  FiAlertTriangle,
  FiRefreshCw,
  FiFileText,
  FiX,
  FiMapPin
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import b2bAdminService from '../../services/b2bAdminService';
import { getUserFacingError } from '../../../../utils/userFacingError';
import LogoLoader from '../../../../components/common/LogoLoader';

const STATUS_TABS = [
  { id: 'pending_review', label: 'Pending Review' },
  { id: 'completed', label: 'Approved & Completed' },
  { id: 'revision_required', label: 'Revision Requested' },
  { id: 'all', label: 'All Submissions' }
];

const B2BJobSubmissions = () => {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('pending_review');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const [selectedJobId, setSelectedJobId] = useState(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionRemarks, setRejectionRemarks] = useState('');

  // Fetch Submissions List
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['adminB2BSubmissions', activeTab, searchQuery, page],
    queryFn: () => b2bAdminService.getSubmissions({ status: activeTab, search: searchQuery, page, limit: 20 }),
    staleTime: 1000 * 10,
    refetchOnWindowFocus: true
  });

  // Fetch Submission Detail Modal
  const { data: detailData, isLoading: isDetailLoading } = useQuery({
    queryKey: ['adminB2BSubmissionDetail', selectedJobId],
    queryFn: () => b2bAdminService.getSubmissionDetail(selectedJobId),
    enabled: !!selectedJobId,
    staleTime: 1000 * 5
  });

  const submissions = data?.data || [];
  const counts = data?.counts || {};
  const jobDetail = detailData?.data?.job;
  const timeline = detailData?.data?.timeline || [];

  // Approve Mutation
  const approveMutation = useMutation({
    mutationFn: (jobId) => b2bAdminService.approveSubmission(jobId),
    onSuccess: (res) => {
      toast.success(res.message || 'Job completion approved & payout released!');
      setSelectedJobId(null);
      queryClient.invalidateQueries(['adminB2BSubmissions']);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to approve completion'))
  });

  // Reject / Revision Mutation
  const rejectMutation = useMutation({
    mutationFn: () =>
      b2bAdminService.rejectSubmission(selectedJobId, { remarks: rejectionRemarks }),
    onSuccess: (res) => {
      toast.success(res.message || 'Revision requested from engineer');
      setRejectModalOpen(false);
      setSelectedJobId(null);
      setRejectionRemarks('');
      queryClient.invalidateQueries(['adminB2BSubmissions']);
    },
    onError: (err) => toast.error(getUserFacingError(err, 'Failed to request revision'))
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completion_submitted':
      case 'admin_review':
        return <span className="px-2.5 py-1 text-xs font-black rounded-full bg-purple-100 text-purple-800 border border-purple-200">PENDING QA REVIEW</span>;
      case 'completed':
        return <span className="px-2.5 py-1 text-xs font-black rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">APPROVED & RELEASED</span>;
      case 'revision_required':
        return <span className="px-2.5 py-1 text-xs font-black rounded-full bg-amber-100 text-amber-900 border border-amber-300">REVISION REQUESTED</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-black uppercase rounded-full bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <FiCheckCircle className="text-[#10AFA5]" /> B2B Job Completion Verification
          </h1>
          <p className="text-xs text-gray-500 mt-1">Review work evidence photos, checklists, and approve escrow payout release</p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all"
        >
          <FiRefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} /> Refresh Submissions
        </button>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase">Pending Review</span>
          <p className="text-2xl font-black text-purple-700">{counts.pending_review || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase">Approved & Completed</span>
          <p className="text-2xl font-black text-emerald-600">{counts.completed || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase">Revisions Requested</span>
          <p className="text-2xl font-black text-amber-600">{counts.revision_required || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase">Total Submissions</span>
          <p className="text-2xl font-black text-gray-900">{counts.all || 0}</p>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
        <div className="flex gap-2 overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setPage(1); }}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                  isActive
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[260px]">
          <FiSearch className="absolute left-3.5 top-3 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Job ID, Customer, Engineer..."
            className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-[#10AFA5]"
          />
        </div>
      </div>

      {/* Table / List */}
      {isLoading ? (
        <div className="flex justify-center py-20 bg-white rounded-2xl border border-gray-100">
          <LogoLoader />
        </div>
      ) : submissions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center space-y-3">
          <FiCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="font-bold text-gray-800 text-base">No Submissions Found</p>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            {activeTab === 'pending_review'
              ? 'No B2B job submissions currently waiting for QA verification.'
              : 'No matching job submissions found.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[10px]">
                  <th className="py-3.5 px-4">Job ID & Service</th>
                  <th className="py-3.5 px-4">Company / Customer</th>
                  <th className="py-3.5 px-4">Assigned Engineer</th>
                  <th className="py-3.5 px-4">Submitted At</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {submissions.map((job) => {
                  const engineerName = job.assignedTo?.name || job.assignedToName || 'Engineer';
                  const companyName = job.companyId?.companyName || 'Corporate Client';
                  const submittedAtStr = job.completionSubmittedAt
                    ? new Date(job.completionSubmittedAt).toLocaleString()
                    : new Date(job.updatedAt).toLocaleString();

                  return (
                    <tr key={job._id} className="hover:bg-gray-50/60 transition-all">
                      <td className="py-3.5 px-4">
                        <span className="font-black text-gray-900 block text-xs">{job.jobId}</span>
                        <span className="font-bold text-[#10AFA5] text-[11px]">{job.service}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-gray-900 block">{job.customerName}</span>
                        <span className="text-gray-500 text-[11px]">{companyName}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-gray-800 block flex items-center gap-1">
                          <FiUserCheck className="text-teal-600" /> {engineerName}
                        </span>
                        {job.assignedVendorId && (
                          <span className="text-[10px] text-purple-700 font-semibold block">
                            Vendor: {job.assignedVendorId.vendorName || job.assignedVendorId.businessName}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 font-medium">{submittedAtStr}</td>
                      <td className="py-3.5 px-4">{getStatusBadge(job.status)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedJobId(job._id)}
                          className="px-3 py-1.5 rounded-xl bg-[#10AFA5] hover:bg-teal-600 text-white font-extrabold text-xs shadow-xs transition-all inline-flex items-center gap-1"
                        >
                          <FiEye /> Review Submission
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VERIFICATION DETAIL DRAWER / MODAL */}
      {selectedJobId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-6 border border-gray-100">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-gray-100 pb-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#10AFA5] tracking-wider block">SUBMISSION QA VERIFICATION</span>
                <h2 className="text-xl font-black text-gray-900">{jobDetail?.jobId}</h2>
                <p className="text-xs text-gray-500">{jobDetail?.service} · {jobDetail?.customerName}</p>
              </div>
              <button
                onClick={() => setSelectedJobId(null)}
                className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-all"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {isDetailLoading ? (
              <div className="flex justify-center py-16"><LogoLoader /></div>
            ) : jobDetail ? (
              <div className="space-y-6">
                {/* Status Bar */}
                <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-gray-400 block">Current Status</span>
                    {getStatusBadge(jobDetail.status)}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-gray-400 block">Payout Amount</span>
                    <span className="text-base font-black text-emerald-700">₹{jobDetail.charge || 0}</span>
                  </div>
                </div>

                {/* Evidence Photos: Side-by-Side Before vs After */}
                <div className="space-y-2">
                  <h3 className="text-xs font-black uppercase text-gray-500 tracking-wider flex items-center gap-1.5">
                    <FiCamera className="text-[#10AFA5]" /> Work Evidence Photos Comparison
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Before Photo */}
                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 space-y-2">
                      <span className="text-xs font-extrabold text-gray-700 uppercase block">BEFORE WORK PHOTO</span>
                      {jobDetail.beforePhotos?.length > 0 ? (
                        <img src={jobDetail.beforePhotos[0]} alt="Before" className="w-full h-56 object-cover rounded-xl border border-gray-300" />
                      ) : (
                        <div className="h-56 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400">
                          No before photo captured
                        </div>
                      )}
                    </div>

                    {/* After Photo */}
                    <div className="bg-teal-50/50 p-3 rounded-2xl border border-teal-200 space-y-2">
                      <span className="text-xs font-extrabold text-teal-900 uppercase block">AFTER WORK PHOTO</span>
                      {jobDetail.afterPhotos?.length > 0 ? (
                        <img src={jobDetail.afterPhotos[0]} alt="After" className="w-full h-56 object-cover rounded-xl border border-teal-300" />
                      ) : (
                        <div className="h-56 rounded-xl border border-dashed border-teal-300 flex items-center justify-center text-xs text-teal-600">
                          No after photo captured
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Checklist & Work Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Checklist */}
                  <div className="bg-white p-4 rounded-2xl border border-gray-200 space-y-3">
                    <h4 className="text-xs font-black uppercase text-gray-500">Service Checklist Responses</h4>
                    {jobDetail.checklist?.length > 0 ? (
                      <div className="space-y-2 text-xs">
                        {jobDetail.checklist.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-gray-800">
                            {item.checked ? (
                              <FiCheckCircle className="text-emerald-600 w-4 h-4 shrink-0" />
                            ) : (
                              <FiXCircle className="text-gray-300 w-4 h-4 shrink-0" />
                            )}
                            <span className={item.checked ? 'font-bold' : 'text-gray-400'}>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No checklist items recorded.</p>
                    )}
                  </div>

                  {/* Work Notes & Parts Replaced */}
                  <div className="bg-white p-4 rounded-2xl border border-gray-200 space-y-3 text-xs">
                    <h4 className="text-xs font-black uppercase text-gray-500">Engineer Work Remarks</h4>
                    <div>
                      <span className="font-bold text-gray-700 block text-[10px] uppercase">Work Notes:</span>
                      <p className="text-gray-800 bg-gray-50 p-2.5 rounded-xl mt-1 min-h-[50px]">
                        {jobDetail.workNotes || 'No work notes provided.'}
                      </p>
                    </div>
                    <div>
                      <span className="font-bold text-gray-700 block text-[10px] uppercase">Parts Replaced:</span>
                      <p className="text-gray-800 bg-gray-50 p-2.5 rounded-xl mt-1">
                        {jobDetail.partsReplaced || 'None'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Timeline Audit */}
                {timeline.length > 0 && (
                  <div className="bg-gray-50 p-4 rounded-2xl space-y-2">
                    <h4 className="text-xs font-black uppercase text-gray-500">Audit History Timeline</h4>
                    <div className="space-y-2 text-xs">
                      {timeline.map((t, idx) => (
                        <div key={idx} className="flex items-center justify-between border-b border-gray-200/60 pb-1.5">
                          <span className="font-bold uppercase text-gray-800">{t.status.replace(/_/g, ' ')}</span>
                          <span className="text-gray-500 text-[11px]">{t.remarks}</span>
                          <span className="text-gray-400 text-[10px]">{new Date(t.createdAt).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom Action CTAs */}
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setRejectModalOpen(true)}
                    className="flex-1 py-3.5 rounded-2xl border border-rose-300 text-rose-700 font-extrabold text-xs hover:bg-rose-50 transition-all flex items-center justify-center gap-1.5"
                  >
                    <FiXCircle className="w-4 h-4" /> Request Revision / Reject
                  </button>

                  <button
                    type="button"
                    disabled={approveMutation.isPending}
                    onClick={() => approveMutation.mutate(selectedJobId)}
                    className="flex-1 py-3.5 rounded-2xl bg-[#10AFA5] hover:bg-teal-600 text-white font-black text-xs shadow-lg shadow-teal-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <FiCheckCircle className="w-4 h-4" />
                    {approveMutation.isPending ? 'Approving & Releasing…' : 'APPROVE COMPLETION & RELEASE PAYOUT'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* REJECT / REVISION MODAL */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="font-black text-gray-900 text-lg text-center">Request Revision from Engineer</h3>
            <p className="text-xs text-gray-500 text-center">Specify what details or evidence photos the engineer needs to correct.</p>
            <textarea
              value={rejectionRemarks}
              onChange={(e) => setRejectionRemarks(e.target.value)}
              placeholder="e.g. After photo is blurry, please re-upload clear photo of repaired panel."
              className="w-full border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 min-h-[90px]"
            />
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectMutation.isPending || !rejectionRemarks}
                onClick={() => rejectMutation.mutate()}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-md disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Submitting…' : 'Submit Revision Notice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default B2BJobSubmissions;
