import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  FiSearch, FiFilter, FiRefreshCw, FiDownload, FiMapPin, 
  FiClock, FiCheckCircle, FiAlertCircle, FiMoreVertical, 
  FiEye, FiEdit2, FiNavigation, FiTrash2, FiFileText, FiHeadphones, FiCheckSquare, FiAlertTriangle, FiUser, FiUploadCloud, FiBriefcase
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import api from '../../../../services/api';
import { useSocket } from '../../../../context/SocketContext';
import JobDetailsDrawer from './components/JobDetailsDrawer';
import LiveTrackingModal from './components/LiveTrackingModal';
import SkeletonLoader from '../../../../components/common/SkeletonLoader';
import { RouteTabs, VIEW_LABEL, VIEW_TONE, Badge } from '../../components/ui';
import useB2BSession from '../../hooks/useB2BSession';

const JOB_TABS = ['all', 'pending', 'dispatched', 'en_route', 'in_progress', 'resolved', 'cancelled', 'failed', 'sla_breached'];
const TRACKABLE_VIEWS = ['dispatched', 'en_route', 'in_progress'];

const Jobs = ({ liveMode = false }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const socket = useSocket();
  const { can } = useB2BSession();
  const params = useParams();
  // The view comes from the URL (/b2b/jobs/:view); Live Operations pins "active".
  const activeTab = liveMode ? 'active' : (JOB_TABS.includes(params.view) ? params.view : 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState({
    status: 'all',
    service: 'all',
    city: 'all',
    priority: 'all',
    paymentStatus: 'all',
    batchId: 'all',
    startDate: '',
    endDate: ''
  });
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Drawers & Modals
  const [selectedJob, setSelectedJob] = useState(null);
  const [trackingJob, setTrackingJob] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);

  // A new view starts on its first page.
  useEffect(() => { setCurrentPage(1); }, [activeTab]);

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Socket.IO Realtime Refetching
  useEffect(() => {
    if (!socket) return;
    const refetchJobs = () => {
      queryClient.invalidateQueries({ queryKey: ['b2bJobsList'] });
      queryClient.invalidateQueries({ queryKey: ['b2bJobsStats'] });
    };

    socket.on('job_updated', refetchJobs);
    socket.on('job_cancelled', refetchJobs);
    socket.on('engineer_assigned', refetchJobs);
    socket.on('b2b:batchCreated', refetchJobs); // Just in case

    return () => {
      socket.off('job_updated', refetchJobs);
      socket.off('job_cancelled', refetchJobs);
      socket.off('engineer_assigned', refetchJobs);
      socket.off('b2b:batchCreated', refetchJobs);
    };
  }, [socket, queryClient]);

  // Fetch Stats
  const { data: statsRes } = useQuery({
    queryKey: ['b2bJobsStats'],
    queryFn: async () => {
      const res = await api.get('/b2b/jobs/stats');
      return res.data;
    },
    refetchInterval: 30000
  });

  const stats = statsRes?.stats || {};
  const viewCounts = Object.fromEntries((statsRes?.views || []).map((v) => [v.key, v.count]));
  const chartData = statsRes?.chartData || [];
  const trends = stats.trends || {};

  // Filter metadata (services / cities / batches from live data + ServiceConfig)
  const { data: filterMetaRes } = useQuery({
    queryKey: ['b2bJobsFilterMeta'],
    queryFn: async () => {
      const res = await api.get('/b2b/jobs/filter-meta');
      return res.data?.data || {};
    },
    staleTime: 60_000
  });

  const { data: activityRes, isLoading: activityLoading } = useQuery({
    queryKey: ['b2bJobsRecentActivity'],
    queryFn: async () => {
      const res = await api.get('/b2b/jobs/recent-activity', { params: { limit: 12 } });
      return res.data?.data || [];
    },
    refetchInterval: 30000
  });

  const recentActivity = activityRes || [];
  const serviceOptions = filterMetaRes?.services?.length
    ? ['All Services', ...filterMetaRes.services]
    : ['All Services'];
  const cityOptions = filterMetaRes?.cities?.length
    ? ['All Cities', ...filterMetaRes.cities]
    : ['All Cities'];
  const batchOptions = filterMetaRes?.batches?.length
    ? [
        { label: 'All Batches', value: 'all' },
        ...filterMetaRes.batches.map((b) => ({
          label: b.batchId || b.fileName || String(b._id),
          value: b._id
        }))
      ]
    : [{ label: 'All Batches', value: 'all' }];

  // Fetch Jobs List
  const { data: jobsRes, isLoading, isError: jobsError, error: jobsErr, refetch: refetchJobs } = useQuery({
    queryKey: ['b2bJobsList', currentPage, itemsPerPage, activeTab, filters, debouncedSearch],
    queryFn: async () => {
      const res = await api.get('/b2b/jobs', { params: buildParams() });
      return res.data;
    },
    refetchInterval: liveMode ? 15000 : false,
    placeholderData: (prev) => prev
  });

  // One place builds the query, so an export is exactly what is on screen.
  function buildParams() {
    return {
      page: currentPage,
      limit: itemsPerPage,
      view: activeTab !== 'all' ? activeTab : undefined,
      search: debouncedSearch || undefined,
      status: filters.status !== 'all' ? filters.status : undefined,
      service: filters.service !== 'all' ? filters.service : undefined,
      city: filters.city !== 'all' ? filters.city : undefined,
      priority: filters.priority !== 'all' ? filters.priority : undefined,
      paymentStatus: filters.paymentStatus !== 'all' ? filters.paymentStatus : undefined,
      batchId: filters.batchId !== 'all' ? filters.batchId : undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined
    };
  }

  const jobs = jobsRes?.data || [];
  const pagination = jobsRes?.pagination || { page: 1, totalPages: 1, total: 0 };

  // Virtual Scrolling
  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: jobs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 85,
    overscan: 5,
  });

  // Handlers
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setFilters({
      status: 'all', service: 'all', city: 'all', priority: 'all', 
      paymentStatus: 'all', batchId: 'all', startDate: '', endDate: ''
    });
    setSearchQuery('');
    setCurrentPage(1);
  };

  const exportJobs = async () => {
    try {
      const { page: _page, limit: _limit, ...exportParams } = buildParams();
      const res = await api.get('/b2b/jobs/export', { responseType: 'blob', params: exportParams });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Jobs_Export_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export successful');
    } catch (err) {
      toast.error('Export failed');
    }
  };

  const cancelJobMutation = useMutation({
    mutationFn: (id) => api.delete(`/b2b/jobs/${id}`),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Job cancelled successfully');
      queryClient.invalidateQueries({ queryKey: ['b2bJobsList'] });
      queryClient.invalidateQueries({ queryKey: ['b2bJobsStats'] });
      queryClient.invalidateQueries({ queryKey: ['b2bWallet'] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to cancel job')
  });

  const rematchMutation = useMutation({
    mutationFn: (id) => api.post(`/b2b/jobs/${id}/rematch`),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Matching restarted');
      queryClient.invalidateQueries({ queryKey: ['b2bJobsList'] });
      queryClient.invalidateQueries({ queryKey: ['b2bJobsStats'] });
      queryClient.invalidateQueries({ queryKey: ['b2bJobsRecentActivity'] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Could not restart matching')
  });

  // KPI Card Configs
  const kpiCards = [
    { label: 'Total Jobs', value: stats.totalJobs || 0, icon: <FiFileText className="w-5 h-5 text-[#10AFA5]" />, trend: trends.totalJobs || '—', trendColor: trends.totalJobsUp === false ? 'text-red-500' : 'text-green-600', bg: 'bg-[#E6F4F2]' },
    { label: 'Pending', value: (stats.pending || 0) + (stats.pendingWallet || 0), icon: <FiClock className="w-5 h-5 text-orange-500" />, trend: `${stats.pendingWallet || 0} payment pending`, trendColor: 'text-amber-600', bg: 'bg-orange-50' },
    { label: 'Assigned', value: stats.assigned || 0, icon: <FiCheckSquare className="w-5 h-5 text-purple-600" />, trend: `${stats.searchingEngineer || 0} searching`, trendColor: 'text-gray-500', bg: 'bg-purple-50' },
    { label: 'In Progress', value: stats.inProgress || 0, icon: <FiRefreshCw className="w-5 h-5 text-blue-500" />, trend: `${stats.onHold || 0} on hold`, trendColor: 'text-gray-500', bg: 'bg-blue-50' },
    { label: 'Completed', value: stats.completed || 0, icon: <FiCheckCircle className="w-5 h-5 text-green-600" />, trend: trends.completed || '—', trendColor: trends.completedUp === false ? 'text-red-500' : 'text-green-600', bg: 'bg-green-50' }
  ];

  const getStatusStyle = (status) => {
    switch (status) {
      case 'completed':
      case 'closed': return 'bg-green-50 text-green-600 border border-green-100';
      case 'pending':
      case 'searching_engineer': return 'bg-yellow-50 text-yellow-600 border border-yellow-100';
      case 'pending_wallet': return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'assigned': return 'bg-purple-50 text-purple-600 border border-purple-100';
      case 'in_progress': return 'bg-blue-50 text-blue-600 border border-blue-100';
      case 'on_hold': return 'bg-slate-50 text-slate-600 border border-slate-200';
      case 'escalated': return 'bg-orange-50 text-orange-700 border border-orange-100';
      case 'rejected':
      case 'failed':
      case 'cancelled': return 'bg-red-50 text-red-600 border border-red-100';
      default: return 'bg-gray-50 text-gray-600 border border-gray-200';
    }
  };

  const formatStatusLabel = (status) => {
    const map = {
      pending_wallet: 'Payment Pending',
      searching_engineer: 'Searching',
      in_progress: 'In Progress',
      on_hold: 'On Hold'
    };
    return map[status] || String(status || '').replace(/_/g, ' ');
  };

  const ALLOCATION_STAGES = {
    not_started: { label: 'Queued', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
    engineer_waves: { label: 'Finding engineer', cls: 'bg-blue-50 text-blue-600 border-blue-100' },
    vendor_marketplace: { label: 'With vendors', cls: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
    freelancer_pool: { label: 'Freelancer pool', cls: 'bg-violet-50 text-violet-600 border-violet-100' },
    admin_escalation: { label: 'With WBI support', cls: 'bg-orange-50 text-orange-700 border-orange-100' },
    allocated: { label: 'Allocated', cls: 'bg-green-50 text-green-600 border-green-100' }
  };

  // Jobs that will never move on their own until someone retries or cancels.
  const canRematch = (job) =>
    !job.assignedTo && ['pending', 'searching_engineer', 'escalated', 'failed', 'rejected'].includes(job.status);

  const formatActivityTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Today, ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
    return d.toLocaleString();
  };

  const activityIcon = (status) => {
    if (['completed', 'closed'].includes(status)) return { Icon: FiCheckCircle, cls: 'bg-green-100 text-green-600' };
    if (['assigned', 'searching_engineer'].includes(status)) return { Icon: FiUser, cls: 'bg-blue-100 text-blue-600' };
    if (['failed', 'cancelled', 'rejected'].includes(status)) return { Icon: FiAlertTriangle, cls: 'bg-red-100 text-red-600' };
    if (status === 'escalated') return { Icon: FiAlertCircle, cls: 'bg-orange-100 text-orange-600' };
    return { Icon: FiFileText, cls: 'bg-gray-100 text-gray-600' };
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 animate-fade-in pb-10">
      
      {/* Main Content Area (Left) */}
      <div className="flex-1 min-w-0 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{VIEW_LABEL[activeTab]}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {liveMode
                ? 'Jobs an engineer is holding right now: dispatched, travelling or on site. Refreshes every 15 seconds.'
                : 'Manage, track and monitor your jobs in real time.'}
            </p>
          </div>
          <button 
            onClick={exportJobs}
            className="bg-white border border-[#10AFA5] text-[#10AFA5] hover:bg-[#F0FDFA] px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all shadow-sm"
          >
            <FiDownload className="w-4 h-4" /> Export Report
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {kpiCards.map((card, idx) => (
            <div key={idx} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">{card.label}</p>
                <div className="flex justify-between items-start">
                  <h3 className="text-2xl font-bold text-gray-900">{card.value.toLocaleString()}</h3>
                  <div className={`w-8 h-8 rounded-full ${card.bg} flex items-center justify-center`}>
                    {card.icon}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <p className={`text-[10px] font-semibold ${card.trendColor}`}>{card.trend}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters Section */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Search</label>
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Job ID, customer or phone..."
                  className="w-full h-10 pl-9 pr-3 border border-gray-200 text-sm rounded-lg focus:ring-1 focus:ring-[#10AFA5] outline-none transition-all"
                />
              </div>
            </div>

            {/* Dropdowns */}
            {[
              {
                label: 'Status',
                key: 'status',
                options: [
                  'All Status', 'Pending', 'pending_wallet', 'searching_engineer', 'Assigned',
                  'In_Progress', 'on_hold', 'Completed', 'closed', 'Cancelled', 'Rejected', 'Escalated', 'Failed'
                ]
              },
              { label: 'Service', key: 'service', options: serviceOptions },
              { label: 'City / Location', key: 'city', options: cityOptions },
              { label: 'Priority', key: 'priority', options: ['All Priorities', 'High', 'Medium', 'Low'] },
              { label: 'Payment Status', key: 'paymentStatus', options: ['All Payment Status', 'unpaid', 'escrow_locked', 'released', 'refunded', 'deducted', 'pending_deduction'] }
            ].map((f, i) => (
              <div key={i} className="min-w-[140px]">
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">{f.label}</label>
                <select 
                  value={filters[f.key]}
                  onChange={(e) => handleFilterChange(f.key, e.target.value)}
                  className="w-full h-10 px-3 border border-gray-200 text-sm rounded-lg outline-none focus:ring-1 focus:ring-[#10AFA5] bg-white text-gray-700"
                >
                  {f.options.map(opt => {
                    const isAll = String(opt).toLowerCase().includes('all');
                    let val = 'all';
                    if (!isAll) {
                      if (f.key === 'status' || f.key === 'paymentStatus') {
                        val = String(opt).toLowerCase().replace(/\s+/g, '_');
                      } else {
                        val = opt;
                      }
                    }
                    const label = f.key === 'status' ? formatStatusLabel(isAll ? opt : String(opt).toLowerCase()) : opt;
                    return <option key={opt} value={val}>{label}</option>;
                  })}
                </select>
              </div>
            ))}

            <div className="min-w-[140px]">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Batch Upload</label>
              <select
                value={filters.batchId}
                onChange={(e) => handleFilterChange('batchId', e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 text-sm rounded-lg outline-none focus:ring-1 focus:ring-[#10AFA5] bg-white text-gray-700"
              >
                {batchOptions.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>

            <div className="min-w-[200px]">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Date Range</label>
              <div className="flex items-center gap-2">
                <input type="date" value={filters.startDate} onChange={e => handleFilterChange('startDate', e.target.value)} className="h-10 px-2 w-full border border-gray-200 text-sm rounded-lg text-gray-600 outline-none" />
                <span className="text-gray-400">-</span>
                <input type="date" value={filters.endDate} onChange={e => handleFilterChange('endDate', e.target.value)} className="h-10 px-2 w-full border border-gray-200 text-sm rounded-lg text-gray-600 outline-none" />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => queryClient.invalidateQueries({ queryKey: ['b2bJobsList'] })} className="h-10 px-4 border border-[#10AFA5] text-[#10AFA5] flex items-center gap-2 rounded-lg text-sm font-medium hover:bg-[#F0FDFA]">
                <FiFilter className="w-4 h-4" /> Filter
              </button>
              <button onClick={resetFilters} className="h-10 px-4 border border-gray-200 text-gray-600 flex items-center gap-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                <FiRefreshCw className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>
        </div>

        {/* Jobs that stopped moving need an explicit nudge, not a silent queue */}
        {(stats.escalated || 0) > 0 && filters.status !== 'escalated' && !liveMode && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <FiAlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-orange-900">
                  {stats.escalated} job{stats.escalated > 1 ? 's' : ''} could not be allocated
                </p>
                <p className="text-xs text-orange-800 mt-0.5">
                  No engineer, vendor or freelancer accepted them. Any escrow held has been returned to your wallet —
                  retry matching or contact WBI support.
                </p>
              </div>
            </div>
            <button
              onClick={() => handleFilterChange('status', 'escalated')}
              className="shrink-0 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-4 py-2 rounded-lg"
            >
              Review escalated jobs
            </button>
          </div>
        )}

        {/* Tabs */}
        {!liveMode && (
          <RouteTabs
            tabs={JOB_TABS.map((key) => ({
              to: key === 'all' ? '/b2b/jobs' : `/b2b/jobs/${key}`,
              end: true,
              label: VIEW_LABEL[key],
              count: viewCounts[key]
            }))}
          />
        )}

        {/* Jobs Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-visible">
          <div ref={parentRef} className="overflow-x-auto min-h-[400px] max-h-[600px] overflow-y-auto relative">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-gray-50/50 shadow-sm">
                <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wider font-bold text-gray-500">
                  <th className="py-4 pl-6 pr-4">Job ID</th>
                  <th className="py-4 px-4">Customer Details</th>
                  <th className="py-4 px-4">Service</th>
                  <th className="py-4 px-4">Location</th>
                  <th className="py-4 px-4">Priority</th>
                  <th className="py-4 px-4">Assigned Engineer</th>
                  <th className="py-4 px-4">Allocation</th>
                  <th className="py-4 px-4">Status</th>
                  <th className="py-4 px-4">Payment</th>
                  <th className="py-4 px-4">Created On</th>
                  <th className="py-4 pr-6 pl-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="p-0">
                      <SkeletonLoader type="list" count={5} className="mx-4 my-2" />
                    </td>
                  </tr>
                ) : jobsError ? (
                  <tr>
                    <td colSpan={11} className="text-center py-16">
                      <p className="text-red-500 font-medium text-sm mb-3">{jobsErr?.response?.data?.message || 'Failed to load jobs'}</p>
                      <button type="button" onClick={() => refetchJobs()} className="text-[#10AFA5] text-sm font-bold hover:underline">Retry</button>
                    </td>
                  </tr>
                ) : jobs.length > 0 ? (
                  <>
                    {rowVirtualizer.getVirtualItems().length > 0 && rowVirtualizer.getVirtualItems()[0]?.start > 0 && (
                      <tr><td style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start}px` }} colSpan={11}></td></tr>
                    )}
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const job = jobs[virtualRow.index];
                      return (
                        <tr key={job._id} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} className="hover:bg-gray-50/50 transition-colors text-sm">
                          <td className="py-4 pl-6 pr-4">
                        <p className="font-bold text-[#10AFA5]">{job.jobId}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Batch: {job.batchId?.batchId || 'Manual'}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-semibold text-gray-800">{job.customerName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{job.phone}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-medium text-gray-800 flex items-center gap-1">
                          <FiCheckCircle className="text-[#10AFA5] w-3 h-3" /> {job.service}
                        </p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-medium text-gray-700 flex items-center gap-1">
                          <FiMapPin className="text-gray-400 w-3 h-3" /> {job.city}
                        </p>
                        <p className="text-[10px] text-gray-400 pl-4">Pin: {job.pincode}</p>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          job.priority === 'High' ? 'bg-red-50 text-red-600' :
                          job.priority === 'Medium' ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'
                        }`}>
                          {job.priority}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        {job.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <img src={job.assignedTo.profilePic || 'data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22%23E6F4F2%22/%3E%3Ccircle cx=%2220%22 cy=%2216%22 r=%227%22 fill=%22%2310AFA5%22/%3E%3Cpath d=%22M6 36c2-8 8-11 14-11s12 3 14 11%22 fill=%22%2310AFA5%22/%3E%3C/svg%3E'} alt="Eng" className="w-7 h-7 rounded-full border border-gray-200" />
                            <div>
                              <p className="font-semibold text-gray-800 text-xs">{job.assignedTo.firstName}</p>
                              <p className="text-[10px] text-yellow-500 flex items-center gap-0.5">⭐ {job.assignedTo.averageRating != null ? Number(job.assignedTo.averageRating).toFixed(1) : '—'}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 font-medium">Unassigned</span>
                        )}
                      </td>
                      <td className="py-4 px-4 max-w-[220px]">
                        {(() => {
                          const stage = ALLOCATION_STAGES[job.allocationStage] || ALLOCATION_STAGES.not_started;
                          return (
                            <>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${stage.cls}`}>
                                {stage.label}
                              </span>
                              {job.allocationReason && (
                                <p className="text-[10px] text-gray-500 mt-1 whitespace-normal leading-snug" title={job.allocationReason}>
                                  {job.allocationReason}
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={VIEW_TONE[job.view] || 'gray'}>{VIEW_LABEL[job.view] || formatStatusLabel(job.status)}</Badge>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${getStatusStyle(job.status)}`}>
                            {formatStatusLabel(job.status)}
                          </span>
                          {job.slaBreached && <Badge tone="red">SLA breached</Badge>}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`text-[11px] font-bold ${
                          ['escrow_locked', 'deducted'].includes(job.paymentStatus) ? 'text-amber-600' :
                          job.paymentStatus === 'released' ? 'text-green-600' :
                          job.paymentStatus === 'refunded' ? 'text-gray-500' :
                          'text-orange-500'
                        }`}>
                          {job.paymentStatus === 'escrow_locked' || job.paymentStatus === 'deducted' ? 'Escrow Locked' :
                           job.paymentStatus === 'released' ? 'Released' :
                           job.paymentStatus === 'refunded' ? 'Refunded' :
                           job.paymentStatus === 'pending_deduction' ? 'Pending' : (job.paymentStatus || 'Unpaid')}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-xs">
                        <p className="font-medium text-gray-800">{new Date(job.createdAt).toLocaleDateString('en-GB')}</p>
                        <p className="text-gray-400">{new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </td>
                      <td className="py-4 pr-6 pl-4 text-center relative">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setSelectedJob(job._id)} className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:text-[#10AFA5] hover:bg-[#F0FDFA]">
                            <FiEye className="w-3.5 h-3.5" />
                          </button>
                          {TRACKABLE_VIEWS.includes(job.view) && can('tracking.read') && (
                            <button onClick={() => setTrackingJob(job._id)} className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:text-blue-500 hover:bg-blue-50" title="Track Live">
                              <FiNavigation className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canRematch(job) && can('jobs.manage') && (
                            <button
                              onClick={() => rematchMutation.mutate(job._id)}
                              disabled={rematchMutation.isPending}
                              className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:text-[#10AFA5] hover:bg-[#F0FDFA] disabled:opacity-40"
                              title="Retry matching"
                            >
                              <FiRefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <div className="relative">
                            <button onClick={() => setActiveMenu(activeMenu === job._id ? null : job._id)} className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                              <FiMoreVertical className="w-3.5 h-3.5" />
                            </button>
                            {activeMenu === job._id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)}></div>
                                <div className="absolute right-0 top-8 w-40 bg-white rounded-lg shadow-xl border border-gray-100 z-20 py-1 overflow-hidden">
                                  <button onClick={() => { setSelectedJob(job._id); setActiveMenu(null); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-[#10AFA5]">View Details</button>
                                  {can('support.manage') && (
                                    <button
                                      onClick={() => {
                                        setActiveMenu(null);
                                        navigate(`/b2b/support?jobId=${job._id}&jobCode=${encodeURIComponent(job.jobId || '')}`);
                                      }}
                                      className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-brand"
                                    >
                                      Raise Support Ticket
                                    </button>
                                  )}
                                  {canRematch(job) && can('jobs.manage') && (
                                    <button onClick={() => { rematchMutation.mutate(job._id); setActiveMenu(null); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-[#10AFA5]">Retry Matching</button>
                                  )}
                                  {can('jobs.manage') && ['pending', 'searching_engineer', 'assigned', 'escalated', 'failed', 'on_hold'].includes(job.status) && (
                                    <button onClick={() => { if(window.confirm('Cancel this job?')) cancelJobMutation.mutate(job._id); setActiveMenu(null); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2">
                                      Cancel Job
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rowVirtualizer.getVirtualItems().length > 0 && rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end > 0 && (
                  <tr><td style={{ height: `${rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end}px` }} colSpan={11}></td></tr>
                )}
              </>
            ) : (
                  <tr><td colSpan={11} className="text-center py-16 text-gray-400 font-medium text-sm">No jobs found matching criteria.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Footer */}
          <div className="bg-gray-50/50 p-4 border-t border-gray-100 flex justify-between items-center text-sm text-gray-600">
            <div>
              Showing {pagination.total > 0 ? (pagination.page - 1) * itemsPerPage + 1 : 0} to {Math.min(pagination.page * itemsPerPage, pagination.total)} of {pagination.total} results
            </div>
            <div className="flex items-center gap-2">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)} className="w-8 h-8 rounded border flex items-center justify-center hover:border-[#10AFA5] hover:text-[#10AFA5] disabled:opacity-50">«</button>
              <span className="px-4 font-semibold">{currentPage} / {pagination.totalPages || 1}</span>
              <button disabled={currentPage === pagination.totalPages || pagination.totalPages === 0} onClick={() => setCurrentPage(c => c + 1)} className="w-8 h-8 rounded border flex items-center justify-center hover:border-[#10AFA5] hover:text-[#10AFA5] disabled:opacity-50">»</button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-80 space-y-6 shrink-0">
        
        {/* Job Status Chart */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm text-center">
          <h3 className="font-bold text-gray-900 mb-2 text-left">Job Status Overview</h3>
          <div className="h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                  {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-gray-900">{stats.totalJobs?.toLocaleString() || 0}</span>
              <span className="text-[10px] text-gray-500 font-bold uppercase">Total</span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {chartData.map((d, i) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2 font-medium text-gray-600">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} /> {d.name}
                </div>
                <div className="font-bold text-gray-900">{d.value.toLocaleString()} <span className="text-gray-400 font-normal">({stats.totalJobs ? ((d.value / stats.totalJobs) * 100).toFixed(1) : 0}%)</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/b2b/bulk-jobs/upload')} className="bg-[#E6F4F2] hover:bg-[#c9ebe7] text-[#10AFA5] p-3 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors">
              <FiUploadCloud className="w-6 h-6" />
              <span className="text-xs font-bold text-center leading-tight">Upload New Jobs</span>
            </button>
            <button onClick={exportJobs} className="bg-blue-50 hover:bg-blue-100 text-blue-600 p-3 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors">
              <FiDownload className="w-6 h-6" />
              <span className="text-xs font-bold text-center leading-tight">Download Report</span>
            </button>
            <button onClick={() => navigate('/b2b/billing/add-funds')} className="bg-green-50 hover:bg-green-100 text-green-600 p-3 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors">
              <FiBriefcase className="w-6 h-6" />
              <span className="text-xs font-bold text-center leading-tight">Wallet & Payments</span>
            </button>
            <button onClick={() => navigate('/b2b/support')} className="bg-orange-50 hover:bg-orange-100 text-orange-600 p-3 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors">
              <FiHeadphones className="w-6 h-6" />
              <span className="text-xs font-bold text-center leading-tight">Support Ticket</span>
            </button>
          </div>
        </div>

        {/* Recent Job Activities — live JobHistory feed */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-900">Recent Job Activities</h3>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['b2bJobsRecentActivity'] })}
              className="text-[#10AFA5] text-xs font-bold hover:underline"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
            {activityLoading && (
              <p className="text-xs text-gray-400 pl-8">Loading activity…</p>
            )}
            {!activityLoading && recentActivity.length === 0 && (
              <p className="text-xs text-gray-400 pl-8">No recent activity yet. Upload or confirm a bulk batch to see updates here.</p>
            )}
            {recentActivity.map((item) => {
              const { Icon, cls } = activityIcon(item.status);
              return (
                <div key={item.id} className="relative flex items-start gap-3 z-10">
                  <div className={`w-6 h-6 rounded-full ${cls} border-2 border-white flex justify-center items-center shrink-0 mt-0.5 shadow-sm`}>
                    <Icon className="w-3 h-3" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">
                      Job {item.jobId} — {formatStatusLabel(item.status)}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{item.remark || 'Status updated'}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5 uppercase tracking-wider">{formatActivityTime(item.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Modals & Drawers */}
      {selectedJob && <JobDetailsDrawer jobId={selectedJob} onClose={() => setSelectedJob(null)} />}
      {trackingJob && <LiveTrackingModal jobId={trackingJob} onClose={() => setTrackingJob(null)} />}
    </div>
  );
};

export default Jobs;
