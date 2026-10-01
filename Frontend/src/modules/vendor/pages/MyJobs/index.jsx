import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  Search,
  Filter,
  RefreshCw,
  User,
  Building2,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  UserPlus,
  Loader2,
  ChevronRight,
  Shield,
  Phone,
  Sparkles,
  Camera,
  KeyRound,
  CheckSquare
} from 'lucide-react';
import { fetchMyJobs } from '../../services/myJobsService';
import { useVendorSocket } from '../../context/VendorSocketContext';
import { useVendorCounts } from '../../context/VendorCountsContext';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import JobDetailsModal from './components/JobDetailsModal';
import AssignJobEngineerModal from './components/AssignJobEngineerModal';

const STATUS_CHIPS = [
  { key: 'all', label: 'All Statuses' },
  { key: 'new', label: 'New' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'assigned', label: 'Engineer Assigned' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'en_route', label: 'En Route' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' }
];

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
  assigned: 'Assigned',
  dispatched: 'Dispatched',
  en_route: 'En Route',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const MyJobs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSourceTab = searchParams.get('tab') || 'all'; // 'all' | 'user' | 'b2b'
  const activeStatus = searchParams.get('status') || 'all';
  const { path } = useVendorBasePath();

  // Offers waiting on this vendor live in Requests until accepted; point there from here.
  const { businessIntake: { counts: intakeCounts } } = useVendorCounts();
  const pendingUser = intakeCounts.clientRequests || 0;
  const pendingB2B = Math.max(0, (intakeCounts.allOpportunities || 0) - pendingUser);
  const pendingOffers =
    activeSourceTab === 'user' ? pendingUser : activeSourceTab === 'b2b' ? pendingB2B : pendingUser + pendingB2B;
  const pendingOffersTab = activeSourceTab === 'b2b' || (activeSourceTab === 'all' && !pendingUser) ? 'b2b' : 'user';

  const [jobs, setJobs] = useState([]);
  const [counts, setCounts] = useState({
    all: 0,
    user: 0,
    b2b: 0,
    statuses: { all: 0, new: 0, accepted: 0, assigned: 0, dispatched: 0, en_route: 0, in_progress: 0, completed: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Modals state
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [assignEngineerJob, setAssignEngineerJob] = useState(null);

  const { socket } = useVendorSocket() || {};

  const loadJobs = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await fetchMyJobs({
        source: activeSourceTab,
        status: activeStatus,
        search,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        limit: 50
      });

      if (res.success) {
        setJobs(res.data || []);
        if (res.counts) setCounts(res.counts);
      }
    } catch (err) {
      console.error('Error loading my jobs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeSourceTab, activeStatus, search, priorityFilter]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Real-time Socket Synchronization
  useEffect(() => {
    if (!socket || typeof socket.on !== 'function') return;

    const handleJobUpdate = () => {
      loadJobs(true);
    };

    socket.on('b2b:jobStatusUpdated', handleJobUpdate);
    socket.on('ops:job_assigned', handleJobUpdate);
    socket.on('ops:job_accepted', handleJobUpdate);
    socket.on('ops:job_completed', handleJobUpdate);
    socket.on('booking:assigned', handleJobUpdate);
    socket.on('booking_updated', handleJobUpdate);

    return () => {
      if (typeof socket.off === 'function') {
        socket.off('b2b:jobStatusUpdated', handleJobUpdate);
        socket.off('ops:job_assigned', handleJobUpdate);
        socket.off('ops:job_accepted', handleJobUpdate);
        socket.off('ops:job_completed', handleJobUpdate);
        socket.off('booking:assigned', handleJobUpdate);
        socket.off('booking_updated', handleJobUpdate);
      }
    };
  }, [socket, loadJobs]);

  const handleSourceTabChange = (tabKey) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', tabKey);
    setSearchParams(params);
  };

  const handleStatusChange = (statusKey) => {
    const params = new URLSearchParams(searchParams);
    params.set('status', statusKey);
    setSearchParams(params);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 uppercase tracking-wider flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" /> Operations Command Center
            </span>
            <span className="text-xs text-gray-400 font-medium">Real-time Execution & Tracking</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">
            My Jobs
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track live job execution, assign field engineers, verify OTPs, and review completion proofs across User and B2B workloads.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadJobs(true)}
            disabled={refreshing}
            className="px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-2 border border-gray-200 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            Refresh Workload
          </button>
        </div>
      </div>

      {/* Main Operational Source Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
        {[
          { key: 'all', label: 'All Jobs', count: counts.all },
          { key: 'user', label: 'User Projects', count: counts.user },
          { key: 'b2b', label: 'B2B Jobs', count: counts.b2b }
        ].map((tab) => {
          const isActive = activeSourceTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleSourceTabChange(tab.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                isActive
                  ? 'bg-gray-900 text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-2 py-0.5 text-xs rounded-full font-extrabold ${
                isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
              }`}>
                {tab.count || 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Status Chips Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STATUS_CHIPS.map((chip) => {
          const isSelected = activeStatus === chip.key;
          const statusCount = chip.key === 'all' ? counts.all : (counts.statuses?.[chip.key] || 0);

          return (
            <button
              key={chip.key}
              onClick={() => handleStatusChange(chip.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all border ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span>{chip.label}</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {statusCount}
              </span>
            </button>
          );
        })}
      </div>

      {pendingOffers > 0 && (
        <Link
          to={path(`requests?tab=${pendingOffersTab}&status=new`)}
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 text-cyan-700" />
            <span>
              <strong>{pendingOffers}</strong> new {pendingOffers === 1 ? 'request is' : 'requests are'} waiting for your
              response. Accept in Requests to start work here.
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs font-bold whitespace-nowrap">
            Review <ChevronRight className="w-4 h-4" />
          </span>
        </Link>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Job ID, customer, company, service, engineer, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal / Medium</option>
          </select>
        </div>
      </div>

      {/* Jobs List / Cards View */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-gray-200">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm font-medium text-gray-600">Loading operational jobs...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="py-20 px-6 text-center bg-white rounded-2xl border border-dashed border-gray-300">
          <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-1">No Jobs Found</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
            {search || activeStatus !== 'all' || activeSourceTab !== 'all'
              ? 'No jobs match your current search and filter settings. Try resetting filters.'
              : 'When requests are accepted from the Requests section, they automatically appear here for execution and engineer dispatch.'}
          </p>
          {(search || activeStatus !== 'all' || activeSourceTab !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                handleSourceTabChange('all');
                handleStatusChange('all');
              }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isB2B = job.sourceType === 'b2b';
            const isLive = ['in_progress', 'en_route'].includes(job.status);

            return (
              <div
                key={job.id}
                className="bg-white rounded-xl border border-gray-200/90 hover:border-blue-400 p-4 sm:p-5 transition-all hover:shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Left Section: Job ID, Source & Scope */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className={`p-2.5 rounded-xl shrink-0 ${
                    isB2B ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {isB2B ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold text-gray-900">
                        #{job.jobCode}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded tracking-wider ${
                        isB2B
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {job.source}
                      </span>
                      {job.priority === 'urgent' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700">
                          URGENT
                        </span>
                      )}
                      {job.priority === 'high' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800">
                          HIGH
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-gray-900 truncate">
                      {job.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-gray-500 mt-1.5">
                      <span className="font-semibold text-gray-800 flex items-center gap-1">
                        {isB2B ? job.companyName || job.customerName : job.customerName}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" /> {job.city}
                      </span>
                      {job.scheduledDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {new Date(job.scheduledDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Middle Section: Assigned Engineer */}
                <div className="shrink-0 lg:w-56 p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  {job.assignedEngineer ? (
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs shrink-0">
                        {job.assignedEngineer.avatar ? (
                          <img src={job.assignedEngineer.avatar} alt="avatar" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          job.assignedEngineer.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{job.assignedEngineer.name}</p>
                        <p className="text-[10px] text-gray-500 flex items-center gap-1 truncate">
                          <Shield className="w-2.5 h-2.5 text-indigo-600" /> Field Engineer
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-semibold text-amber-700">Unassigned</span>
                      <button
                        onClick={() => setAssignEngineerJob(job)}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        + Assign
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Section: Status Badge & Actions */}
                <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                  <div className="text-left lg:text-right">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 shadow-sm ${
                      STATUS_COLOR_MAP[job.status] || 'bg-gray-100 text-gray-700'
                    }`}>
                      {isLive && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />}
                      {STATUS_LABEL_MAP[job.status] || job.status}
                    </span>
                    {job.budget > 0 && (
                      <p className="text-xs font-bold text-gray-900 mt-1">
                        ₹{job.budget.toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedJobId(job.id)}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-blue-600/20 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Job
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Comprehensive Job Details Modal */}
      {selectedJobId && (
        <JobDetailsModal
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onOpenAssignEngineer={(job) => {
            setSelectedJobId(null);
            setAssignEngineerJob(job);
          }}
        />
      )}

      {/* Assign Engineer Modal */}
      {assignEngineerJob && (
        <AssignJobEngineerModal
          job={assignEngineerJob}
          onClose={() => setAssignEngineerJob(null)}
          onAssigned={() => {
            loadJobs(true);
          }}
        />
      )}

    </div>
  );
};

export default MyJobs;
