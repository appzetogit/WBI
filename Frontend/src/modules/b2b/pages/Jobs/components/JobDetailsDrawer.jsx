import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiX, FiUser, FiMapPin, FiBriefcase, FiPhone, FiMail, 
  FiClock, FiCheckCircle, FiAlertCircle, FiFileText, FiImage, FiMessageCircle,
  FiShield
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../../../../services/api';
import ReportProblem from '../../../../user/components/disputes/ReportProblem';

const JobDetailsDrawer = ({ jobId, onClose }) => {
  const [activeTab, setActiveTab] = useState('details');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['b2bJobDetails', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const res = await api.get(`/b2b/jobs/${jobId}`);
      return res.data?.data;
    },
    enabled: !!jobId
  });

  const { data: timeline } = useQuery({
    queryKey: ['b2bJobTimeline', jobId],
    queryFn: async () => {
      if (!jobId) return [];
      const res = await api.get(`/b2b/jobs/timeline/${jobId}`);
      return res.data?.data || [];
    },
    enabled: !!jobId && activeTab === 'timeline'
  });

  const { data: enterpriseBundle, isLoading: flowLoading } = useQuery({
    queryKey: ['b2bJobEnterpriseFlow', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const res = await api.get(`/b2b/jobs/${jobId}/enterprise-flow`);
      return res.data?.data;
    },
    enabled: !!jobId && (activeTab === 'closure' || activeTab === 'details')
  });

  const flow = enterpriseBundle?.flow;
  const pendingB2bMilestones = enterpriseBundle?.pendingB2bMilestones || [];
  const vendorOpsProjectId = enterpriseBundle?.vendorOpsProjectId;

  const approveWorkMutation = useMutation({
    mutationFn: () => api.post(`/b2b/jobs/${jobId}/approve-work`, { approved: true }),
    onSuccess: (res) => {
      toast.success(res.data?.data?.pending
        ? 'Company approval recorded — awaiting other sign-offs'
        : 'Company approval complete — escrow released');
      queryClient.invalidateQueries({ queryKey: ['b2bJobEnterpriseFlow', jobId] });
      queryClient.invalidateQueries({ queryKey: ['b2bJobDetails', jobId] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Approval failed')
  });

  const approveMilestoneMutation = useMutation({
    mutationFn: ({ projectId, milestoneId }) =>
      api.post(`/b2b/jobs/projects/${projectId}/milestones/${milestoneId}/b2b-signoff`, { approved: true }),
    onSuccess: () => {
      toast.success('Milestone signed off');
      queryClient.invalidateQueries({ queryKey: ['b2bJobEnterpriseFlow', jobId] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Milestone sign-off failed')
  });

  const showJobApprove =
    flow?.jobSignoffs?.b2b === 'pending' &&
    ['completed', 'awaiting_b2b_approval', 'awaiting_customer_approval'].includes(flow?.status);

  if (!jobId) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        />

        {/* Drawer */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {isLoading ? 'Loading...' : data?.jobId}
              </h2>
              {data && (
                <p className="text-xs font-semibold text-gray-500 mt-1 flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full ${
                    data.status === 'completed' ? 'bg-green-50 text-green-600' :
                    data.status === 'in_progress' ? 'bg-blue-50 text-blue-600' :
                    data.status === 'pending' ? 'bg-yellow-50 text-yellow-600' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {data.status.replace('_', ' ').toUpperCase()}
                  </span>
                  <span>Batch: {data.batchId?.batchId || 'Manual'}</span>
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <div className="flex border-b border-gray-100 px-6 gap-6">
            {['details', 'closure', 'timeline', 'documents', 'support'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 text-sm font-semibold capitalize border-b-2 transition-colors ${
                  activeTab === tab 
                    ? 'border-[#10AFA5] text-[#10AFA5]' 
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin w-8 h-8 border-2 border-[#10AFA5] border-t-transparent rounded-full" />
              </div>
            ) : data ? (
              <div className="space-y-6">
                
                {/* Details Tab */}
                {activeTab === 'details' && (
                  <div className="space-y-6 animate-fade-in">
                    
                    {/* Customer Info */}
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <FiUser className="text-[#10AFA5]" /> Customer Details
                      </h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Name</p>
                          <p className="font-semibold text-gray-800">{data.customerName}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Phone</p>
                          <p className="font-semibold text-gray-800">{data.phone}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-gray-500 text-xs mb-1">Address</p>
                          <p className="font-semibold text-gray-800">{data.address}</p>
                        </div>
                      </div>
                    </div>

                    {/* Service Info */}
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <FiBriefcase className="text-[#10AFA5]" /> Service Details
                      </h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Service Type</p>
                          <p className="font-semibold text-gray-800">{data.service}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Sub Service</p>
                          <p className="font-semibold text-gray-800">{data.subService || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Priority</p>
                          <p className="font-semibold text-gray-800">{data.priority}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Charge</p>
                          <p className="font-semibold text-gray-800">₹ {data.charge?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Preferred Date</p>
                          <p className="font-semibold text-gray-800">
                            {new Date(data.preferredDate).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Assigned Engineer */}
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <FiCheckCircle className="text-[#10AFA5]" /> Assignment
                      </h3>
                      {data.assignedTo ? (
                        <div className="flex items-center gap-4">
                          <img 
                            src={data.assignedTo.profilePic || 'data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22%23E6F4F2%22/%3E%3Ccircle cx=%2220%22 cy=%2216%22 r=%227%22 fill=%22%2310AFA5%22/%3E%3Cpath d=%22M6 36c2-8 8-11 14-11s12 3 14 11%22 fill=%22%2310AFA5%22/%3E%3C/svg%3E'} 
                            alt="Engineer" 
                            className="w-12 h-12 rounded-full border-2 border-white shadow-sm"
                          />
                          <div>
                            <p className="font-bold text-gray-900">{data.assignedTo.firstName} {data.assignedTo.lastName}</p>
                            <p className="text-xs text-gray-500">⭐ {data.assignedTo.averageRating || 0} / 5</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 font-medium">No engineer assigned yet.</p>
                      )}
                    </div>

                  </div>
                )}

                {activeTab === 'closure' && (
                  <div className="space-y-4 animate-fade-in">
                    {flowLoading ? (
                      <div className="flex justify-center py-12">
                        <motion.div className="animate-spin w-8 h-8 border-2 border-[#10AFA5] border-t-transparent rounded-full" />
                      </div>
                    ) : !flow ? (
                      <p className="text-sm text-gray-500 text-center py-10">Enterprise escrow flow not started for this job yet.</p>
                    ) : (
                      <>
                        <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <FiShield className="text-[#10AFA5]" /> Escrow & company approval
                          </h3>
                          <p className="text-xs text-gray-500 mb-2">Flow status: <span className="font-semibold text-gray-800">{flow.status?.replace(/_/g, ' ')}</span></p>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-gray-500 text-xs">Escrow Locked</p>
                              <p className="font-bold">₹ {Number(flow.escrow?.heldAmount || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-xs">Released</p>
                              <p className="font-bold">₹ {Number(flow.escrow?.releasedAmount || 0).toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-white border">
                              Company Approval: {flow.jobSignoffs?.b2b || '—'}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-white border">
                              Site Sign-off: {flow.jobSignoffs?.customer || '—'}
                            </span>
                          </div>
                          {showJobApprove && (
                            <button
                              type="button"
                              disabled={approveWorkMutation.isPending}
                              onClick={() => approveWorkMutation.mutate()}
                              className="mt-4 w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
                            >
                              Company Approval — release escrow
                            </button>
                          )}
                        </div>
                        {pendingB2bMilestones.length > 0 && vendorOpsProjectId && (
                          <div className="space-y-3">
                            <p className="text-xs font-bold text-gray-500 uppercase">Milestones awaiting your sign-off</p>
                            {pendingB2bMilestones.map((ms) => (
                              <div key={ms._id} className="border border-gray-100 rounded-xl p-4 flex justify-between gap-3 items-center">
                                <div>
                                  <p className="font-semibold text-sm">{ms.title}</p>
                                  <p className="text-[11px] text-gray-400">{ms.milestoneCode}</p>
                                </div>
                                <button
                                  type="button"
                                  disabled={approveMilestoneMutation.isPending}
                                  onClick={() =>
                                    approveMilestoneMutation.mutate({
                                      projectId: vendorOpsProjectId,
                                      milestoneId: ms._id
                                    })
                                  }
                                  className="px-3 py-1.5 text-xs font-bold text-white bg-[#10AFA5] rounded-lg shrink-0"
                                >
                                  Sign off
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {(flow.timeline || []).length > 0 && (
                          <div className="border border-gray-100 rounded-xl p-4">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Enterprise timeline</p>
                            <ul className="space-y-2 max-h-48 overflow-y-auto">
                              {[...(flow.timeline || [])].reverse().slice(0, 12).map((ev, i) => (
                                <li key={`${ev.key}-${i}`} className="text-xs text-gray-600">
                                  <span className="font-medium text-gray-800">{ev.label || ev.key}</span>
                                  {ev.at && (
                                    <span className="text-gray-400"> · {new Date(ev.at).toLocaleString()}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Timeline Tab */}
                {activeTab === 'timeline' && (
                  <div className="space-y-4 animate-fade-in relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                    {!timeline || timeline.length === 0 ? (
                      <p className="text-center text-sm text-gray-500 py-10">No logs found.</p>
                    ) : (
                      timeline.map((log, index) => (
                        <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full border-4 border-white bg-[#10AFA5] text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                            <FiClock className="w-3 h-3" />
                          </div>
                          <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <h4 className="font-bold text-sm text-gray-900 capitalize">{log.status.replace('_', ' ')}</h4>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(log.timestamp).toLocaleString()}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-1 font-semibold uppercase tracking-wider">
                              By {log.updatedBy}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Documents / Photos Tab (Placeholder for Future feature) */}
                {activeTab === 'documents' && (
                  <div className="text-center py-20 animate-fade-in">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FiFileText className="w-8 h-8 text-gray-300" />
                    </div>
                    <h3 className="text-sm font-bold text-gray-700">No Documents Uploaded</h3>
                    <p className="text-xs text-gray-500 mt-1">Invoices, photos, and OTP receipts will appear here once the job is completed.</p>
                  </div>
                )}

                {/* Support Tab (Placeholder for Future feature) */}
                {activeTab === 'support' && (
                  <div className="text-center py-20 animate-fade-in">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FiMessageCircle className="w-8 h-8 text-gray-300" />
                    </div>
                    <h3 className="text-sm font-bold text-gray-700">Problem with this job?</h3>
                    <p className="text-xs text-gray-500 mt-1 mb-6">Report it and our team will review it — refunds go back to your wallet.</p>
                    <ReportProblem source="b2b" sourceId={jobId} className="px-6" />
                  </div>
                )}

              </div>
            ) : (
              <div className="text-center py-20 text-gray-500">Failed to load job details.</div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default JobDetailsDrawer;
