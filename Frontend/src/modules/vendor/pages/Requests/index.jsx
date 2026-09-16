import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Inbox,
  Building2,
  Briefcase,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  UserPlus,
  Clock,
  MapPin,
  User,
  ArrowRight,
  RefreshCw,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  Layers,
  Sparkles,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchRequests, acceptRequest, rejectRequest } from '../../services/requestsService';
import { useVendorConfig } from '../../context/VendorConfigContext';
import { useVendorSocket } from '../../context/VendorSocketContext';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import RequestDetailsModal from './components/RequestDetailsModal';
import RejectReasonModal from './components/RejectReasonModal';
import AssignEngineerModal from './components/AssignEngineerModal';

const STATUS_FILTERS = [
  { id: 'all', label: 'All Statuses' },
  { id: 'new', label: 'New / Action Req.' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'rejected', label: 'Rejected' }
];

const Requests = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { path } = useVendorBasePath();
  const { approvedServices = [] } = useVendorConfig() || {};
  const { socket } = useVendorSocket() || {};

  // Active Tab from query param or default
  const activeTab = searchParams.get('tab') || 'all'; // 'all' | 'user' | 'b2b'
  const activeStatus = searchParams.get('status') || 'all';

  // State
  const [data, setData] = useState([]);
  const [counts, setCounts] = useState({
    total: 0,
    userProjects: 0,
    b2bJobs: 0,
    newRequests: 0,
    userNew: 0,
    b2bNew: 0,
    accepted: 0,
    assigned: 0,
    inProgress: 0,
    completed: 0,
    rejected: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, pages: 1 });

  // Modals state
  const [selectedRequestDetails, setSelectedRequestDetails] = useState(null);
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [assigningRequest, setAssigningRequest] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Fetch Requests Function
  const loadRequests = useCallback(
    async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);

      try {
        const res = await fetchRequests({
          source: activeTab === 'all' ? 'all' : activeTab === 'user' ? 'user' : 'b2b',
          status: activeStatus,
          search: searchQuery,
          category: selectedCategory,
          page: pagination.page,
          limit: pagination.limit
        });

        if (res.data?.success) {
          setData(res.data.data || []);
          if (res.data.counts) setCounts(res.data.counts);
          if (res.data.pagination) setPagination(res.data.pagination);
        }
      } catch (err) {
        console.warn('[Requests] Fetch error:', err.message);
        toast.error('Failed to load requests');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, activeStatus, searchQuery, selectedCategory, pagination.page, pagination.limit]
  );

  // Initial & Dependency Load
  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Live Socket Sync
  useEffect(() => {
    const handleSync = () => {
      loadRequests(true);
    };

    window.addEventListener('vendor-opportunity-new', handleSync);
    window.addEventListener('vendor-service-approved', handleSync);

    if (socket) {
      socket.on('b2b:jobStatusUpdated', handleSync);
      socket.on('project_update', handleSync);
      socket.on('booking_updated', handleSync);
    }

    return () => {
      window.removeEventListener('vendor-opportunity-new', handleSync);
      window.removeEventListener('vendor-service-approved', handleSync);
      if (socket) {
        socket.off('b2b:jobStatusUpdated', handleSync);
        socket.off('project_update', handleSync);
        socket.off('booking_updated', handleSync);
      }
    };
  }, [loadRequests, socket]);

  // Tab Switch Handler
  const handleTabChange = (tabId) => {
    setSearchParams((prev) => {
      prev.set('tab', tabId);
      prev.set('page', '1');
      return prev;
    });
  };

  // Status Filter Handler
  const handleStatusChange = (statusId) => {
    setSearchParams((prev) => {
      prev.set('status', statusId);
      prev.set('page', '1');
      return prev;
    });
  };

  // Quick Accept Action
  const handleAccept = async (req) => {
    setActionLoadingId(req.id);
    try {
      const res = await acceptRequest(req.id, {
        amount: req.estimatedAmount,
        teamSize: 1
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'Request accepted successfully!');
        // Refresh requests
        loadRequests(true);
        // Automatically prompt to assign engineer
        setAssigningRequest({
          ...req,
          linkedProjectId: res.data.data?.projectId || req.id
        });
      } else {
        toast.error(res.data?.message || 'Failed to accept request');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to accept request');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Confirm Rejection
  const handleConfirmReject = async (id, reason) => {
    try {
      const res = await rejectRequest(id, reason);
      if (res.data?.success) {
        toast.success('Request declined');
        setRejectingRequest(null);
        if (selectedRequestDetails?.id === id) setSelectedRequestDetails(null);
        loadRequests(true);
      } else {
        toast.error(res.data?.message || 'Failed to decline request');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to decline request');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-50/50 min-h-screen">
      {/* ── HEADER & CONTROLS ── */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Requests Management</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
              User & B2B Pipeline
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Review, Accept/Reject incoming requests and seamlessly assign workforce engineers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadRequests(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-[#0D8A72]' : ''}`} />
            {refreshing ? 'Syncing...' : 'Sync Requests'}
          </button>
        </div>
      </div>

      {/* ── WORKFLOW STRUCTURE BANNER ── */}
      <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-[#0D8A72]/10 via-blue-50 to-indigo-50 border border-[#0D8A72]/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-[#0D8A72] text-white flex items-center justify-center shrink-0 shadow-xs">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-800">Operational Request Pipeline</h4>
            <div className="flex items-center gap-2 text-xs text-gray-600 mt-0.5 flex-wrap">
              <span className="font-semibold text-cyan-800 bg-cyan-100/60 px-2 py-0.5 rounded">1. User / B2B Request</span>
              <ArrowRight className="h-3 w-3 text-gray-400" />
              <span className="font-semibold text-emerald-800 bg-emerald-100/60 px-2 py-0.5 rounded">2. Accept / Reject</span>
              <ArrowRight className="h-3 w-3 text-gray-400" />
              <span className="font-semibold text-blue-800 bg-blue-100/60 px-2 py-0.5 rounded">3. Assign Engineer</span>
              <ArrowRight className="h-3 w-3 text-gray-400" />
              <span className="font-semibold text-purple-800 bg-purple-100/60 px-2 py-0.5 rounded">4. Engineer App Execution</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── PRIMARY WORKSPACE TABS & COUNTS ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden mb-6">
        {/* Main Tab Navigation */}
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4 bg-gray-50/50">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {[
              { id: 'all', label: 'All Requests', count: counts.total, badge: null, icon: Inbox },
              { id: 'user', label: 'User Projects', count: counts.userProjects, newCount: counts.userNew, icon: User },
              { id: 'b2b', label: 'B2B Jobs', count: counts.b2bJobs, newCount: counts.b2bNew, icon: Building2 }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                    isActive
                      ? 'bg-white text-gray-900 shadow-xs border border-gray-200'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/80'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-[#0D8A72]' : 'text-gray-400'}`} />
                  <span>{tab.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      isActive ? 'bg-[#0D8A72] text-white' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                  {tab.newCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-red-500 text-white animate-pulse">
                      {tab.newCount} NEW
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Search */}
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search request ID, client, city..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-[#0D8A72] outline-none"
            />
          </div>
        </div>

        {/* Sub-Filters: Status & Category */}
        <div className="px-6 py-3 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
            <span className="font-semibold text-gray-400 mr-1 uppercase text-[10px]">Status:</span>
            {STATUS_FILTERS.map((st) => (
              <button
                key={st.id}
                onClick={() => handleStatusChange(st.id)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 ${
                  activeStatus === st.id
                    ? 'bg-gray-900 text-white font-bold'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {approvedServices.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-[11px] font-medium">Domain:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="p-1 rounded-lg border border-gray-200 text-xs font-semibold bg-gray-50 focus:ring-1 focus:ring-[#0D8A72] outline-none"
              >
                <option value="">All Registered Services</option>
                {approvedServices.map((s) => (
                  <option key={s.categoryCode} value={s.categoryCode}>
                    {s.categoryName} ({s.categoryCode})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── REQUESTS LIST / CARDS ── */}
        <div className="p-6">
          {loading ? (
            <div className="space-y-3 py-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="py-12 text-center">
              <Inbox className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-3 text-base font-semibold text-gray-900">No requests found</h3>
              <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
                No requests match your current filters. Incoming consumer service requests and B2B opportunities will appear here.
              </p>
              {(searchQuery || activeStatus !== 'all' || selectedCategory) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('');
                    handleStatusChange('all');
                  }}
                  className="mt-4 px-3.5 py-1.5 text-xs font-semibold text-[#0D8A72] bg-[#0D8A72]/10 rounded-lg hover:bg-[#0D8A72]/20"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {data.map((req) => {
                const isUserProject = req.source === 'USER PROJECT' || req.sourceType === 'user';
                const isNew = req.status === 'new';
                const isAccepted = req.status === 'accepted';
                const isAssigned = req.status === 'assigned';
                const isInProgress = req.status === 'in_progress';
                const isCompleted = req.status === 'completed';
                const isRejected = req.status === 'rejected';

                return (
                  <motion.div
                    key={req.id}
                    layout
                    className="p-5 rounded-2xl border border-gray-200 hover:border-gray-300 bg-white hover:shadow-xs transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                  >
                    {/* Left Info */}
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                      {/* Source Badge */}
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider shrink-0 mt-0.5 ${
                          isUserProject
                            ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        {isUserProject ? 'USER PROJECT' : 'B2B JOB'}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                            {req.title}
                          </h3>
                          <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                            {req.requestId}
                          </span>

                          {/* Status Pill */}
                          {isNew && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              NEW REQUEST
                            </span>
                          )}
                          {isAccepted && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              ACCEPTED
                            </span>
                          )}
                          {isAssigned && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              ENGINEER ASSIGNED
                            </span>
                          )}
                          {isInProgress && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              IN PROGRESS
                            </span>
                          )}
                          {isCompleted && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              COMPLETED
                            </span>
                          )}
                          {isRejected && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                              REJECTED
                            </span>
                          )}
                        </div>

                        {/* Metadata row */}
                        <div className="flex items-center gap-4 mt-2.5 text-xs text-gray-500 flex-wrap">
                          <span className="inline-flex items-center gap-1 font-semibold text-gray-800">
                            <User className="h-3.5 w-3.5 text-gray-400" />
                            {req.customerName || req.companyName}
                          </span>
                          {req.city && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-gray-400" />
                              {req.city}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 font-medium text-gray-600">
                            <Layers className="h-3.5 w-3.5 text-gray-400" />
                            {req.categoryName}
                          </span>
                          {req.estimatedAmount > 0 && (
                            <span className="font-bold text-gray-900 bg-gray-50 px-2 py-0.5 rounded">
                              Est: ₹{Number(req.estimatedAmount).toLocaleString('en-IN')}
                            </span>
                          )}
                          {req.assignedEngineer && (
                            <span className="inline-flex items-center gap-1 text-[#0D8A72] font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                              <UserPlus className="h-3.5 w-3.5" />
                              {req.assignedEngineer.name}
                            </span>
                          )}
                          <span className="text-gray-400 ml-auto sm:ml-0">
                            {new Date(req.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Workflow Actions */}
                    <div className="flex items-center justify-between lg:justify-end gap-2.5 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-gray-100 flex-wrap">
                      <button
                        onClick={() => setSelectedRequestDetails(req)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Details</span>
                      </button>

                      {/* NEW: Accept / Reject Buttons */}
                      {isNew && (
                        <>
                          <button
                            onClick={() => setRejectingRequest(req)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </button>
                          <button
                            onClick={() => handleAccept(req)}
                            disabled={actionLoadingId === req.id}
                            className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-bold text-white bg-[#0D8A72] hover:bg-[#0b735f] rounded-xl shadow-xs transition-all disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>{actionLoadingId === req.id ? 'Accepting...' : 'Accept'}</span>
                          </button>
                        </>
                      )}

                      {/* ACCEPTED: Assign Engineer Button */}
                      {(isAccepted || isNew) && !req.assignedEngineer && (
                        <button
                          onClick={() => setAssigningRequest(req)}
                          className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          <span>Assign Engineer</span>
                        </button>
                      )}

                      {/* IN PROGRESS / COMPLETED: Go to Operations / History */}
                      {(isInProgress || isCompleted) && (
                        <button
                          onClick={() => navigate(path('projects'))}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
                        >
                          <span>Track in Project Ops</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS INTEGRATION ── */}
      {/* 1. Request Details Modal */}
      {selectedRequestDetails && (
        <RequestDetailsModal
          requestId={selectedRequestDetails.id}
          initialData={selectedRequestDetails}
          onClose={() => setSelectedRequestDetails(null)}
          onAccept={(req) => {
            setSelectedRequestDetails(null);
            handleAccept(req);
          }}
          onReject={(req) => {
            setSelectedRequestDetails(null);
            setRejectingRequest(req);
          }}
          onAssign={(req) => {
            setSelectedRequestDetails(null);
            setAssigningRequest(req);
          }}
        />
      )}

      {/* 2. Reject Reason Modal */}
      {rejectingRequest && (
        <RejectReasonModal
          request={rejectingRequest}
          onClose={() => setRejectingRequest(null)}
          onConfirm={handleConfirmReject}
        />
      )}

      {/* 3. Assign Engineer Modal */}
      {assigningRequest && (
        <AssignEngineerModal
          request={assigningRequest}
          onClose={() => setAssigningRequest(null)}
          onAssigned={(result) => {
            toast.success(`Assigned to ${result?.engineerName || 'Engineer'}!`);
            loadRequests(true);
          }}
        />
      )}
    </div>
  );
};

export default Requests;
