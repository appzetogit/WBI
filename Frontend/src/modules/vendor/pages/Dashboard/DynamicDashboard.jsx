import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useVendorConfig } from '../../context/VendorConfigContext';
import { useVendorSocket } from '../../context/VendorSocketContext';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import JobOpsOverview from './components/JobOpsOverview';
import api from '../../../../services/api';
import {
  Inbox,
  Building2,
  Briefcase,
  PlayCircle,
  CheckCircle2,
  Users,
  Wallet,
  ArrowRight,
  TrendingUp,
  MapPin,
  Clock,
  User,
  Shield,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Phone,
  Calendar,
  Layers,
  Sparkles,
  Zap,
  Activity
} from 'lucide-react';

const DynamicDashboard = () => {
  const navigate = useNavigate();
  const {
    vendorProfile,
    companyName,
    approvedServices = [],
    extraKPIs = [],
    projectMilestones = {},
    alerts: configAlerts = []
  } = useVendorConfig() || {};
  const { path } = useVendorBasePath();
  const { socket } = useVendorSocket() || {};

  // Operational State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [activeTab, setActiveTab] = useState('active_operations'); // 'active_operations' | 'incoming_pipeline' | 'workforce' | 'finance'
  const [pipelineSubTab, setPipelineSubTab] = useState('user_requests'); // 'user_requests' | 'b2b_jobs'
  const [opsFilter, setOpsFilter] = useState('all'); // 'all' | 'in_progress' | 'user' | 'b2b'

  const services = useMemo(() => {
    return (approvedServices || []).filter((s) => s.status !== 'suspended');
  }, [approvedServices]);

  const serviceKey = useMemo(() => {
    return services.map((s) => s.categoryCode).join(',');
  }, [services]);

  // Primary Fetch Function
  const fetchOperationalData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [summaryRes, kpiRes] = await Promise.allSettled([
        api.get('/vendor/dashboard/operational-summary'),
        api.get('/vendor/dashboard/kpis')
      ]);

      if (summaryRes.status === 'fulfilled' && summaryRes.value.data?.success) {
        setSummaryData(summaryRes.value.data.data);
      } else if (kpiRes.status === 'fulfilled' && kpiRes.value.data?.success) {
        // Fallback to KPI data if operational summary had an issue
        const kpiBase = kpiRes.value.data.data?.base || {};
        setSummaryData((prev) => ({
          ...prev,
          counts: {
            ...prev?.counts,
            activeJobs: kpiBase.activeProjects || 0,
            availableEngineers: kpiBase.availableEngineers || 0,
            walletBalance: kpiBase.walletBalance || 0
          }
        }));
      }
    } catch (err) {
      console.warn('[Operational Dashboard] Fetch error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial Load & Service Change
  useEffect(() => {
    fetchOperationalData();
  }, [fetchOperationalData, serviceKey]);

  // Periodic Polling & Socket Listeners
  useEffect(() => {
    // 25s auto-poll to guarantee live sync
    const interval = setInterval(() => {
      fetchOperationalData(true);
    }, 25000);

    // Socket Event Handlers
    const handleLiveUpdate = () => {
      fetchOperationalData(true);
    };

    window.addEventListener('vendor-opportunity-new', handleLiveUpdate);
    window.addEventListener('vendor-finance-updated', handleLiveUpdate);
    window.addEventListener('vendor-service-approved', handleLiveUpdate);
    window.addEventListener('vendor-service-suspended', handleLiveUpdate);

    if (socket) {
      socket.on('b2b:jobStatusUpdated', handleLiveUpdate);
      socket.on('project_update', handleLiveUpdate);
      socket.on('booking_updated', handleLiveUpdate);
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('vendor-opportunity-new', handleLiveUpdate);
      window.removeEventListener('vendor-finance-updated', handleLiveUpdate);
      window.removeEventListener('vendor-service-approved', handleLiveUpdate);
      window.removeEventListener('vendor-service-suspended', handleLiveUpdate);
      if (socket) {
        socket.off('b2b:jobStatusUpdated', handleLiveUpdate);
        socket.off('project_update', handleLiveUpdate);
        socket.off('booking_updated', handleLiveUpdate);
      }
    };
  }, [fetchOperationalData, socket]);

  // Safely extract counts & lists
  const counts = summaryData?.counts || {
    newUserRequests: 0,
    newB2BJobs: 0,
    activeJobs: 0,
    userActiveJobs: 0,
    b2bActiveJobs: 0,
    inProgress: 0,
    completed: 0,
    availableEngineers: 0,
    totalEngineers: 0,
    walletBalance: vendorProfile?.walletBalance || 0,
    escrowBalance: 0,
    totalEarnings: 0,
    userEarnings: 0,
    b2bEarnings: 0,
    pendingAmount: 0
  };

  const lists = summaryData?.lists || {
    newUserRequests: [],
    newB2BJobs: [],
    activeJobs: [],
    inProgress: [],
    completed: [],
    availableEngineers: []
  };

  const currentCompanyName = summaryData?.vendorProfile?.companyName || companyName || vendorProfile?.companyName || 'Vendor Partner';
  const vendorTier = (summaryData?.vendorProfile?.vendorTier || vendorProfile?.vendorTier || 'bronze').toUpperCase();
  const overallRating = summaryData?.vendorProfile?.overallRating || vendorProfile?.overallRating || '4.8';

  // Filtered Active/In Progress List
  const filteredOperations = useMemo(() => {
    let combined = [];
    if (opsFilter === 'in_progress') {
      combined = lists.inProgress || [];
    } else if (opsFilter === 'user') {
      combined = (lists.activeJobs || []).filter((j) => j.sourceType === 'user');
    } else if (opsFilter === 'b2b') {
      combined = (lists.activeJobs || []).filter((j) => j.sourceType === 'b2b');
    } else {
      // All
      combined = lists.activeJobs || [];
    }
    return combined;
  }, [lists.activeJobs, lists.inProgress, opsFilter]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-50/50 min-h-screen">
      {/* ── TOP OPERATIONAL HEADER ── */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="h-12 w-12 rounded-xl bg-[#0D8A72]/10 text-[#0D8A72] flex items-center justify-center shrink-0">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{currentCompanyName}</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Operations
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-900 text-yellow-400">
                TIER: {vendorTier}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              Unified command center for User Requests, B2B Enterprise Jobs, Workforce Dispatch & Earnings.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <button
            onClick={() => fetchOperationalData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all disabled:opacity-50"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-[#0D8A72]' : ''}`} />
            {refreshing ? 'Syncing...' : 'Sync Now'}
          </button>
          <Link
            to={path('requests')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0D8A72] hover:bg-[#0b735f] rounded-xl shadow-xs transition-all"
          >
            <span>Explore Opportunities</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* ── REGISTERED SERVICES QUICK CHIPS ── */}
      {services.length > 0 && (
        <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0 mr-1">
            Active Domains:
          </span>
          {services.map((svc) => (
            <div
              key={svc.categoryCode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-medium text-gray-700 shadow-2xs shrink-0"
            >
              <span className="h-2 w-2 rounded-full bg-[#0D8A72]" />
              <span className="font-semibold text-gray-900">{svc.categoryName}</span>
              <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                {svc.categoryCode}
              </span>
            </div>
          ))}
          <Link
            to={path('settings')}
            className="text-xs font-semibold text-[#0D8A72] hover:underline shrink-0 ml-2"
          >
            + Manage Services
          </Link>
        </div>
      )}

      {/* ── 7 PRIMARY OPERATIONAL SUMMARY CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-8">
        {/* 1. New User Requests */}
        <motion.div
          whileHover={{ y: -3 }}
          onClick={() => navigate(path('requests?tab=user&status=new'))}
          className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs hover:border-cyan-400 transition-all cursor-pointer relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
              User App
            </span>
            <div className="h-8 w-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Inbox className="h-4 w-4" />
            </div>
          </div>
          <p className="text-xs font-medium text-gray-500">New User Projects</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-2xl font-bold text-gray-900">
              {loading ? '—' : counts.newUserRequests}
            </h2>
            {counts.newUserRequests > 0 && (
              <span className="text-[10px] font-semibold text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
                Action Req.
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-2 truncate">From on-demand app</p>
        </motion.div>

        {/* 2. New B2B Jobs */}
        <motion.div
          whileHover={{ y: -3 }}
          onClick={() => navigate(path('requests?tab=b2b'))}
          className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs hover:border-indigo-400 transition-all cursor-pointer relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
              Enterprise
            </span>
            <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-xs font-medium text-gray-500">New B2B Jobs</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-2xl font-bold text-gray-900">
              {loading ? '—' : counts.newB2BJobs}
            </h2>
            {counts.newB2BJobs > 0 && (
              <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                Pending Bid
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-2 truncate">Corporate & bulk sites</p>
        </motion.div>

        {/* 3. Active Jobs */}
        <motion.div
          whileHover={{ y: -3 }}
          onClick={() => navigate(path('my-jobs?status=active'))}
          className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs hover:border-blue-400 transition-all cursor-pointer relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
              Operations
            </span>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <p className="text-xs font-medium text-gray-500">Active Jobs</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-2xl font-bold text-gray-900">
              {loading ? '—' : counts.activeJobs}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mt-2 font-medium">
            <span className="text-cyan-700 font-bold">U: {counts.userActiveJobs}</span>
            <span>·</span>
            <span className="text-indigo-700 font-bold">B2B: {counts.b2bActiveJobs}</span>
          </div>
        </motion.div>

        {/* 4. In Progress */}
        <motion.div
          whileHover={{ y: -3 }}
          onClick={() => navigate(path('my-jobs?status=in_progress'))}
          className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs hover:border-amber-400 transition-all cursor-pointer relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Live
            </span>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <PlayCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-xs font-medium text-gray-500">In Progress</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-2xl font-bold text-gray-900">
              {loading ? '—' : counts.inProgress}
            </h2>
          </div>
          <p className="text-[11px] text-amber-600 font-medium mt-2 truncate">Executing on-site</p>
        </motion.div>

        {/* 5. Completed */}
        <motion.div
          whileHover={{ y: -3 }}
          onClick={() => navigate(path('my-jobs?status=completed'))}
          className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs hover:border-emerald-400 transition-all cursor-pointer relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
              Settled
            </span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-xs font-medium text-gray-500">Completed</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-2xl font-bold text-gray-900">
              {loading ? '—' : counts.completed}
            </h2>
          </div>
          <p className="text-[11px] text-emerald-600 font-medium mt-2 truncate">Work signed off</p>
        </motion.div>

        {/* 6. Available Engineers */}
        <motion.div
          whileHover={{ y: -3 }}
          onClick={() => navigate(path('engineers?tab=available'))}
          className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs hover:border-purple-400 transition-all cursor-pointer relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
              Workforce
            </span>
            <div className="h-8 w-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="text-xs font-medium text-gray-500">Available Engineers</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-2xl font-bold text-gray-900">
              {loading ? '—' : counts.availableEngineers}
            </h2>
            <span className="text-xs text-gray-400">/ {counts.totalEngineers || counts.availableEngineers}</span>
          </div>
          <p className="text-[11px] text-purple-600 font-medium mt-2 truncate">Ready for dispatch</p>
        </motion.div>

        {/* 7. Earnings */}
        <motion.div
          whileHover={{ y: -3 }}
          onClick={() => navigate(path('finance/earnings'))}
          className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs hover:border-[#0D8A72] transition-all cursor-pointer relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#0D8A72] bg-[#0D8A72]/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
              Earnings
            </span>
            <div className="h-8 w-8 rounded-lg bg-[#0D8A72]/10 text-[#0D8A72] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <p className="text-xs font-medium text-gray-500">Earnings</p>
          <div className="flex items-baseline gap-1 mt-1">
            <h2 className="text-xl font-bold text-gray-900 truncate">
              {loading ? '—' : `₹${Number(counts.totalEarnings || counts.walletBalance || 0).toLocaleString('en-IN')}`}
            </h2>
          </div>
          <p className="text-[11px] text-[#0D8A72] font-medium mt-2 truncate">
            {counts.b2bEarnings > 0 ? `B2B: ₹${counts.b2bEarnings.toLocaleString('en-IN')}` : 'Verified revenue'}
          </p>
        </motion.div>
      </div>

      {/* ── FIELD OPERATIONS (central job records, live) ── */}
      <div className="mb-8">
        <JobOpsOverview />
      </div>

      {/* ── OPERATIONAL WORKSPACE TABS ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden mb-8">
        {/* Tab Headers */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {[
              { id: 'active_operations', label: 'Active & In-Progress Operations', count: counts.activeJobs, icon: Briefcase },
              { id: 'incoming_pipeline', label: 'Incoming Requests & B2B Pipeline', count: counts.newUserRequests + counts.newB2BJobs, icon: Inbox },
              { id: 'workforce', label: 'Available Engineers Roster', count: counts.availableEngineers, icon: Users },
              { id: 'finance', label: 'Earnings & Settlement Overview', count: null, icon: TrendingUp }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                    isActive
                      ? 'bg-white text-gray-900 shadow-xs border border-gray-200'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/80'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-[#0D8A72]' : 'text-gray-400'}`} />
                  <span>{tab.label}</span>
                  {tab.count !== null && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        isActive ? 'bg-[#0D8A72] text-white' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            {activeTab === 'active_operations' && (
              <div className="inline-flex bg-gray-100 p-1 rounded-xl text-xs font-semibold text-gray-600">
                <button
                  onClick={() => setOpsFilter('all')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    opsFilter === 'all' ? 'bg-white text-gray-900 shadow-xs' : 'hover:text-gray-900'
                  }`}
                >
                  All ({counts.activeJobs})
                </button>
                <button
                  onClick={() => setOpsFilter('in_progress')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    opsFilter === 'in_progress' ? 'bg-white text-gray-900 shadow-xs text-amber-600 font-bold' : 'hover:text-gray-900'
                  }`}
                >
                  In Progress ({counts.inProgress})
                </button>
                <button
                  onClick={() => setOpsFilter('user')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    opsFilter === 'user' ? 'bg-white text-cyan-700 shadow-xs' : 'hover:text-gray-900'
                  }`}
                >
                  User Jobs ({counts.userActiveJobs})
                </button>
                <button
                  onClick={() => setOpsFilter('b2b')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    opsFilter === 'b2b' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-gray-900'
                  }`}
                >
                  B2B Jobs ({counts.b2bActiveJobs})
                </button>
              </div>
            )}
            {activeTab === 'incoming_pipeline' && (
              <div className="inline-flex bg-gray-100 p-1 rounded-xl text-xs font-semibold text-gray-600">
                <button
                  onClick={() => setPipelineSubTab('user_requests')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    pipelineSubTab === 'user_requests' ? 'bg-white text-cyan-700 shadow-xs font-bold' : 'hover:text-gray-900'
                  }`}
                >
                  User App ({counts.newUserRequests})
                </button>
                <button
                  onClick={() => setPipelineSubTab('b2b_jobs')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    pipelineSubTab === 'b2b_jobs' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'hover:text-gray-900'
                  }`}
                >
                  B2B Enterprise ({counts.newB2BJobs})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab Body Content */}
        <div className="p-6">
          {/* ═════════ TAB 1: ACTIVE & IN PROGRESS OPERATIONS ═════════ */}
          {activeTab === 'active_operations' && (
            <div>
              {loading ? (
                <div className="space-y-4 py-8">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : filteredOperations.length === 0 ? (
                <div className="py-12 text-center">
                  <Briefcase className="mx-auto h-12 w-12 text-gray-300" />
                  <h3 className="mt-3 text-base font-semibold text-gray-900">No active operations matching filter</h3>
                  <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
                    When service requests or B2B contracts are accepted and assigned to engineers, they appear here with live execution tracking.
                  </p>
                  <div className="mt-5">
                    <Link
                      to={path('requests')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#0D8A72] hover:bg-[#0b735f]"
                    >
                      Browse Incoming Requests <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOperations.map((job) => {
                    const isUserJob = job.source === 'USER JOB' || job.sourceType === 'user';
                    const isInProgress = ['in_progress', 'on_site', 'en_route', 'travelling', 'arrived', 'started'].includes(
                      job.status?.toLowerCase()
                    );

                    return (
                      <div
                        key={job.id || job.code}
                        className="p-4 rounded-xl border border-gray-200 hover:border-gray-300 bg-white hover:shadow-xs transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          {/* Source Badge */}
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider shrink-0 mt-0.5 ${
                              isUserJob
                                ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {isUserJob ? 'USER JOB' : 'B2B JOB'}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-gray-900 truncate">{job.title}</h4>
                              <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                                {job.code}
                              </span>
                              {isInProgress && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  IN PROGRESS
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                              <span className="inline-flex items-center gap-1 font-medium text-gray-700">
                                <User className="h-3.5 w-3.5 text-gray-400" />
                                {job.clientName || 'Client'}
                              </span>
                              {job.city && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                  {job.city}
                                </span>
                              )}
                              {(job.engineerName || job.engineersAssigned?.length > 0) && (
                                <span className="inline-flex items-center gap-1 text-[#0D8A72] font-semibold">
                                  <Users className="h-3.5 w-3.5" />
                                  {job.engineerName || job.engineersAssigned?.[0]?.name || 'Engineer Assigned'}
                                </span>
                              )}
                              {job.startTime && (
                                <span className="inline-flex items-center gap-1 text-gray-400">
                                  <Clock className="h-3.5 w-3.5" />
                                  {new Date(job.startTime).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Progress & Quick Action */}
                        <div className="flex items-center justify-between lg:justify-end gap-5 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                          <div className="w-36">
                            <div className="flex justify-between text-[11px] font-semibold text-gray-600 mb-1">
                              <span>Progress</span>
                              <span className="font-bold text-gray-900">{job.progress || 0}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full transition-all ${
                                  isInProgress ? 'bg-amber-500' : 'bg-[#0D8A72]'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(10, job.progress || 20))}%` }}
                              />
                            </div>
                          </div>

                          <Link
                            to={path('projects')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
                          >
                            <span>Manage</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═════════ TAB 2: INCOMING REQUESTS & B2B PIPELINE ═════════ */}
          {activeTab === 'incoming_pipeline' && (
            <div>
              {pipelineSubTab === 'user_requests' ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">New User App Requests</h3>
                      <p className="text-xs text-gray-500">Service requests submitted directly by consumers requiring your immediate review or engineer assignment.</p>
                    </div>
                    <Link
                      to={path('requests?tab=user')}
                      className="text-xs font-semibold text-[#0D8A72] hover:underline inline-flex items-center gap-1"
                    >
                      View All User Requests <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  {lists.newUserRequests.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <Inbox className="mx-auto h-10 w-10 text-gray-300" />
                      <p className="mt-2 text-sm font-semibold text-gray-700">No pending user requests</p>
                      <p className="text-xs text-gray-400 mt-0.5">New on-demand consumer bookings will appear here instantly via live radar.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {lists.newUserRequests.map((req) => (
                        <div
                          key={req.id}
                          className="p-4 rounded-xl border border-gray-200 bg-white hover:shadow-xs transition-all flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200 uppercase">
                                USER REQUEST
                              </span>
                              <span className="text-[11px] font-mono text-gray-400">{req.oppCode}</span>
                            </div>

                            <h4 className="text-sm font-bold text-gray-900 mt-2">{req.title}</h4>
                            <p className="text-xs text-gray-500 font-medium">{req.categoryName}</p>

                            <div className="mt-3 space-y-1.5 text-xs text-gray-600">
                              <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                <span className="font-semibold text-gray-800">{req.clientName}</span>
                                {req.clientPhone && <span className="text-gray-400">({req.clientPhone})</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                <span>{req.city} {req.address ? `· ${req.address}` : ''}</span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-900">
                              Est: ₹{Number(req.budget || 0).toLocaleString('en-IN')}
                            </span>
                            <Link
                              to={path('requests?tab=user&status=new')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#0D8A72] hover:bg-[#0b735f]"
                            >
                              <span>Review & Accept</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">New B2B Enterprise Jobs</h3>
                      <p className="text-xs text-gray-500">Corporate, AMC, and multi-site enterprise contracts requiring quotation, bidding, or engineer dispatch.</p>
                    </div>
                    <Link
                      to={path('requests?tab=b2b')}
                      className="text-xs font-semibold text-[#0D8A72] hover:underline inline-flex items-center gap-1"
                    >
                      View All B2B Jobs <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  {lists.newB2BJobs.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <Building2 className="mx-auto h-10 w-10 text-gray-300" />
                      <p className="mt-2 text-sm font-semibold text-gray-700">No pending B2B jobs</p>
                      <p className="text-xs text-gray-400 mt-0.5">Enterprise contracts and RFQs matching your registered categories will appear here.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {lists.newB2BJobs.map((job) => (
                        <div
                          key={job.id}
                          className="p-4 rounded-xl border border-gray-200 bg-white hover:shadow-xs transition-all flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                                B2B ENTERPRISE
                              </span>
                              <span className="text-[11px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                Priority: {job.priority || 'Normal'}
                              </span>
                            </div>

                            <h4 className="text-sm font-bold text-gray-900 mt-2">{job.title}</h4>
                            <p className="text-xs font-semibold text-indigo-700 mt-0.5">{job.companyName}</p>

                            <div className="mt-3 space-y-1.5 text-xs text-gray-600">
                              <div className="flex items-center gap-2">
                                <Layers className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                <span>Domain: {job.categoryName} ({job.totalSites || 1} site)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                <span>{job.city}</span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-900">
                              Budget: ₹{Number(job.budget || 0).toLocaleString('en-IN')}
                            </span>
                            <Link
                              to={path('requests?tab=b2b')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#0D8A72] hover:bg-[#0b735f]"
                            >
                              <span>Submit Bid / Accept</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═════════ TAB 3: AVAILABLE ENGINEERS ROSTER ═════════ */}
          {activeTab === 'workforce' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Active & Available Engineers</h3>
                  <p className="text-xs text-gray-500">Live roster of verified engineers under your vendor account ready for instant project assignment.</p>
                </div>
                <Link
                  to={path('workforce')}
                  className="text-xs font-semibold text-[#0D8A72] hover:underline inline-flex items-center gap-1"
                >
                  Manage Full Workforce ({counts.totalEngineers}) <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {lists.availableEngineers.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <Users className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-2 text-sm font-semibold text-gray-700">All engineers currently on project or leave</p>
                  <p className="text-xs text-gray-400 mt-0.5">Engineers will automatically appear as available once they complete active field jobs.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {lists.availableEngineers.map((eng) => (
                    <div
                      key={eng.id}
                      className="p-4 rounded-xl border border-gray-200 bg-white hover:border-[#0D8A72] hover:shadow-xs transition-all flex flex-col justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center shrink-0 border border-emerald-200">
                          {eng.name?.[0] || 'E'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-gray-900 truncate">{eng.name}</h4>
                          <p className="text-xs text-[#0D8A72] font-medium truncate">{eng.primarySkill}</p>
                          <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-1">
                            <MapPin className="h-3 w-3 text-gray-400" />
                            <span className="truncate">{eng.city}</span>
                            <span className="text-amber-500 font-bold ml-auto">★ {eng.rating}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          AVAILABLE
                        </span>
                        <Link
                          to={path('projects')}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[#0D8A72] bg-[#0D8A72]/10 hover:bg-[#0D8A72]/20"
                        >
                          Assign Job
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═════════ TAB 4: EARNINGS & SETTLEMENTS ═════════ */}
          {activeTab === 'finance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-white border border-gray-200">
                  <span className="text-xs font-semibold text-gray-500">Available Wallet Balance</span>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    ₹{Number(counts.walletBalance || 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-emerald-600 mt-1 font-medium">Ready for withdrawal</p>
                </div>
                <div className="p-4 rounded-xl bg-white border border-gray-200">
                  <span className="text-xs font-semibold text-gray-500">Held in Escrow</span>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    ₹{Number(counts.escrowBalance || 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">Releases upon completion OTP</p>
                </div>
                <div className="p-4 rounded-xl bg-white border border-gray-200">
                  <span className="text-xs font-semibold text-gray-500">Total B2B Earnings</span>
                  <p className="text-2xl font-bold text-indigo-700 mt-1">
                    ₹{Number(counts.b2bEarnings || 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">From corporate project contracts</p>
                </div>
                <div className="p-4 rounded-xl bg-white border border-gray-200">
                  <span className="text-xs font-semibold text-gray-500">Total User App Earnings</span>
                  <p className="text-2xl font-bold text-cyan-700 mt-1">
                    ₹{Number(counts.userEarnings || 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">From on-demand service bookings</p>
                </div>
              </div>

              {/* Recent Completed Settled Jobs */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-900">Recent Completed Jobs & Payouts</h4>
                  <Link to={path('finance')} className="text-xs font-semibold text-[#0D8A72] hover:underline">
                    Open Finance Ledger & Invoices →
                  </Link>
                </div>

                {lists.completed.length === 0 ? (
                  <p className="text-xs text-gray-500 italic py-4">No completed jobs yet.</p>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold">
                        <tr>
                          <th className="py-2.5 px-4">Job / Project</th>
                          <th className="py-2.5 px-4">Source</th>
                          <th className="py-2.5 px-4">Engineer</th>
                          <th className="py-2.5 px-4">Completed On</th>
                          <th className="py-2.5 px-4 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {lists.completed.map((c, i) => (
                          <tr key={i} className="hover:bg-gray-50/80">
                            <td className="py-2.5 px-4 font-semibold text-gray-900">
                              {c.title} <span className="font-mono text-gray-400 font-normal">({c.code})</span>
                            </td>
                            <td className="py-2.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  c.source === 'USER JOB' || c.sourceType === 'user'
                                    ? 'bg-cyan-50 text-cyan-700'
                                    : 'bg-indigo-50 text-indigo-700'
                                }`}
                              >
                                {c.source}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-gray-600">{c.engineerName || 'Field Engineer'}</td>
                            <td className="py-2.5 px-4 text-gray-400">
                              {c.completionDate ? new Date(c.completionDate).toLocaleDateString() : 'Recent'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-gray-900">
                              ₹{Number(c.amount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── FOOTER STATS & SLA TIER SUMMARY ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500">SLA Adherence</p>
            <p className="text-xl font-bold text-emerald-600 mt-0.5">96.4%</p>
          </div>
          <Shield className="h-8 w-8 text-emerald-500/30" />
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500">Customer Satisfaction</p>
            <p className="text-xl font-bold text-yellow-500 mt-0.5">★ {overallRating} / 5.0</p>
          </div>
          <Sparkles className="h-8 w-8 text-yellow-500/30" />
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500">Live Socket Status</p>
            <p className="text-xs font-bold text-emerald-600 mt-1 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Connected to Engine
            </p>
          </div>
          <Zap className="h-8 w-8 text-[#0D8A72]/30" />
        </div>
      </div>
    </div>
  );
};

export default DynamicDashboard;
