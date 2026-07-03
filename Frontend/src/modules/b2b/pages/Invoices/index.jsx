import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  FiFileText, FiDownload, FiCheckCircle, FiClock, FiCalendar, 
  FiEye, FiFilter, FiSearch, FiX, FiPrinter, FiLoader, FiAlertCircle 
} from 'react-icons/fi';
import api from '../../../../services/api';
import toast from 'react-hot-toast';

// Debounce helper custom hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const Invoices = () => {
  // Filter and pagination states
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [status, setStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(8);

  // Date range picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateRangePreset, setDateRangePreset] = useState('all'); // all, month, quarter, custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Selected date ranges for API query
  const [queryStartDate, setQueryStartDate] = useState('');
  const [queryEndDate, setQueryEndDate] = useState('');

  // Selected invoice state for drawer
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // 1. Fetch Invoice Summary Stats
  const { data: summary, isLoading: loadingSummary, error: summaryError } = useQuery({
    queryKey: ['b2bInvoicesSummary'],
    queryFn: async () => {
      const res = await api.get('/b2b/invoices/summary');
      return res.data.data;
    }
  });

  // 2. Fetch Invoices List (Server-side paginated and filtered)
  const { data: listData, isLoading: loadingList, error: listError, refetch: refetchList } = useQuery({
    queryKey: ['b2bInvoicesList', currentPage, status, queryStartDate, queryEndDate, debouncedSearch],
    queryFn: async () => {
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        search: debouncedSearch,
        status,
        startDate: queryStartDate,
        endDate: queryEndDate
      };
      const res = await api.get('/b2b/invoices', { params });
      return res.data;
    },
    keepPreviousData: true
  });

  // 3. Fetch Single Invoice Details (Fetched only when details drawer opens)
  const { data: invoiceDetails, isLoading: loadingDetails, error: detailsError } = useQuery({
    queryKey: ['b2bInvoiceDetails', selectedInvoiceId],
    queryFn: async () => {
      if (!selectedInvoiceId) return null;
      const res = await api.get(`/b2b/invoices/${selectedInvoiceId}`);
      return res.data.data;
    },
    enabled: !!selectedInvoiceId
  });

  // Trigger list reload when custom date filters align
  useEffect(() => {
    if (dateRangePreset !== 'custom') {
      const today = new Date();
      if (dateRangePreset === 'all') {
        setQueryStartDate('');
        setQueryEndDate('');
      } else if (dateRangePreset === 'month') {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        setQueryStartDate(start.toISOString().split('T')[0]);
        setQueryEndDate(today.toISOString().split('T')[0]);
      } else if (dateRangePreset === 'quarter') {
        const start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
        setQueryStartDate(start.toISOString().split('T')[0]);
        setQueryEndDate(today.toISOString().split('T')[0]);
      }
      setCurrentPage(1);
    }
  }, [dateRangePreset]);

  // Apply custom dates
  const handleApplyCustomDates = () => {
    if (!customStartDate || !customEndDate) {
      toast.error('Please select both start and end dates');
      return;
    }
    setQueryStartDate(customStartDate);
    setQueryEndDate(customEndDate);
    setShowDatePicker(false);
    setCurrentPage(1);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearch('');
    setStatus('');
    setDateRangePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setQueryStartDate('');
    setQueryEndDate('');
    setCurrentPage(1);
  };

  // Open details drawer
  const handleOpenDrawer = (invoiceId) => {
    setSelectedInvoiceId(invoiceId);
    setShowDrawer(true);
  };

  // Close details drawer
  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setSelectedInvoiceId(null);
  };

  // Download Invoice PDF via authenticated backend streaming
  const handleDownloadPdf = async (id, invoiceNo) => {
    setDownloadingPdf(true);
    const toastId = toast.loading('Downloading invoice PDF...');
    try {
      const response = await api.get(`/b2b/invoices/${id}/download`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${invoiceNo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('Downloaded successfully!', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Failed to download invoice PDF', { id: toastId });
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Export invoices list as CSV
  const handleExportCsv = async () => {
    const toastId = toast.loading('Exporting invoices as CSV...');
    try {
      const params = {
        search: debouncedSearch,
        status,
        startDate: queryStartDate,
        endDate: queryEndDate
      };
      const response = await api.get('/b2b/invoices/export', {
        params,
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoices-export-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('Invoices exported successfully!', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Failed to export invoices', { id: toastId });
    }
  };

  // Print Invoice via popout styling window (exact copy of details drawer content)
  const handlePrintInvoice = () => {
    if (!invoiceDetails) return;
    const printWindow = window.open('', '_blank');
    
    let billingPeriodStr = invoiceDetails.billingPeriod || '';
    if (!billingPeriodStr && invoiceDetails.billingPeriodStart && invoiceDetails.billingPeriodEnd) {
      const startStr = new Date(invoiceDetails.billingPeriodStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const endStr = new Date(invoiceDetails.billingPeriodEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      billingPeriodStr = `${startStr} - ${endStr}`;
    }

    const printHtml = `
      <html>
        <head>
          <title>Print Invoice - ${invoiceDetails.invoiceNumber}</title>
          <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; }
            .brand-color { color: #10AFA5; }
            .divider { border-bottom: 1px solid #e2e8f0; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="max-w-4xl mx-auto space-y-8">
            <!-- Header -->
            <div class="flex justify-between items-start">
              <div>
                <h1 class="text-3xl font-black brand-color">WBI</h1>
                <p class="text-xs font-bold text-gray-400 mt-1">B2B SERVICE PLATFORM</p>
                <p class="text-xs text-gray-500 mt-2">WBI Tech Services Private Limited</p>
                <p class="text-xs text-gray-500">GSTIN: 27WBITECH5678A1Z</p>
              </div>
              <div class="text-right">
                <h2 class="text-xl font-bold text-gray-800">TAX INVOICE</h2>
                <div class="text-xs space-y-1 mt-2 text-gray-600">
                  <p><span class="font-semibold">Invoice No:</span> ${invoiceDetails.invoiceNumber}</p>
                  <p><span class="font-semibold">Invoice Date:</span> ${new Date(invoiceDetails.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  <p><span class="font-semibold">Billing Period:</span> ${billingPeriodStr}</p>
                  <p><span class="font-semibold">Status:</span> <span class="font-bold text-green-600">${(invoiceDetails.status || 'generated').toUpperCase()}</span></p>
                </div>
              </div>
            </div>

            <div class="divider"></div>

            <!-- Addresses -->
            <div class="grid grid-cols-2 gap-8">
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Billed To</h3>
                <p class="text-sm font-bold text-gray-800">${invoiceDetails.companySnapshot?.companyName || 'N/A'}</p>
                <p class="text-xs text-gray-600 mt-1"><span class="font-semibold">GSTIN:</span> ${invoiceDetails.companySnapshot?.gstNumber || 'N/A'}</p>
                <p class="text-xs text-gray-600"><span class="font-semibold">Email:</span> ${invoiceDetails.companySnapshot?.email || 'N/A'}</p>
                <p class="text-xs text-gray-600"><span class="font-semibold">Phone:</span> ${invoiceDetails.companySnapshot?.phone || 'N/A'}</p>
                <p class="text-xs text-gray-600 mt-1 leading-relaxed"><span class="font-semibold">Address:</span> ${invoiceDetails.companySnapshot?.billingAddress || 'N/A'}</p>
              </div>
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Billed By</h3>
                <p class="text-sm font-bold text-gray-800">WBI Office</p>
                <p class="text-xs text-gray-600 mt-1">Powai Hiranandani, Mumbai, MH - 400076</p>
                <p class="text-xs text-gray-600">Email: billing@wbi.in</p>
                <p class="text-xs text-gray-600">Phone: +91 22 4567 8900</p>
              </div>
            </div>

            <div class="divider"></div>

            <!-- Table -->
            <table class="w-full text-left text-sm border-collapse">
              <thead>
                <tr class="bg-gray-50 border-b border-gray-200">
                  <th class="py-3 px-4 font-bold text-gray-700">Description</th>
                  <th class="py-3 px-4 font-bold text-gray-700 text-center">Total Jobs</th>
                  <th class="py-3 px-4 font-bold text-gray-700 text-right">Per Job Rate</th>
                  <th class="py-3 px-4 font-bold text-gray-700 text-right">Platform Fee</th>
                  <th class="py-3 px-4 font-bold text-gray-700 text-right">Total Payable</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-100">
                  <td class="py-4 px-4 text-gray-800">B2B Consolidated Service execution for the period: ${billingPeriodStr}</td>
                  <td class="py-4 px-4 text-center text-gray-800">${invoiceDetails.totalJobs || 0}</td>
                  <td class="py-4 px-4 text-right text-gray-800">₹${(invoiceDetails.perJobCharge || 0).toLocaleString('en-IN')}</td>
                  <td class="py-4 px-4 text-right text-gray-800">₹${(invoiceDetails.platformFee || 0).toLocaleString('en-IN')}</td>
                  <td class="py-4 px-4 text-right text-gray-800">₹${(invoiceDetails.totalAmount || 0).toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>

            <!-- Subtotals -->
            <div class="flex justify-end mt-6">
              <div class="w-80 space-y-2 text-sm text-gray-700">
                <div class="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹${(invoiceDetails.subtotal || 0).toLocaleString('en-IN')}</span>
                </div>
                <div class="flex justify-between">
                  <span>GST (${invoiceDetails.gstPercent || 18}%):</span>
                  <span>₹${(invoiceDetails.gstAmount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div class="flex justify-between border-t border-gray-200 pt-2 font-bold text-lg text-gray-900">
                  <span>Total Amount Payable:</span>
                  <span class="brand-color">₹${(invoiceDetails.totalAmount || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            <div class="divider"></div>

            <!-- Payment details -->
            <div class="bg-gray-50 rounded-2xl p-6">
              <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Payment Summary</h3>
              <div class="grid grid-cols-2 gap-4 text-xs">
                <p><span class="font-semibold text-gray-500">Payment Status:</span> <span class="font-bold text-green-600">${(invoiceDetails.paymentStatus || 'unpaid').toUpperCase()}</span></p>
                <p><span class="font-semibold text-gray-500">Payment Date:</span> ${invoiceDetails.paymentDate ? new Date(invoiceDetails.paymentDate).toLocaleDateString('en-IN') : 'N/A'}</p>
                <p><span class="font-semibold text-gray-500">Transaction ID:</span> ${invoiceDetails.transactionId || 'N/A'}</p>
                <p><span class="font-semibold text-gray-500">Payment Method:</span> ${invoiceDetails.paymentMethod || 'N/A'}</p>
              </div>
            </div>

            <!-- Footer -->
            <p class="text-center text-xs text-gray-400 mt-12 italic">Thank you for partnering with WBI! This is a system-generated document and requires no physical signature.</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(printHtml);
    printWindow.document.close();
  };

  // Format date helper
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Invoices</h1>
          <p className="text-sm text-gray-500 font-semibold mt-1">View and manage all your invoices and billing history.</p>
        </div>
      </div>

      {/* 2. Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Invoices */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
          <div className="h-12 w-12 bg-[#F0FDFA] rounded-2xl flex items-center justify-center text-[#10AFA5] border border-[#10AFA5]/10 shrink-0">
            <FiFileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Invoices</p>
            <h3 className="text-2xl font-black text-gray-800 mt-1">
              {loadingSummary ? <FiLoader className="w-5 h-5 animate-spin text-[#10AFA5]" /> : summary?.totalCount || 0}
            </h3>
            <p className="text-[10px] text-gray-400 font-bold mt-0.5">All Time</p>
          </div>
        </div>

        {/* Paid Invoices */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
          <div className="h-12 w-12 bg-[#ECFDF5] rounded-2xl flex items-center justify-center text-[#10B981] border border-[#10B981]/10 shrink-0">
            <FiCheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Paid</p>
            <h3 className="text-2xl font-black text-gray-800 mt-1">
              {loadingSummary ? <FiLoader className="w-5 h-5 animate-spin text-[#10AFA5]" /> : summary?.paidCount || 0}
            </h3>
            <p className="text-[10px] text-gray-500 font-bold mt-0.5">
              ₹{loadingSummary ? '...' : (summary?.paidSum || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Pending Invoices */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
          <div className="h-12 w-12 bg-[#FFFBEB] rounded-2xl flex items-center justify-center text-[#F59E0B] border border-[#F59E0B]/10 shrink-0">
            <FiClock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Pending</p>
            <h3 className="text-2xl font-black text-gray-800 mt-1">
              {loadingSummary ? <FiLoader className="w-5 h-5 animate-spin text-[#10AFA5]" /> : summary?.pendingCount || 0}
            </h3>
            <p className="text-[10px] text-amber-600 font-bold mt-0.5">
              ₹{loadingSummary ? '...' : (summary?.pendingSum || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Overdue Invoices */}
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
          <div className="h-12 w-12 bg-[#FEF2F2] rounded-2xl flex items-center justify-center text-[#EF4444] border border-[#EF4444]/10 shrink-0">
            <FiCalendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Overdue</p>
            <h3 className="text-2xl font-black text-gray-800 mt-1">
              {loadingSummary ? <FiLoader className="w-5 h-5 animate-spin text-[#10AFA5]" /> : summary?.overdueCount || 0}
            </h3>
            <p className="text-[10px] text-red-500 font-bold mt-0.5">
              ₹{loadingSummary ? '...' : (summary?.overdueSum || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Filters Toolbar */}
      <div className="bg-white rounded-3xl border border-[#E6F4F2] p-5 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between">
        
        {/* Left Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Date range dropdown selector */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="h-10 px-4 bg-white border border-gray-200 hover:border-[#10AFA5]/40 text-sm font-bold text-gray-600 rounded-xl transition-all flex items-center gap-2 select-none"
            >
              <FiCalendar className="w-4 h-4 text-[#10AFA5]" />
              {dateRangePreset === 'all' && 'All Time'}
              {dateRangePreset === 'month' && 'This Month'}
              {dateRangePreset === 'quarter' && 'Last 3 Months'}
              {dateRangePreset === 'custom' && `${customStartDate || 'Start'} to ${customEndDate || 'End'}`}
            </button>

            {showDatePicker && (
              <div className="absolute left-0 mt-2 bg-white rounded-2xl border border-[#E6F4F2] p-4 shadow-xl z-20 w-72 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setDateRangePreset('all')} className={`py-1.5 px-3 text-xs rounded-lg font-bold border transition-all ${dateRangePreset === 'all' ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>All Time</button>
                  <button onClick={() => setDateRangePreset('month')} className={`py-1.5 px-3 text-xs rounded-lg font-bold border transition-all ${dateRangePreset === 'month' ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>This Month</button>
                  <button onClick={() => setDateRangePreset('quarter')} className={`py-1.5 px-3 text-xs rounded-lg font-bold border transition-all ${dateRangePreset === 'quarter' ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>Last 3 M</button>
                  <button onClick={() => setDateRangePreset('custom')} className={`py-1.5 px-3 text-xs rounded-lg font-bold border transition-all ${dateRangePreset === 'custom' ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>Custom Range</button>
                </div>

                {dateRangePreset === 'custom' && (
                  <div className="space-y-3 pt-2 border-t border-gray-50">
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">From Date</label>
                      <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="w-full h-9 px-3 border border-gray-200 text-xs rounded-lg outline-none focus:ring-1 focus:ring-[#10AFA5] focus:border-[#10AFA5] text-gray-700" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">To Date</label>
                      <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="w-full h-9 px-3 border border-gray-200 text-xs rounded-lg outline-none focus:ring-1 focus:ring-[#10AFA5] focus:border-[#10AFA5] text-gray-700" />
                    </div>
                    <button
                      onClick={handleApplyCustomDates}
                      className="w-full h-9 bg-[#10AFA5] hover:bg-[#0E9B92] text-white text-xs font-bold rounded-lg transition-all"
                    >
                      Apply Custom Range
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status Dropdown */}
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setCurrentPage(1); }}
            className="h-10 px-4 bg-white border border-gray-200 hover:border-[#10AFA5]/40 text-sm font-bold text-gray-600 rounded-xl outline-none focus:ring-1 focus:ring-[#10AFA5] focus:border-[#10AFA5] transition-all"
          >
            <option value="">All Status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Reset Filters button */}
          {(status || queryStartDate || search) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-red-500 font-bold hover:underline py-1.5 px-3 rounded-lg hover:bg-red-50"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Right Search & Export */}
        <div className="flex items-center gap-3 w-full lg:w-auto shrink-0">
          <div className="relative w-full lg:w-64">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by invoice no."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full h-10 pl-10 pr-4 bg-white border border-gray-200 hover:border-[#10AFA5]/40 text-sm rounded-xl outline-none focus:ring-1 focus:ring-[#10AFA5] focus:border-[#10AFA5] text-gray-700 transition-all font-semibold"
            />
          </div>
          
          <button
            onClick={handleExportCsv}
            className="h-10 px-4 border border-[#10AFA5]/25 hover:border-[#10AFA5] bg-white hover:bg-[#F0FDFA] text-[#10AFA5] text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <FiDownload className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* 4. Invoice Table */}
      <div className="bg-white rounded-3xl border border-[#E6F4F2] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                <th className="py-4 px-6">Invoice No.</th>
                <th className="py-4 px-6">Date</th>
                <th className="py-4 px-6">Billing Period</th>
                <th className="py-4 px-6 text-center">Total Jobs</th>
                <th className="py-4 px-6 text-right">Amount</th>
                <th className="py-4 px-6 text-right">GST</th>
                <th className="py-4 px-6 text-right">Total Payable</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                // Table skeleton loading states
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50 animate-pulse">
                    <td className="py-4 px-6"><div className="h-4 bg-gray-100 rounded w-24"></div></td>
                    <td className="py-4 px-6"><div className="h-4 bg-gray-100 rounded w-20"></div></td>
                    <td className="py-4 px-6"><div className="h-4 bg-gray-100 rounded w-28"></div></td>
                    <td className="py-4 px-6"><div className="h-4 bg-gray-100 rounded w-10 mx-auto"></div></td>
                    <td className="py-4 px-6"><div className="h-4 bg-gray-100 rounded w-16 ml-auto"></div></td>
                    <td className="py-4 px-6"><div className="h-4 bg-gray-100 rounded w-16 ml-auto"></div></td>
                    <td className="py-4 px-6"><div className="h-4 bg-gray-100 rounded w-20 ml-auto"></div></td>
                    <td className="py-4 px-6"><div className="h-6 bg-gray-100 rounded-full w-16 mx-auto"></div></td>
                    <td className="py-4 px-6"><div className="h-8 bg-gray-100 rounded w-20 mx-auto"></div></td>
                  </tr>
                ))
              ) : listError ? (
                // Error State
                <tr>
                  <td colSpan="9" className="py-12 px-6 text-center text-red-500 font-bold">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FiAlertCircle className="w-8 h-8" />
                      <p>Failed to load invoices list</p>
                      <button onClick={refetchList} className="mt-2 text-xs font-bold text-[#10AFA5] hover:underline bg-[#F0FDFA] py-1.5 px-3 rounded-lg border border-[#10AFA5]/10">Retry Connection</button>
                    </div>
                  </td>
                </tr>
              ) : !listData?.data || listData.data.length === 0 ? (
                // Empty State
                <tr>
                  <td colSpan="9" className="py-20 px-6 text-center text-gray-500 font-bold">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <FiFileText className="w-12 h-12 text-[#10AFA5]/20" />
                      <p className="text-base text-gray-700">No Invoices Found</p>
                      <p className="text-xs text-gray-400 font-semibold max-w-sm">No billing records matched your filters. Check other dates or clear the search criteria.</p>
                      <button onClick={handleResetFilters} className="mt-2 text-xs font-bold text-white bg-[#10AFA5] hover:bg-[#0E9B92] py-2 px-4 rounded-xl transition-all">Reset Filters</button>
                    </div>
                  </td>
                </tr>
              ) : (
                // Dynamic Data rows
                listData.data.map((inv) => {
                  const statusLower = (inv.status || 'generated').toLowerCase();
                  const isPaid = statusLower === 'paid' || statusLower === 'settled';
                  const isPending = statusLower === 'pending' || statusLower === 'generated';
                  const isOverdue = statusLower === 'overdue';

                  let billingPeriodStr = inv.billingPeriod || '';
                  if (!billingPeriodStr && inv.billingPeriodStart && inv.billingPeriodEnd) {
                    const startStr = new Date(inv.billingPeriodStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                    const endStr = new Date(inv.billingPeriodEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                    billingPeriodStr = `${startStr} - ${endStr}`;
                  }

                  return (
                    <tr 
                      key={inv._id}
                      className="border-b border-gray-50 hover:bg-[#F0FDFA]/10 transition-all font-semibold text-gray-700 text-xs"
                    >
                      <td className="py-4 px-6 font-bold text-gray-900">{inv.invoiceNumber}</td>
                      <td className="py-4 px-6 text-gray-500">{formatDate(inv.invoiceDate || inv.createdAt)}</td>
                      <td className="py-4 px-6 text-gray-500">{billingPeriodStr}</td>
                      <td className="py-4 px-6 text-center text-gray-900">{inv.totalJobs || 0}</td>
                      <td className="py-4 px-6 text-right text-gray-800">₹{(inv.subtotal || 0).toLocaleString('en-IN')}</td>
                      <td className="py-4 px-6 text-right text-gray-500">₹{(inv.gstAmount || 0).toLocaleString('en-IN')}</td>
                      <td className="py-4 px-6 text-right text-gray-900 font-bold text-sm">₹{(inv.totalAmount || 0).toLocaleString('en-IN')}</td>
                      <td className="py-4 px-6 text-center">
                        <span className={`inline-block py-1 px-3 text-[10px] font-black rounded-full select-none ${
                          isPaid ? 'bg-green-100 text-green-700' :
                          isPending ? 'bg-amber-100 text-amber-700' :
                          isOverdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {isPaid ? 'Paid' : isPending ? 'Pending' : isOverdue ? 'Overdue' : inv.status}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenDrawer(inv._id)}
                            className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 p-1.5 rounded-xl transition-all"
                            title="View Invoice Details"
                          >
                            <FiEye className="w-4 h-4" />
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(inv._id, inv.invoiceNumber)}
                            className="bg-white hover:bg-[#F0FDFA] border border-[#10AFA5]/20 text-[#10AFA5] p-1.5 rounded-xl transition-all"
                            title="Download PDF Invoice"
                          >
                            <FiDownload className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Pagination Footer */}
        {listData?.pagination && listData.pagination.pages > 1 && (
          <div className="border-t border-gray-50 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-bold text-gray-500 select-none">
            <p>
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, listData.pagination.total)} of {listData.pagination.total} invoices
            </p>
            
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="h-8 w-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white transition-all"
              >
                &lt;
              </button>
              
              {Array.from({ length: listData.pagination.pages }).map((_, idx) => {
                const pageNum = idx + 1;
                const isCurrent = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-8 w-8 rounded-lg border flex items-center justify-center transition-all ${
                      isCurrent ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              
              <button
                disabled={currentPage === listData.pagination.pages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, listData.pagination.pages))}
                className="h-8 w-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white transition-all"
              >
                &gt;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. Invoice Details Drawer (Slide out panel) */}
      {showDrawer && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end transition-all duration-300">
          
          {/* Backdrop Click */}
          <div className="absolute inset-0" onClick={handleCloseDrawer}></div>
          
          {/* Drawer Body */}
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto flex flex-col animate-slide-left z-10">
            
            {/* Header */}
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h2 className="text-base font-black text-gray-900">Invoice Details</h2>
              <button
                onClick={handleCloseDrawer}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-50 transition-all"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {loadingDetails ? (
              // Drawer Loading state
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <FiLoader className="w-8 h-8 animate-spin text-[#10AFA5]" />
                  <p className="text-xs text-gray-400 font-bold">Loading invoice details...</p>
                </div>
              </div>
            ) : detailsError ? (
              // Drawer Error state
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <div className="flex flex-col items-center gap-2 text-red-500 font-bold">
                  <FiAlertCircle className="w-8 h-8" />
                  <p>Failed to load invoice details</p>
                </div>
              </div>
            ) : invoiceDetails ? (
              // Drawer Content
              <div className="flex-1 flex flex-col justify-between" id="invoice-print-area">
                <div className="p-6 space-y-6">
                  
                  {/* Summary Block */}
                  <div className="flex items-center gap-4 bg-gray-50/40 border border-gray-50 rounded-2xl p-4">
                    <div className="h-10 w-10 bg-[#F0FDFA] rounded-xl flex items-center justify-center text-[#10AFA5] shrink-0 border border-[#10AFA5]/10">
                      <FiFileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-gray-900">{invoiceDetails.invoiceNumber}</h3>
                        <span className={`inline-block py-0.5 px-2.5 text-[8px] font-black rounded-full select-none ${
                          (invoiceDetails.status || 'generated').toLowerCase() === 'paid' || (invoiceDetails.status || 'generated').toLowerCase() === 'settled'
                            ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {(invoiceDetails.status || 'generated').toLowerCase() === 'paid' || (invoiceDetails.status || 'generated').toLowerCase() === 'settled' ? 'Paid' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-bold mt-1">
                        Invoice Date: {formatDate(invoiceDetails.invoiceDate)}
                      </p>
                      <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                        Billing Period: {invoiceDetails.billingPeriod || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Company Details */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Company Details</h3>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 text-xs text-gray-600 font-semibold">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Company Name</span>
                        <span className="text-gray-900 font-bold">{invoiceDetails.companySnapshot?.companyName || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">GST Number</span>
                        <span className="text-gray-900 font-bold">{invoiceDetails.companySnapshot?.gstNumber || 'N/A'}</span>
                      </div>
                      <div className="flex flex-col gap-1 border-t border-gray-50 pt-2 mt-2">
                        <span className="text-gray-400">Billing Address</span>
                        <span className="text-gray-800 font-bold leading-relaxed">{invoiceDetails.companySnapshot?.billingAddress || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Billing Summary */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Billing Summary</h3>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 text-xs text-gray-600 font-semibold">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total Jobs Completed</span>
                        <span className="text-gray-900 font-bold">{invoiceDetails.totalJobs || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Per Job Charge</span>
                        <span className="text-gray-900 font-bold">₹{(invoiceDetails.perJobCharge || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Platform Fee</span>
                        <span className="text-gray-900 font-bold">₹{(invoiceDetails.platformFee || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between border-t border-gray-50 pt-2">
                        <span className="text-gray-400">Subtotal</span>
                        <span className="text-gray-900 font-bold">₹{(invoiceDetails.subtotal || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">GST ({invoiceDetails.gstPercent || 18}%)</span>
                        <span className="text-gray-900 font-bold">₹{(invoiceDetails.gstAmount || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between border-t border-gray-200 pt-2.5 text-sm text-gray-900 font-black">
                        <span>Total Amount</span>
                        <span className="text-[#10AFA5]">₹{(invoiceDetails.totalAmount || 0).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Information */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Payment Information</h3>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2.5 text-xs text-gray-600 font-semibold">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Payment Status</span>
                        <span className={`font-bold select-none ${
                          (invoiceDetails.paymentStatus || 'unpaid').toLowerCase() === 'paid' ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {(invoiceDetails.paymentStatus || 'unpaid').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Payment Date</span>
                        <span className="text-gray-800 font-bold">
                          {invoiceDetails.paymentDate ? formatDate(invoiceDetails.paymentDate) : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Transaction ID</span>
                        <span className="text-gray-800 font-bold text-right truncate max-w-[200px]" title={invoiceDetails.transactionId}>
                          {invoiceDetails.transactionId || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Payment Method</span>
                        <span className="text-gray-800 font-bold">{invoiceDetails.paymentMethod || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Drawer Footer Buttons */}
                <div className="p-6 border-t border-gray-50 bg-gray-50/20 grid grid-cols-2 gap-3 shrink-0">
                  <button
                    onClick={() => handleDownloadPdf(invoiceDetails._id, invoiceDetails.invoiceNumber)}
                    disabled={downloadingPdf}
                    className="h-11 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <FiDownload className="w-4 h-4" />
                    Download PDF
                  </button>
                  
                  <button
                    onClick={handlePrintInvoice}
                    className="h-11 bg-[#10AFA5] hover:bg-[#0E9B92] text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <FiPrinter className="w-4 h-4" />
                    Print Invoice
                  </button>
                </div>

              </div>
            ) : null}

          </div>

        </div>
      )}

      {/* Global CSS Inject for slide animation */}
      <style>{`
        @keyframes slideLeft {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-left {
          animation: slideLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

    </div>
  );
};

export default Invoices;
