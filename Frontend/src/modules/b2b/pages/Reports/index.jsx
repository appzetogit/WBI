import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  FiFileText, FiDownload, FiCheckCircle, FiClock, FiCalendar, 
  FiActivity, FiStar, FiFilter, FiRefreshCw, FiAlertCircle, FiLoader
} from 'react-icons/fi';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import api from '../../../../services/api';
import toast from 'react-hot-toast';

const Reports = () => {
  // Filter States
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [service, setService] = useState('');
  const [engineer, setEngineer] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('');

  // Active Query Parameters sent to APIs
  const [queryParams, setQueryParams] = useState({
    startDate: '',
    endDate: '',
    service: '',
    engineer: '',
    city: '',
    status: ''
  });

  // Helper States for Custom Date Range Picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePreset, setDatePreset] = useState('all'); // all, month, quarter, custom

  // 1. Fetch available engineers for filter dropdown
  const { data: engineersList } = useQuery({
    queryKey: ['b2bFilterEngineers'],
    queryFn: async () => {
      const res = await api.get('/b2b/engineers');
      return res.data.data || res.data;
    }
  });

  // 2. Fetch logged in company details for cities filter list
  const { data: companyProfile } = useQuery({
    queryKey: ['b2bFilterCompanyProfile'],
    queryFn: async () => {
      const res = await api.get('/b2b/company-profile');
      return res.data.company || res.data.data || res.data;
    }
  });

  // 3. Live services / cities from jobs + ServiceConfig catalog
  const { data: filterMeta } = useQuery({
    queryKey: ['b2bJobsFilterMeta'],
    queryFn: async () => {
      const res = await api.get('/b2b/jobs/filter-meta');
      return res.data?.data || {};
    },
    staleTime: 60_000
  });

  const branchCities = companyProfile?.branches?.map((b) => b.city).filter(Boolean) || [];
  const cities = (filterMeta?.cities?.length ? filterMeta.cities : branchCities).length
    ? (filterMeta?.cities?.length ? filterMeta.cities : branchCities)
    : [];
  const serviceOptions = filterMeta?.services || [];
  const statusOptions = filterMeta?.statuses || [
    'completed', 'in_progress', 'assigned', 'searching_engineer', 'pending',
    'pending_wallet', 'on_hold', 'cancelled', 'rejected', 'escalated', 'failed', 'closed'
  ];

  // Handle Preset Date changes
  useEffect(() => {
    if (datePreset !== 'custom') {
      const today = new Date();
      if (datePreset === 'all') {
        setStartDate('');
        setEndDate('');
      } else if (datePreset === 'month') {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(today.toISOString().split('T')[0]);
      } else if (datePreset === 'quarter') {
        const start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(today.toISOString().split('T')[0]);
      }
    }
  }, [datePreset]);

  // Queries for Report sections
  // 1. Summary Cards Query
  const { data: summary, isLoading: loadingSummary, error: summaryError, refetch: refetchSummary } = useQuery({
    queryKey: ['b2bReportsSummary', queryParams],
    queryFn: async () => {
      const res = await api.get('/b2b/reports/summary', { params: queryParams });
      return res.data.data;
    }
  });

  // 2. Service Performance Table Query
  const { data: services, isLoading: loadingServices, error: servicesError, refetch: refetchServices } = useQuery({
    queryKey: ['b2bReportsServices', queryParams],
    queryFn: async () => {
      const res = await api.get('/b2b/reports/service-performance', { params: queryParams });
      return res.data.data;
    }
  });

  // 3. Engineer Performance Table Query
  const { data: engineers, isLoading: loadingEngineers, error: engineersError, refetch: refetchEngineers } = useQuery({
    queryKey: ['b2bReportsEngineers', queryParams],
    queryFn: async () => {
      const res = await api.get('/b2b/reports/engineer-performance', { params: queryParams });
      return res.data.data;
    }
  });

  // 4. Expense Summary Query
  const { data: expenses, isLoading: loadingExpenses, error: expensesError, refetch: refetchExpenses } = useQuery({
    queryKey: ['b2bReportsExpenses', queryParams],
    queryFn: async () => {
      const res = await api.get('/b2b/reports/expense-summary', { params: queryParams });
      return res.data.data;
    }
  });

  // 5. Job Status Distribution Query
  const { data: jobStatus, isLoading: loadingJobStatus, error: jobStatusError, refetch: refetchJobStatus } = useQuery({
    queryKey: ['b2bReportsJobStatus', queryParams],
    queryFn: async () => {
      const res = await api.get('/b2b/reports/job-status', { params: queryParams });
      return res.data.data;
    }
  });

  // Apply all selected filters to the query state
  const handleApplyFilters = () => {
    if (datePreset === 'custom' && (!startDate || !endDate)) {
      toast.error('Please select both Start and End Dates');
      return;
    }
    setQueryParams({
      startDate,
      endDate,
      service,
      engineer,
      city,
      status
    });
    setShowDatePicker(false);
    toast.success('Filters applied successfully!');
  };

  // Reset all filters to default
  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setService('');
    setEngineer('');
    setCity('');
    setStatus('');
    setDatePreset('all');
    setQueryParams({
      startDate: '',
      endDate: '',
      service: '',
      engineer: '',
      city: '',
      status: ''
    });
    setShowDatePicker(false);
    toast.success('Filters reset to default');
  };

  // Export reports data to single Excel workbook
  const handleExportExcel = async () => {
    const toastId = toast.loading('Compiling Excel workbook...');
    try {
      const response = await api.get('/b2b/reports/export/excel', {
        params: queryParams,
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `WBI_B2B_Reports_${new Date().toISOString().substring(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('Excel workbook downloaded!', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Failed to export reports to Excel', { id: toastId });
    }
  };

  // Export reports layout as styled PDF document
  const handleExportPdf = async () => {
    const toastId = toast.loading('Generating PDF reports document...');
    try {
      const response = await api.get('/b2b/reports/export/pdf', {
        params: queryParams,
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `WBI_B2B_Reports_${new Date().toISOString().substring(0, 10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('PDF document downloaded!', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Failed to export reports to PDF', { id: toastId });
    }
  };

  // Refetch helper in case of API failure
  const handleRetryAll = () => {
    refetchSummary();
    refetchServices();
    refetchEngineers();
    refetchExpenses();
    refetchJobStatus();
  };

  // Status Distribution Pie / Donut Chart setup
  const COLORS = ['#10AFA5', '#F59E0B', '#EF4444'];
  const pieData = jobStatus ? [
    { name: 'Completed', value: jobStatus.completed || 0 },
    { name: 'Pending', value: jobStatus.pending || 0 },
    { name: 'Cancelled', value: jobStatus.cancelled || 0 }
  ].filter(d => d.value > 0) : [];

  // Default display if no jobs are available
  const hasPieData = pieData.length > 0;
  const displayPieData = hasPieData ? pieData : [{ name: 'No Jobs', value: 1 }];
  const displayColors = hasPieData ? COLORS : ['#E2E8F0'];

  const getPercent = (value, total) => {
    if (!total) return '0%';
    return `${Math.round((value / total) * 100)}%`;
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Reports</h1>
          <p className="text-sm text-gray-500 font-semibold mt-1">View detailed insights and performance reports.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleExportExcel}
            className="flex-1 sm:flex-initial h-10 px-4 border border-green-200 hover:border-green-500 bg-white hover:bg-green-50 text-green-700 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <FiFileText className="w-4 h-4 text-green-600" />
            Export Excel
          </button>
          
          <button
            onClick={handleExportPdf}
            className="flex-1 sm:flex-initial h-10 px-4 border border-red-200 hover:border-red-500 bg-white hover:bg-red-50 text-red-700 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <FiDownload className="w-4 h-4 text-red-600" />
            Export PDF
          </button>
        </div>
      </div>

      {/* 2. Filters Row */}
      <div className="bg-white rounded-3xl border border-[#E6F4F2] p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          
          {/* Date Picker trigger */}
          <div className="relative">
            <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">Date Range</label>
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="w-full h-10 px-3 bg-white border border-gray-200 hover:border-[#10AFA5]/40 text-xs font-bold text-gray-600 rounded-xl transition-all flex items-center justify-between"
            >
              <span className="flex items-center gap-2 truncate">
                <FiCalendar className="w-4 h-4 text-[#10AFA5] shrink-0" />
                {datePreset === 'all' && 'All Time'}
                {datePreset === 'month' && 'This Month'}
                {datePreset === 'quarter' && 'Last 3 Months'}
                {datePreset === 'custom' && `${startDate || 'Start'} to ${endDate || 'End'}`}
              </span>
            </button>

            {showDatePicker && (
              <div className="absolute left-0 mt-2 bg-white rounded-2xl border border-[#E6F4F2] p-4 shadow-xl z-20 w-72 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setDatePreset('all')} className={`py-1.5 px-3 text-xs rounded-lg font-bold border transition-all ${datePreset === 'all' ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>All Time</button>
                  <button onClick={() => setDatePreset('month')} className={`py-1.5 px-3 text-xs rounded-lg font-bold border transition-all ${datePreset === 'month' ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>This Month</button>
                  <button onClick={() => setDatePreset('quarter')} className={`py-1.5 px-3 text-xs rounded-lg font-bold border transition-all ${datePreset === 'quarter' ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>Last 3 M</button>
                  <button onClick={() => setDatePreset('custom')} className={`py-1.5 px-3 text-xs rounded-lg font-bold border transition-all ${datePreset === 'custom' ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>Custom Range</button>
                </div>

                {datePreset === 'custom' && (
                  <div className="space-y-3 pt-2 border-t border-gray-50">
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">From Date</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full h-9 px-3 border border-gray-200 text-xs rounded-lg outline-none focus:ring-1 focus:ring-[#10AFA5] text-gray-700 font-semibold" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">To Date</label>
                      <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full h-9 px-3 border border-gray-200 text-xs rounded-lg outline-none focus:ring-1 focus:ring-[#10AFA5] text-gray-700 font-semibold" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Service Dropdown */}
          <div>
            <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">Service</label>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-gray-200 hover:border-[#10AFA5]/40 text-xs font-bold text-gray-600 rounded-xl outline-none focus:ring-1 focus:ring-[#10AFA5] transition-all"
            >
              <option value="">All Services</option>
              {serviceOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Engineer Dropdown */}
          <div>
            <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">Engineer</label>
            <select
              value={engineer}
              onChange={(e) => setEngineer(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-gray-200 hover:border-[#10AFA5]/40 text-xs font-bold text-gray-600 rounded-xl outline-none focus:ring-1 focus:ring-[#10AFA5] transition-all"
            >
              <option value="">All Engineers</option>
              {engineersList?.map((eng) => (
                <option key={eng._id} value={eng._id}>{eng.name}</option>
              ))}
            </select>
          </div>

          {/* City Dropdown */}
          <div>
            <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">City</label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-gray-200 hover:border-[#10AFA5]/40 text-xs font-bold text-gray-600 rounded-xl outline-none focus:ring-1 focus:ring-[#10AFA5] transition-all"
            >
              <option value="">All Cities</option>
              {cities.map((c, idx) => (
                <option key={idx} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Status Dropdown */}
          <div>
            <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-gray-200 hover:border-[#10AFA5]/40 text-xs font-bold text-gray-600 rounded-xl outline-none focus:ring-1 focus:ring-[#10AFA5] transition-all"
            >
              <option value="">All Status</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{String(s).replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Buttons */}
        <div className="flex justify-end items-center gap-3 pt-2 border-t border-gray-50">
          <button
            onClick={handleResetFilters}
            className="h-10 px-6 border border-gray-200 hover:border-gray-300 text-xs font-bold text-gray-600 rounded-xl transition-all"
          >
            Reset
          </button>
          
          <button
            onClick={handleApplyFilters}
            className="h-10 px-6 bg-[#10AFA5] hover:bg-[#0E9B92] text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2"
          >
            <FiFilter className="w-4 h-4" />
            Apply Filters
          </button>
        </div>
      </div>

      {/* 3. Summary Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        
        {/* Card 1: Total Jobs */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-4 shadow-sm">
          <div className="h-9 w-9 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shrink-0 border border-purple-100">
            <FiActivity className="w-4 h-4" />
          </div>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-3">Total Jobs</p>
          <h3 className="text-xl font-black text-gray-800 mt-1">
            {loadingSummary ? <FiLoader className="w-4 h-4 animate-spin text-[#10AFA5]" /> : summary?.totalJobs?.value || 0}
          </h3>
          <p className={`text-[10px] font-bold mt-1.5 ${summary?.totalJobs?.changeText?.includes('↑') ? 'text-green-600' : 'text-red-500'}`}>
            {summary?.totalJobs?.changeText || 'No change vs Last Month'}
          </p>
        </div>

        {/* Card 2: Completed Jobs */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-4 shadow-sm">
          <div className="h-9 w-9 bg-green-50 text-green-600 rounded-xl flex items-center justify-center shrink-0 border border-green-100">
            <FiCheckCircle className="w-4 h-4" />
          </div>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-3">Completed Jobs</p>
          <h3 className="text-xl font-black text-gray-800 mt-1">
            {loadingSummary ? <FiLoader className="w-4 h-4 animate-spin text-[#10AFA5]" /> : summary?.completedJobs?.value || 0}
          </h3>
          <p className={`text-[10px] font-bold mt-1.5 ${summary?.completedJobs?.changeText?.includes('↑') ? 'text-green-600' : 'text-red-500'}`}>
            {summary?.completedJobs?.changeText || 'No change vs Last Month'}
          </p>
        </div>

        {/* Card 3: Pending Jobs */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-4 shadow-sm">
          <div className="h-9 w-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0 border border-amber-100">
            <FiClock className="w-4 h-4" />
          </div>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-3">Pending Jobs</p>
          <h3 className="text-xl font-black text-gray-800 mt-1">
            {loadingSummary ? <FiLoader className="w-4 h-4 animate-spin text-[#10AFA5]" /> : summary?.pendingJobs?.value || 0}
          </h3>
          <p className={`text-[10px] font-bold mt-1.5 ${summary?.pendingJobs?.changeText?.includes('↑') ? 'text-green-600' : 'text-red-500'}`}>
            {summary?.pendingJobs?.changeText || 'No change vs Last Month'}
          </p>
        </div>

        {/* Card 4: Cancelled Jobs */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-4 shadow-sm">
          <div className="h-9 w-9 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shrink-0 border border-red-100">
            <FiCalendar className="w-4 h-4" />
          </div>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-3">Cancelled Jobs</p>
          <h3 className="text-xl font-black text-gray-800 mt-1">
            {loadingSummary ? <FiLoader className="w-4 h-4 animate-spin text-[#10AFA5]" /> : summary?.cancelledJobs?.value || 0}
          </h3>
          <p className={`text-[10px] font-bold mt-1.5 ${summary?.cancelledJobs?.changeText?.includes('↑') ? 'text-green-600' : 'text-red-500'}`}>
            {summary?.cancelledJobs?.changeText || 'No change vs Last Month'}
          </p>
        </div>

        {/* Card 5: Total Spend */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-4 shadow-sm">
          <div className="h-9 w-9 bg-teal-50 text-[#10AFA5] rounded-xl flex items-center justify-center shrink-0 border border-[#10AFA5]/10">
            <FiFileText className="w-4 h-4" />
          </div>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-3">Total Spend</p>
          <h3 className="text-xl font-black text-gray-800 mt-1 truncate" title={`₹${summary?.totalSpend?.value?.toLocaleString('en-IN') || 0}`}>
            {loadingSummary ? <FiLoader className="w-4 h-4 animate-spin text-[#10AFA5]" /> : `₹${(summary?.totalSpend?.value || 0).toLocaleString('en-IN')}`}
          </h3>
          <p className={`text-[10px] font-bold mt-1.5 ${summary?.totalSpend?.changeText?.includes('↑') ? 'text-green-600' : 'text-red-500'}`}>
            {summary?.totalSpend?.changeText || 'No change vs Last Month'}
          </p>
        </div>

        {/* Card 6: Average Rating */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-4 shadow-sm">
          <div className="h-9 w-9 bg-yellow-50 text-yellow-500 rounded-xl flex items-center justify-center shrink-0 border border-yellow-100">
            <FiStar className="w-4 h-4" />
          </div>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-3">Avg. Rating</p>
          <h3 className="text-xl font-black text-gray-800 mt-1">
            {loadingSummary ? <FiLoader className="w-4 h-4 animate-spin text-[#10AFA5]" /> : `${summary?.averageRating?.value != null ? summary.averageRating.value : '—'} / 5`}
          </h3>
          <p className={`text-[10px] font-bold mt-1.5 ${summary?.averageRating?.changeText?.includes('↑') ? 'text-green-600' : 'text-red-500'}`}>
            {summary?.averageRating?.changeText || 'No change vs Last Month'}
          </p>
        </div>
      </div>

      {/* 4. Tables Grid Section (Service & Engineer Performance) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left: Service Performance */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="border-b border-gray-50 pb-3 mb-4">
              <h3 className="text-sm font-black text-gray-900">Service Performance</h3>
              <p className="text-[10px] text-gray-400 font-bold mt-0.5">Performance summary by services</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-50 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Service Name</th>
                    <th className="py-2.5 px-3 text-center">Total Jobs</th>
                    <th className="py-2.5 px-3 text-center">Completed</th>
                    <th className="py-2.5 px-3 text-center">Pending</th>
                    <th className="py-2.5 px-3">Completion Rate</th>
                    <th className="py-2.5 px-3 text-right">Avg. Completion Time</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingServices ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50 animate-pulse">
                        <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-28"></div></td>
                        <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-8 mx-auto"></div></td>
                        <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-8 mx-auto"></div></td>
                        <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-8 mx-auto"></div></td>
                        <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-16"></div></td>
                        <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-16 ml-auto"></div></td>
                      </tr>
                    ))
                  ) : servicesError ? (
                    <tr>
                      <td colSpan="6" className="py-6 text-center text-red-500 font-bold">Failed to load services</td>
                    </tr>
                  ) : !services || services.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-gray-400 font-bold">No service data matching filters</td>
                    </tr>
                  ) : (
                    services.slice(0, 5).map((s, idx) => {
                      const rateVal = parseInt(s.completionRate) || 0;
                      return (
                        <tr key={idx} className="border-b border-gray-50 text-gray-700 font-semibold hover:bg-[#F0FDFA]/10">
                          <td className="py-3 px-3 text-gray-900 font-bold">{s.serviceName}</td>
                          <td className="py-3 px-3 text-center">{s.totalJobs}</td>
                          <td className="py-3 px-3 text-center">{s.completed}</td>
                          <td className="py-3 px-3 text-center">{s.pending}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span className="w-8">{s.completionRate}</span>
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
                                <div 
                                  className="h-full bg-[#10AFA5] rounded-full" 
                                  style={{ width: `${rateVal}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right text-gray-500">{s.averageCompletionTime}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          <button 
            type="button" 
            onClick={() => toast.success('Operational details generated in PDF export!')}
            className="text-[11px] text-[#10AFA5] font-black hover:underline mt-4 text-center block w-full self-center border-t border-gray-50 pt-3"
          >
            View Full Report
          </button>
        </div>

        {/* Right: Engineer Performance */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="border-b border-gray-50 pb-3 mb-4">
              <h3 className="text-sm font-black text-gray-900">Engineer Performance</h3>
              <p className="text-[10px] text-gray-400 font-bold mt-0.5">Performance summary by engineers</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-50 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Engineer Name</th>
                    <th className="py-2.5 px-3 text-center">Assigned Jobs</th>
                    <th className="py-2.5 px-3 text-center">Completed Jobs</th>
                    <th className="py-2.5 px-3 text-center">Active Jobs</th>
                    <th className="py-2.5 px-3 text-right">Avg. Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEngineers ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50 animate-pulse">
                        <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-28"></div></td>
                        <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-8 mx-auto"></div></td>
                        <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-8 mx-auto"></div></td>
                        <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-8 mx-auto"></div></td>
                        <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-10 ml-auto"></div></td>
                      </tr>
                    ))
                  ) : engineersError ? (
                    <tr>
                      <td colSpan="5" className="py-6 text-center text-red-500 font-bold">Failed to load engineers</td>
                    </tr>
                  ) : !engineers || engineers.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-gray-400 font-bold">No active engineers in this period</td>
                    </tr>
                  ) : (
                    engineers.slice(0, 5).map((e, idx) => (
                      <tr key={idx} className="border-b border-gray-50 text-gray-700 font-semibold hover:bg-[#F0FDFA]/10">
                        <td className="py-3 px-3 flex items-center gap-2">
                          <img 
                            src={e.profilePhoto || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=32&h=32&q=80'} 
                            alt={e.engineerName} 
                            className="w-6 h-6 rounded-full object-cover shrink-0 bg-gray-100"
                          />
                          <span className="text-gray-900 font-bold">{e.engineerName}</span>
                        </td>
                        <td className="py-3 px-3 text-center">{e.assignedJobs}</td>
                        <td className="py-3 px-3 text-center">{e.completedJobs}</td>
                        <td className="py-3 px-3 text-center">{e.activeJobs}</td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1 font-bold text-yellow-600">
                            <FiStar className="w-3.5 h-3.5 fill-current text-yellow-500" />
                            <span>{e.averageRating.toFixed(1)}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <button 
            type="button" 
            onClick={() => toast.success('Engineer stats generated in Excel workbook!')}
            className="text-[11px] text-[#10AFA5] font-black hover:underline mt-4 text-center block w-full self-center border-t border-gray-50 pt-3"
          >
            View Full Report
          </button>
        </div>

      </div>

      {/* 5. Bottom Section: Expense Summary & Job Status Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Expense Summary Grid (Takes 2 columns space) */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-5 shadow-sm lg:col-span-2 space-y-6">
          <div>
            <h3 className="text-sm font-black text-gray-900">Expense Summary</h3>
            <p className="text-[10px] text-gray-400 font-bold mt-0.5">Financial overview for the selected period</p>
          </div>

          {/* Wallet Cards row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Recharge */}
            <div className="bg-[#F8FAFC] border border-gray-100 rounded-2xl p-4">
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Total Recharge</span>
              <h4 className="text-sm font-black text-gray-800 mt-1 truncate">
                {loadingExpenses ? '...' : `₹${(expenses?.totalWalletRecharge || 0).toLocaleString('en-IN')}`}
              </h4>
            </div>

            {/* Used */}
            <div className="bg-[#F8FAFC] border border-gray-100 rounded-2xl p-4">
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Amount Used</span>
              <h4 className="text-sm font-black text-gray-800 mt-1 truncate">
                {loadingExpenses ? '...' : `₹${(expenses?.totalAmountUsed || 0).toLocaleString('en-IN')}`}
              </h4>
            </div>

            {/* Remaining */}
            <div className="bg-[#F8FAFC] border border-gray-100 rounded-2xl p-4">
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Remaining Balance</span>
              <h4 className="text-sm font-black text-[#10AFA5] mt-1 truncate">
                {loadingExpenses ? '...' : `₹${(expenses?.totalRemainingWallet || 0).toLocaleString('en-IN')}`}
              </h4>
            </div>

            {/* Invoiced */}
            <div className="bg-[#F8FAFC] border border-gray-100 rounded-2xl p-4">
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Invoice Amount</span>
              <h4 className="text-sm font-black text-purple-700 mt-1 truncate">
                {loadingExpenses ? '...' : `₹${(expenses?.totalInvoiceAmount || 0).toLocaleString('en-IN')}`}
              </h4>
            </div>
          </div>

          {/* Monthly line graph */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-gray-700">Monthly Expense Trend</span>
              <span className="flex items-center gap-1.5 text-[10px] text-gray-500 font-semibold">
                <span className="h-1.5 w-4 bg-[#10AFA5] rounded-full" />
                Amount Used (₹)
              </span>
            </div>

            <div className="h-[180px] w-full pt-2">
              {loadingExpenses ? (
                <div className="h-full w-full bg-slate-50 animate-pulse rounded-2xl flex items-center justify-center text-xs text-gray-400 font-bold">
                  Loading trend chart...
                </div>
              ) : expensesError ? (
                <div className="h-full w-full bg-red-50 text-red-500 rounded-2xl flex items-center justify-center text-xs font-bold">
                  Failed to load chart
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={expenses?.monthlyExpenseTrend || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis 
                      dataKey="month" 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fontSize: 9, fill: '#64748B', fontWeight: 600 }} 
                    />
                    <YAxis 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(v) => `₹${v >= 100000 ? `${(v/100000).toFixed(1)}L` : v}`}
                      tick={{ fontSize: 9, fill: '#64748B', fontWeight: 600 }} 
                    />
                    <RechartsTooltip 
                      formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Amount Used']}
                      contentStyle={{ fontSize: '10px', borderRadius: '12px', border: '1px solid #E6F4F2', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#10AFA5" 
                      strokeWidth={3} 
                      dot={{ r: 4, strokeWidth: 1, fill: '#fff' }} 
                      activeDot={{ r: 6 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Right: Job Status Pie Chart (Takes 1 column space) */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-gray-900">Job Status Distribution</h3>
            <p className="text-[10px] text-gray-400 font-bold mt-0.5">Overview of jobs by status</p>
          </div>

          <div className="flex flex-col items-center justify-center py-4 relative">
            <div className="h-[160px] w-[160px] relative">
              {loadingJobStatus ? (
                <div className="h-full w-full bg-slate-50 animate-pulse rounded-full flex items-center justify-center text-xs text-gray-400 font-bold">
                  Loading...
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={displayPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={hasPieData ? 4 : 0}
                        dataKey="value"
                      >
                        {displayPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={displayColors[index % displayColors.length]} />
                        ))}
                      </Pie>
                      {hasPieData && (
                        <RechartsTooltip 
                          formatter={(value, name) => [value, name]}
                          contentStyle={{ fontSize: '10px', borderRadius: '8px' }}
                        />
                      )}
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center select-none pointer-events-none">
                    <span className="text-xl font-black text-gray-800">{jobStatus?.totalJobs || 0}</span>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Total Jobs</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Legend and stats */}
          <div className="space-y-2.5 border-t border-gray-50 pt-4">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="flex items-center gap-2 text-gray-700">
                <span className="h-2 w-2 rounded-full bg-[#10AFA5]" />
                Completed
              </span>
              <span className="text-gray-900">
                {jobStatus?.completed || 0} ({getPercent(jobStatus?.completed, jobStatus?.totalJobs)})
              </span>
            </div>

            <div className="flex justify-between items-center text-xs font-bold">
              <span className="flex items-center gap-2 text-gray-700">
                <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                Pending
              </span>
              <span className="text-gray-900">
                {jobStatus?.pending || 0} ({getPercent(jobStatus?.pending, jobStatus?.totalJobs)})
              </span>
            </div>

            <div className="flex justify-between items-center text-xs font-bold">
              <span className="flex items-center gap-2 text-gray-700">
                <span className="h-2 w-2 rounded-full bg-[#EF4444]" />
                Cancelled
              </span>
              <span className="text-gray-900">
                {jobStatus?.cancelled || 0} ({getPercent(jobStatus?.cancelled, jobStatus?.totalJobs)})
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Global alert block in case of global database load errors */}
      {(summaryError || servicesError || engineersError || expensesError || jobStatusError) && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-red-700 text-xs font-bold">
            <FiAlertCircle className="w-5 h-5 shrink-0" />
            <p>Some reports failed to load due to connection latency. You can retry refreshing the dashboard widgets.</p>
          </div>
          <button
            onClick={handleRetryAll}
            className="w-full sm:w-auto h-9 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <FiRefreshCw className="w-4 h-4" />
            Retry Widgets
          </button>
        </div>
      )}

    </div>
  );
};

export default Reports;
