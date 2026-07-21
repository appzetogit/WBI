import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiLoader, FiCalendar, FiClock, FiUser, FiMapPin } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import adminEngineerService from '../../../../services/adminEngineerService';

const JOB_TYPE_LABEL = {
  vendor_ops: 'Vendor Ops',
  b2b: 'B2B'
};

const EngineerJobs = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadJobs = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        status: filterStatus === 'all' ? undefined : filterStatus,
        search: searchQuery || undefined
      };
      const response = await adminEngineerService.getAllJobs(params);
      if (response.success) {
        setJobs(response.data || []);
        setPagination(response.pagination || { page: 1, limit: 20, total: 0, pages: 1 });
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
      toast.error('Failed to load engineer jobs');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, searchQuery]);

  useEffect(() => {
    loadJobs(1);
  }, [loadJobs]);

  const getStatusStyle = (status) => {
    const s = String(status || '').toLowerCase();
    if (s.includes('pending') || s === 'searching_engineer') return 'bg-yellow-100 text-yellow-800';
    if (s.includes('accept') || s === 'assigned') return 'bg-blue-100 text-blue-800';
    if (s.includes('progress') || s.includes('route') || s.includes('site')) return 'bg-purple-100 text-purple-800';
    if (s.includes('complete')) return 'bg-green-100 text-green-800';
    if (s.includes('cancel') || s.includes('reject') || s === 'failed') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  const formatDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN');
  };

  return (
    <div className="space-y-6">
      <CardShell icon={FiClock} title="Engineer jobs" subtitle="Vendor ops + B2B field jobs">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
              <FiSearch className="w-5 h-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search by engineer name or phone..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
          >
            <option value="all">All status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <FiLoader className="w-8 h-8 text-gray-400 animate-spin mr-3" />
              <span className="text-gray-700 font-medium">Loading jobs...</span>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 text-gray-600 font-medium">
              No vendor ops or B2B jobs found. Assign jobs from Vendor Ops or B2B matching.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {jobs.map((job) => (
                <motion.div
                  key={`${job.jobType || 'job'}-${job._id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow bg-white"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="bg-primary-50 p-3 rounded-lg shrink-0">
                        <FiCalendar className="text-primary-600 w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="font-bold text-gray-900">{job.serviceId?.title || 'Job'}</h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                            {JOB_TYPE_LABEL[job.jobType] || 'Job'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusStyle(job.displayStatus || job.status)}`}>
                            {(job.displayStatus || job.status || '').replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <FiUser className="w-4 h-4 shrink-0" />
                            <span>
                              Engineer:{' '}
                              <span className="font-medium text-gray-900">{job.engineerId?.name || 'Unassigned'}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiUser className="w-4 h-4 text-blue-500 shrink-0" />
                            <span>
                              Client:{' '}
                              <span className="font-medium text-gray-900">{job.userId?.name || '—'}</span>
                            </span>
                          </div>
                          {job.jobCode && (
                            <div className="text-xs text-gray-500 font-mono">ID: {job.jobCode}</div>
                          )}
                          <div className="flex items-center gap-2">
                            <FiMapPin className="w-4 h-4 shrink-0" />
                            <span className="truncate">{job.city || job.addressLine || '—'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiCalendar className="w-4 h-4 shrink-0" />
                            <span>Date: {formatDate(job.bookingDate)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiClock className="w-4 h-4 shrink-0" />
                            <span>Time: {job.bookingTime || '—'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-lg font-bold text-gray-900">
                        ₹{Number(job.finalAmount || 0).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {!loading && pagination.pages > 1 && (
          <div className="flex justify-center mt-8 gap-2 flex-wrap">
            {[...Array(pagination.pages)].map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => loadJobs(i + 1)}
                className={`w-10 h-10 rounded-lg font-semibold transition-all ${
                  pagination.page === i + 1
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </CardShell>
    </div>
  );
};

export default EngineerJobs;

export default EngineerJobs;




