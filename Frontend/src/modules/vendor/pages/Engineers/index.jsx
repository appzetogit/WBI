import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  Search,
  RefreshCw,
  MapPin,
  Star,
  Briefcase,
  Zap,
  CheckCircle2,
  AlertCircle,
  Eye,
  Phone,
  Clock,
  Sparkles,
  Ban,
  Power,
  Shield,
  Layers
} from 'lucide-react';
import { fetchVendorEngineers, syncEngineers, updateEngineerStatus } from '../../services/vendorEngineersService';
import { useVendorSocket } from '../../context/VendorSocketContext';
import EngineerDetailsModal from './components/EngineerDetailsModal';
import AssignJobToEngineerModal from './components/AssignJobToEngineerModal';

const AVAILABILITY_CONFIG = {
  available: { label: 'Available', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  busy: { label: 'Busy / On Job', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  leave: { label: 'On Leave', bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  offline: { label: 'Offline / Inactive', bg: 'bg-gray-100 text-gray-600 border-gray-300', dot: 'bg-gray-400' }
};

const Engineers = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'all'; // 'all' | 'available' | 'busy' | 'leave' | 'offline'

  const [engineers, setEngineers] = useState([]);
  const [counts, setCounts] = useState({ total: 0, available: 0, busy: 0, onLeave: 0, offline: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');

  // Modals state
  const [selectedEngineerId, setSelectedEngineerId] = useState(null);
  const [assignJobEngineer, setAssignJobEngineer] = useState(null);

  const { socket } = useVendorSocket() || {};

  const loadEngineers = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await fetchVendorEngineers({
        status: activeTab !== 'all' ? activeTab : undefined,
        search,
        limit: 50
      });

      if (res.success) {
        setEngineers(res.data || []);
        if (res.counts) setCounts(res.counts);
      }
    } catch (err) {
      console.error('Error loading vendor engineers:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    loadEngineers();
  }, [loadEngineers]);

  // Real-time synchronization
  useEffect(() => {
    if (!socket || typeof socket.on !== 'function') return;

    const handleUpdate = () => {
      loadEngineers(true);
    };

    socket.on('engineer:assigned', handleUpdate);
    socket.on('b2b:jobStatusUpdated', handleUpdate);
    socket.on('ops:job_status_updated', handleUpdate);
    socket.on('job:updated', handleUpdate);

    return () => {
      if (typeof socket.off === 'function') {
        socket.off('engineer:assigned', handleUpdate);
        socket.off('b2b:jobStatusUpdated', handleUpdate);
        socket.off('ops:job_status_updated', handleUpdate);
        socket.off('job:updated', handleUpdate);
      }
    };
  }, [socket, loadEngineers]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncEngineers();
      await loadEngineers(true);
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleStatusToggle = async (engId, currentStatus) => {
    const action = currentStatus === 'active' ? 'suspend' : 'activate';
    try {
      await updateEngineerStatus(engId, { action });
      loadEngineers(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update engineer status');
    }
  };

  const setTab = (tabKey) => {
    const nextParams = new URLSearchParams(searchParams);
    if (tabKey === 'all') nextParams.delete('tab');
    else nextParams.set('tab', tabKey);
    setSearchParams(nextParams);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-200">
      {/* 1. Header Banner Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-teal-50 text-teal-700 text-xs font-bold rounded-lg border border-teal-200 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Workforce Operations
            </span>
            <span className="text-xs text-gray-400 font-medium">Technicians & Deployment Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">
            Engineers & Workforce
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Manage your dedicated technicians, live project availability, skill matrices, and direct job assignments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold flex items-center gap-2 border border-teal-200 transition-colors shadow-sm disabled:opacity-50"
            title="Sync newly approved company engineers"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Linked Engineers'}</span>
          </button>

          <button
            onClick={() => loadEngineers(true)}
            disabled={refreshing || loading}
            className="p-2.5 text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors shadow-sm disabled:opacity-50"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Metric KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total */}
        <div
          onClick={() => setTab('all')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer bg-white ${
            activeTab === 'all'
              ? 'border-teal-600 ring-2 ring-teal-600/20 shadow-md'
              : 'border-gray-200 hover:border-teal-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Workforce</span>
            <div className={`p-2 rounded-xl ${activeTab === 'all' ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-600'}`}>
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-gray-900">{counts.total}</span>
            <span className="text-xs font-semibold text-gray-400">Registered</span>
          </div>
        </div>

        {/* Card 2: Available */}
        <div
          onClick={() => setTab('available')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer bg-white ${
            activeTab === 'available'
              ? 'border-emerald-600 ring-2 ring-emerald-600/20 shadow-md'
              : 'border-gray-200 hover:border-emerald-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Available for Jobs</span>
            <div className={`p-2 rounded-xl ${activeTab === 'available' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-600'}`}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-600">{counts.available}</span>
            <span className="text-xs font-semibold text-emerald-600/80">Ready to Dispatch</span>
          </div>
        </div>

        {/* Card 3: Busy */}
        <div
          onClick={() => setTab('busy')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer bg-white ${
            activeTab === 'busy'
              ? 'border-amber-600 ring-2 ring-amber-600/20 shadow-md'
              : 'border-gray-200 hover:border-amber-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Busy / On Project</span>
            <div className={`p-2 rounded-xl ${activeTab === 'busy' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-600'}`}>
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-600">{counts.busy}</span>
            <span className="text-xs font-semibold text-amber-600/80">Executing Jobs</span>
          </div>
        </div>

        {/* Card 4: Leave */}
        <div
          onClick={() => setTab('leave')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer bg-white ${
            activeTab === 'leave'
              ? 'border-rose-600 ring-2 ring-rose-600/20 shadow-md'
              : 'border-gray-200 hover:border-rose-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">On Approved Leave</span>
            <div className={`p-2 rounded-xl ${activeTab === 'leave' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600'}`}>
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-rose-600">{counts.onLeave}</span>
            <span className="text-xs font-semibold text-rose-600/80">Scheduled Absence</span>
          </div>
        </div>
      </div>

      {/* 3. Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          {[
            { key: 'all', label: 'All Engineers', count: counts.total },
            { key: 'available', label: 'Available', count: counts.available },
            { key: 'busy', label: 'Busy / On Job', count: counts.busy },
            { key: 'leave', label: 'On Leave', count: counts.onLeave },
            { key: 'offline', label: 'Offline / Inactive', count: counts.offline }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[260px] md:min-w-[300px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, ID, skill, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
          />
        </div>
      </div>

      {/* 4. Engineer Grid or Dynamic Empty States */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-white rounded-2xl border border-gray-200 animate-pulse p-5 space-y-4">
              <div className="flex gap-3">
                <div className="w-12 h-12 bg-gray-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="w-24 h-4 bg-gray-200 rounded" />
                  <div className="w-32 h-3 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="h-16 bg-gray-100 rounded-xl" />
              <div className="h-8 bg-gray-100 rounded-xl" />
            </div>
          ))}
        </div>
      ) : engineers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300 p-6 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto text-gray-400">
            {activeTab === 'busy' ? (
              <Briefcase className="w-6 h-6 text-emerald-600" />
            ) : activeTab === 'leave' ? (
              <Clock className="w-6 h-6 text-gray-400" />
            ) : (
              <Users className="w-6 h-6 text-gray-400" />
            )}
          </div>
          <h3 className="text-base font-bold text-gray-900">
            {activeTab === 'busy'
              ? 'All Engineers Are Available'
              : activeTab === 'leave'
              ? 'No Engineers on Leave'
              : activeTab === 'available'
              ? 'No Available Engineers'
              : search
              ? `No engineers matching "${search}"`
              : 'No Engineers Listed'}
          </h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {activeTab === 'busy'
              ? 'None of your technicians are currently busy on an active job. You can assign incoming accepted work from My Jobs anytime.'
              : activeTab === 'leave'
              ? 'All active technicians are present and available for dispatch.'
              : search
              ? 'Try clearing or changing your search filters.'
              : 'Sync linked company technicians to view and manage them in your workforce.'}
          </p>

          <div className="pt-2 flex items-center justify-center gap-3">
            {activeTab !== 'all' && (
              <button
                onClick={() => setTab('all')}
                className="px-4 py-2 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all"
              >
                View All Engineers
              </button>
            )}
            <button
              onClick={handleSync}
              className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-sm inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sync Linked Engineers
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {engineers.map((eng) => {
            const avail = AVAILABILITY_CONFIG[eng.availability] || AVAILABILITY_CONFIG.offline;
            const initials = eng.name ? eng.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'EN';

            return (
              <div
                key={eng._id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
              >
                {/* Card Top Content */}
                <div className="p-5 space-y-4">
                  {/* Profile Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        {eng.photo ? (
                          <img
                            src={eng.photo}
                            alt={eng.name}
                            className="w-12 h-12 rounded-xl object-cover border border-gray-200 shadow-sm"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-900 text-teal-400 font-bold flex items-center justify-center text-sm shadow-sm">
                            {initials}
                          </div>
                        )}
                        <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${avail.dot}`} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-gray-900 truncate group-hover:text-teal-700 transition-colors">
                          {eng.name}
                        </h4>
                        <p className="text-[11px] font-mono text-gray-400">{eng.employeeId}</p>
                        <p className="text-xs text-gray-500 truncate">{eng.role} · {eng.serviceCategoryName || 'Operations'}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${avail.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${avail.dot}`} />
                        {avail.label}
                      </span>
                      {eng.status === 'suspended' && (
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                          Suspended
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Skills & Stats */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-md border border-teal-100">
                      {eng.primarySkill}
                    </span>
                    <span className="text-[11px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md capitalize">
                      {eng.certificationLevel}
                    </span>
                    <span className="text-[11px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                      {eng.experienceYears}y exp
                    </span>
                    <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      {eng.rating}
                    </span>
                  </div>

                  {/* Location & Contact Info */}
                  <div className="text-xs text-gray-500 space-y-1 pt-1 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 truncate text-gray-600">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{eng.city || 'Assigned Zone'}</span>
                      </span>
                      <span className="flex items-center gap-1 text-gray-600">
                        <Phone className="w-3 h-3 text-gray-400" />
                        <span>{eng.phone || '—'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Active Job Callout */}
                  {eng.activeJob ? (
                    <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-bold text-amber-900">{eng.activeJob.jobCode}</span>
                        <span className="font-bold uppercase text-[10px] text-amber-800 px-1.5 py-0.2 rounded bg-amber-100 border border-amber-300">
                          {eng.activeJob.status?.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-gray-900 truncate">{eng.activeJob.title}</p>
                      <p className="text-[11px] text-gray-500 truncate">{eng.activeJob.source} · {eng.activeJob.service}</p>
                    </div>
                  ) : eng.availability === 'available' && eng.status === 'active' ? (
                    <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between text-xs text-emerald-800">
                      <span className="flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Available for Immediate Assignment
                      </span>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                  ) : eng.availability === 'leave' ? (
                    <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-100 text-xs text-rose-800 flex items-center gap-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5 text-rose-600" />
                      Approved Leave in Progress
                    </div>
                  ) : null}
                </div>

                {/* Card Bottom Actions */}
                <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setSelectedEngineerId(eng._id)}
                    className="px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-all shadow-sm flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Profile</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {eng.availability === 'available' && eng.status === 'active' && (
                      <button
                        onClick={() => setAssignJobEngineer(eng)}
                        className="px-3.5 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-sm shadow-teal-700/20 flex items-center gap-1"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Assign Job</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleStatusToggle(eng._id, eng.status)}
                      className={`p-1.5 rounded-xl border transition-colors ${
                        eng.status === 'active'
                          ? 'border-gray-200 text-gray-400 hover:text-rose-600 hover:bg-rose-50'
                          : 'border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                      title={eng.status === 'active' ? 'Suspend Engineer' : 'Activate Engineer'}
                    >
                      {eng.status === 'active' ? <Ban className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Modals */}
      {selectedEngineerId && (
        <EngineerDetailsModal
          engineerId={selectedEngineerId}
          onClose={() => setSelectedEngineerId(null)}
          onOpenAssignJob={(eng) => setAssignJobEngineer(eng)}
          onUpdated={() => loadEngineers(true)}
        />
      )}

      {assignJobEngineer && (
        <AssignJobToEngineerModal
          engineer={assignJobEngineer}
          onClose={() => setAssignJobEngineer(null)}
          onAssigned={() => {
            loadEngineers(true);
          }}
        />
      )}
    </div>
  );
};

export default Engineers;
