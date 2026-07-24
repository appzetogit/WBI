import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight, FiClock, FiMapPin } from 'react-icons/fi';
import { bookingService } from '../../../../services/bookingService';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const Calendar = () => {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date().getDate());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0, 23, 59, 59);
        const res = await bookingService.getUserBookings({
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          limit: 100
        });
        if (!cancelled && res?.success) {
          setBookings(res.data || []);
        }
      } catch {
        if (!cancelled) setBookings([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = new Date(year, month, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const bookingDays = useMemo(() => {
    const set = new Set();
    bookings.forEach((b) => {
      const d = b.scheduledDate || b.scheduledStartAt || b.createdAt;
      if (!d) return;
      const dt = new Date(d);
      if (dt.getMonth() === month && dt.getFullYear() === year) {
        set.add(dt.getDate());
      }
    });
    return set;
  }, [bookings, month, year]);

  const dayBookings = useMemo(() => {
    return bookings.filter((b) => {
      const d = b.scheduledDate || b.scheduledStartAt || b.createdAt;
      if (!d) return false;
      const dt = new Date(d);
      return dt.getDate() === selectedDate && dt.getMonth() === month && dt.getFullYear() === year;
    });
  }, [bookings, selectedDate, month, year]);

  const monthLabel = cursor.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-brand-bg min-h-screen pb-[env(safe-area-inset-bottom)] pt-4 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 font-poppins">Calendar</h1>
      </div>

      <div className="bg-white rounded-[24px] p-5 shadow-sm mb-6">
        <div className="flex justify-between items-center mb-4">
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
          >
            <FiChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-bold">{monthLabel}</h2>
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
          >
            <FiChevronRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center mb-2">
          {weekDays.map((day) => (
            <div key={day} className="text-xs font-semibold text-gray-400">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-3 gap-x-2 text-center">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`pad-${i}`} className="h-8" />
          ))}
          {days.map((day) => {
            const isSelected = day === selectedDate;
            const hasBooking = bookingDays.has(day);
            return (
              <button
                type="button"
                key={day}
                onClick={() => setSelectedDate(day)}
                className={`
                  relative flex items-center justify-center h-8 rounded-full text-sm font-medium
                  ${isSelected ? 'bg-brand text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}
                `}
              >
                {day}
                {hasBooking && (
                  <span className={`absolute bottom-0 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-brand'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <h3 className="text-lg font-bold text-gray-900 mb-4">
        Appointments on {monthLabel.split(' ')[0]} {selectedDate}
      </h3>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : dayBookings.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-sm text-gray-500">
          No bookings on this day.
          <button
            type="button"
            className="block mx-auto mt-3 text-teal-700 font-semibold"
            onClick={() => navigate('/user/my-bookings')}
          >
            View all bookings
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-24">
          {dayBookings.map((apt) => (
            <button
              type="button"
              key={apt._id}
              onClick={() => navigate(`/user/booking/${apt._id}`)}
              className="bg-white p-4 rounded-2xl shadow-sm text-left"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="text-base font-bold text-gray-900">
                    {apt.serviceName || apt.serviceId?.title || 'Service'}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {apt.workerId?.name || apt.vendorId?.businessName || apt.vendorId?.name || 'Pending assignment'}
                  </p>
                </div>
                <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-teal-50 text-teal-800 capitalize">
                  {apt.status}
                </span>
              </div>
              <div className="flex flex-col gap-1 mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                  <FiClock className="text-brand" /> {apt.scheduledTime || 'Time TBD'}
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                  <FiMapPin className="text-brand" />{' '}
                  {apt.address?.addressLine1 || apt.address?.city || 'Address on file'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Calendar;
