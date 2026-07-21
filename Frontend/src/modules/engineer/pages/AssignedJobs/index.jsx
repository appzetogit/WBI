import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronRight, FiFilter } from 'react-icons/fi';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import engineerService from '../../../../services/engineerService';
import { SkeletonList } from '../../../../components/common/SkeletonLoaders';
import optimizeCloudinaryUrl from '../../../../utils/cloudinaryOptimize';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
];

const AssignedJobs = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
    error,
  } = useInfiniteQuery({
    queryKey: ['engineerAssignedJobs', filter],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await engineerService.getAssignedJobs({
        page: pageParam,
        limit: 10,
        status: filter,
      });
      if (!response.success) throw new Error('Failed to fetch jobs');
      return {
        jobs: response.jobs || response.data || [],
        pagination: response.pagination || { page: 1, pages: 1 },
        counts: response.counts || { all: 0, assigned: 0, in_progress: 0, completed: 0 },
      };
    },
    getNextPageParam: (lastPage) => (
      lastPage.pagination.page < lastPage.pagination.pages
        ? lastPage.pagination.page + 1
        : undefined
    ),
  });

  const jobs = useMemo(() => (data ? data.pages.flatMap((page) => page.jobs) : []), [data]);
  const counts = data?.pages[0]?.counts || { all: 0, assigned: 0, in_progress: 0, completed: 0 };
  const loading = status === 'pending';
  const shouldVirtualize = jobs.length >= 50;

  const rowVirtualizer = useWindowVirtualizer({
    count: shouldVirtualize ? jobs.length : 0,
    estimateSize: () => 136,
    overscan: 8,
  });

  useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['engineerAssignedJobs'] });
    };
    window.addEventListener('workerJobsUpdated', handleUpdate);
    return () => window.removeEventListener('workerJobsUpdated', handleUpdate);
  }, [queryClient]);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || loading) return;

    if (shouldVirtualize) {
      const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();
      if (lastItem && lastItem.index >= jobs.length - 4) fetchNextPage();
      return;
    }

    const handleScroll = () => {
      const remaining = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      if (remaining < 360) fetchNextPage();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, jobs.length, loading, rowVirtualizer, shouldVirtualize]);

  const getStatusConfig = (jobStatus) => {
    const normalized = (jobStatus || '').toLowerCase();
    switch (normalized) {
      case 'assigned':
      case 'confirmed':
      case 'accepted':
        return { label: 'Assigned', bg: 'bg-[#16A34A]', text: 'text-white' };
      case 'in_progress':
      case 'journey_started':
      case 'visited':
      case 'on_the_way':
      case 'started':
      case 'reached':
        return { label: 'In Progress', bg: 'bg-[#F97316]', text: 'text-white' };
      case 'completed':
      case 'work_done':
      case 'paid':
      case 'worker_paid':
        return { label: 'Completed', bg: 'bg-[#64748B]', text: 'text-white' };
      case 'pending':
      case 'pending_acceptance':
        return { label: 'New', bg: 'bg-[#0D9488]', text: 'text-white' };
      case 'cancelled':
      case 'rejected':
        return { label: 'Cancelled', bg: 'bg-[#EF4444]', text: 'text-white' };
      default:
        return { label: jobStatus || 'Pending', bg: 'bg-[#64748B]', text: 'text-white' };
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'N/A';

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (date.toDateString() === today.toDateString()) return `Today, ${timeStr}`;
    if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${timeStr}`;
    return `${date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}, ${timeStr}`;
  };

  const renderJobCard = (job) => {
    const statusConfig = getStatusConfig(job.status);
    const serviceIcon = job.serviceId?.categoryIcon || job.serviceId?.iconUrl;

    return (
      <div
        key={job._id}
        onClick={() =>
          navigate(job.isOpsJob ? `/engineer/ops-jobs/${job._id}` : `/engineer/job/${job._id}`)
        }
        className="bg-white rounded-[1.25rem] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 cursor-pointer active:scale-[0.98] transition-transform"
      >
        <div className="flex gap-4">
          <div className="w-14 h-14 bg-[#F0FDFA] rounded-2xl flex items-center justify-center shrink-0 border border-teal-50">
            {serviceIcon ? (
              <img
                fetchPriority="low"
                loading="lazy"
                src={optimizeCloudinaryUrl(serviceIcon, { width: 400 })}
                alt="service"
                className="w-7 h-7 object-contain opacity-90"
              />
            ) : (
              <div className="w-7 h-7 flex items-center justify-center rounded-lg text-[#0D9488]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 7A4 4 0 118 7a4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-between ml-1">
            <div className="flex justify-between items-start gap-2 mb-0.5">
              <h3 className="font-bold text-[#0F172A] text-[15px] leading-tight line-clamp-1">
                {job.serviceName || job.serviceId?.title || (job.isOpsJob ? 'Vendor project job' : 'Service Task')}
              </h3>
              <span className={`${statusConfig.bg} ${statusConfig.text} text-[10px] font-bold px-2 py-0.5 rounded tracking-wide shrink-0`}>
                {statusConfig.label}
              </span>
            </div>

            <div className="flex justify-between items-center mb-2">
              <p className="text-[#64748B] text-xs font-medium truncate">
                {job.address?.city
                  ? `${job.address.addressLine1 ? `${job.address.addressLine1}, ` : ''}${job.address.city}`
                  : job.city || 'Location unavailable'}
              </p>
              <FiChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            <div className="flex justify-between items-center mt-1">
              <div className="font-extrabold text-[#0F172A] text-sm">
                Rs. {job.finalAmount || job.basePrice || 0}
              </div>
              <div className="text-[#64748B] text-[11px] font-medium">
                {formatTime(job.scheduledDate)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderJobs = () => {
    if (!shouldVirtualize) return jobs.map((job) => renderJobCard(job));

    return rowVirtualizer.getVirtualItems().map((virtualRow) => {
      const job = jobs[virtualRow.index];
      return (
        <div
          key={job._id}
          data-index={virtualRow.index}
          ref={rowVirtualizer.measureElement}
          className="absolute left-0 top-0 w-full pb-4"
          style={{ transform: `translateY(${virtualRow.start}px)` }}
        >
          {renderJobCard(job)}
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="sticky top-0 z-40 bg-white shadow-sm px-4 h-14 flex items-center justify-between">
        <button
          onClick={() => navigate('/engineer/dashboard')}
          className="p-2 -ml-2 text-slate-800 hover:bg-slate-100 rounded-full transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 6H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-slate-900 tracking-tight">My Jobs</h1>
        <button className="p-2 -mr-2 text-slate-700 hover:bg-slate-100 rounded-full transition-colors">
          <FiFilter className="w-5 h-5" />
        </button>
      </header>

      <div className="bg-white border-b border-slate-200 sticky top-14 z-30">
        <div className="flex overflow-x-auto scrollbar-hide px-2">
          {FILTERS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`flex-shrink-0 px-4 py-3.5 text-sm font-semibold relative transition-colors ${
                filter === tab.id ? 'text-[#0D9488]' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label} ({counts?.[tab.id] || (tab.id === 'in_progress' ? counts?.inProgress : 0) || 0})
              {filter === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0D9488] rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="px-4 py-4">
        {loading ? (
          <SkeletonList count={5} cardHeight="120px" />
        ) : error ? (
          <div className="text-center py-12 text-red-500 bg-white rounded-2xl border border-red-100 shadow-sm">
            <p className="font-semibold">{error?.message || 'Failed to load jobs'}</p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['engineerAssignedJobs'] })}
              className="mt-3 text-sm font-bold text-teal-600 hover:text-teal-700"
            >
              Try Again
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-slate-900 font-bold mb-1">No jobs found</h3>
            <p className="text-slate-500 text-sm">You have no {filter !== 'all' ? filter.replace('_', ' ') : ''} jobs.</p>
          </div>
        ) : (
          <div
            className={shouldVirtualize ? 'relative' : 'space-y-4'}
            style={shouldVirtualize ? { height: `${rowVirtualizer.getTotalSize()}px` } : undefined}
          >
            {renderJobs()}
            {isFetchingNextPage && (
              <div className="py-4 flex justify-center">
                <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default AssignedJobs;
