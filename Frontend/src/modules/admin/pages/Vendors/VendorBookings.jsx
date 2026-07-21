import React, { useState, useEffect } from 'react';
import { FiSearch, FiLoader, FiCalendar, FiUser, FiBriefcase, FiX } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import adminVendorService from '../../../../services/adminVendorService';
import { formatCurrency } from '../../utils/adminHelpers';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All status' },
  { value: 'pending', label: 'Pending / awaiting' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed / paid' },
  { value: 'cancelled', label: 'Cancelled / disputed' }
];

const VendorBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [selectedBooking, setSelectedBooking] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadBookings = async (page = 1) => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: pagination.limit,
        status: filterStatus === 'all' ? undefined : filterStatus,
        search: debouncedSearch || undefined
      };
      const response = await adminVendorService.getAllBookings(params);
      if (response.success) {
        setBookings(response.data);
        setPagination(response.pagination);
      }
    } catch (error) {
      console.error('Error loading vendor bookings:', error);
      toast.error('Failed to load vendor bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings(1);
  }, [filterStatus, debouncedSearch]);

  const getStatusStyle = (status) => {
    const s = (status || '').toLowerCase();
    if (['completed', 'closed', 'paid'].includes(s)) return 'bg-green-100 text-green-800';
    if (['cancelled', 'rejected', 'refunded', 'disputed'].includes(s)) return 'bg-red-100 text-red-800';
    if (['in_progress', 'service_started', 'worker_assigned', 'journey_started'].includes(s))
      return 'bg-purple-100 text-purple-800';
    if (['pending', 'requested', 'searching', 'awaiting_payment'].includes(s))
      return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const formatBookingDate = (booking) => {
    const raw = booking.displayDate || booking.scheduledDate || booking.createdAt;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN');
  };

  return (
    <div className="space-y-6">
      <CardShell icon={FiBriefcase}>
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by business name, owner or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <FiLoader className="w-8 h-8 text-gray-400 animate-spin mr-3" />
              <span className="text-gray-600">Loading bookings...</span>
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No bookings found</div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {bookings.map((booking) => (
                <div
                  key={booking._id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow bg-white"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <FiBriefcase className="text-blue-600 w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-bold text-gray-900">
                            {booking.serviceTitle || booking.serviceId?.title || 'Service'}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusStyle(booking.status)}`}
                          >
                            {(booking.status || 'unknown').replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <FiBriefcase className="w-4 h-4" />
                            <span>
                              Vendor:{' '}
                              <span className="font-medium text-gray-800">
                                {booking.vendorId?.businessName || booking.vendorId?.name || 'Unassigned'}
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiUser className="w-4 h-4 text-blue-500" />
                            <span>
                              Customer:{' '}
                              <span className="font-medium text-gray-800">{booking.userId?.name || '—'}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiCalendar className="w-4 h-4" />
                            <span>Scheduled: {formatBookingDate(booking)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiUser className="w-4 h-4 text-green-500" />
                            <span>
                              Worker:{' '}
                              <span className="font-medium text-gray-800">
                                {booking.workerId?.name || 'Pending assignment'}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-lg font-bold text-gray-900">
                        {formatCurrency(booking.finalAmount ?? booking.basePrice)}
                      </div>
                      <button
                        type="button"
                        className="text-sm text-blue-600 font-semibold hover:underline"
                        onClick={() => setSelectedBooking(booking)}
                      >
                        View details
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && pagination.pages > 1 && (
          <div className="flex justify-center mt-8 gap-2 flex-wrap">
            {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => loadBookings(p)}
                className={`w-10 h-10 rounded-lg font-semibold transition-all ${
                  pagination.page === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </CardShell>

      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="font-bold text-lg">Booking details</h2>
              <button type="button" onClick={() => setSelectedBooking(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <dl className="px-6 py-4 space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Booking ID</dt>
                <dd className="font-mono text-xs">{selectedBooking._id}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Booking #</dt>
                <dd className="font-semibold">{selectedBooking.bookingNumber || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className="font-semibold capitalize">{selectedBooking.status?.replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Payment status</dt>
                <dd>{selectedBooking.paymentStatus || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Amount</dt>
                <dd className="font-bold">{formatCurrency(selectedBooking.finalAmount ?? selectedBooking.basePrice)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Address</dt>
                <dd>{selectedBooking.address?.fullAddress || selectedBooking.address?.city || '—'}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorBookings;
