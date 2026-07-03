import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight, FiInfo, FiCalendar, FiClock } from 'react-icons/fi';
import api from '../../../../services/api';
import toast from 'react-hot-toast';

const OneTimeServiceSchedule = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draftId');

  // Loading States
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data States
  const [draft, setDraft] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());

  // Selections
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedSlotId, setSelectedSlotId] = useState(null);

  useEffect(() => {
    if (!draftId) {
      navigate(-1);
      return;
    }
    
    const loadAll = async () => {
      const draftData = await fetchDraft();
      const serviceId = draftData?.serviceId?._id || draftData?.serviceId || '';
      await fetchDates(serviceId);
    };

    loadAll();
  }, [draftId]);

  const fetchDraft = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/booking-draft/${draftId}/review`);
      if (res.data.success) {
        setDraft(res.data.data);
        return res.data.data;
      }
    } catch (err) {
      console.error('Error fetching draft:', err);
    }
    return null;
  };

  const fetchDates = async (serviceId) => {
    try {
      setLoading(true);
      const res = await api.get(`/users/one-time-bookings/available-dates?serviceId=${serviceId}`);
      if (res.data.success) {
        const dates = res.data.data.filter(d => d.isAvailable).map(d => new Date(d.date));
        setAvailableDates(dates);
        
        // Auto-select first date if available
        if (dates.length > 0) {
          handleDateSelect(dates[0], serviceId);
        }
      } else {
        toast.error('Failed to load scheduling dates');
      }
    } catch (error) {
      console.error('Error fetching available dates:', error);
      toast.error('Could not connect to service calendar');
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = async (date, sId = null) => {
    setSelectedDate(date);
    setCurrentMonthDate(date);
    setSelectedTime(null);
    setSelectedSlotId(null);
    
    const activeServiceId = sId || draft?.serviceId?._id || draft?.serviceId || '';
    const city = draft?.address?.city || '';
    const pincode = draft?.address?.pincode || '';
    const dateStr = date.toISOString().split('T')[0];

    setLoadingSlots(true);
    try {
      const res = await api.get(`/users/one-time-bookings/available-slots?date=${dateStr}&serviceId=${activeServiceId}&city=${city}&pincode=${pincode}`);
      if (res.data.success) {
        setTimeSlots(res.data.data);
      }
    } catch (error) {
      console.error('Error fetching slots:', error);
      toast.error('Failed to load available slots');
    } finally {
      setLoadingSlots(false);
    }
  };

  const nextMonth = () => {
    const next = new Date(currentMonthDate);
    next.setMonth(next.getMonth() + 1);
    setCurrentMonthDate(next);
  };

  const prevMonth = () => {
    const prev = new Date(currentMonthDate);
    prev.setMonth(prev.getMonth() - 1);
    setCurrentMonthDate(prev);
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysCount = new Date(year, month + 1, 0).getDate();
    let firstDayIndex = new Date(year, month, 1).getDay();
    
    // Adjust Sunday index
    firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysCount; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  const isDateAvailable = (date) => {
    if (!date) return false;
    return availableDates.some(availDate => 
      availDate.getDate() === date.getDate() &&
      availDate.getMonth() === date.getMonth() &&
      availDate.getFullYear() === date.getFullYear()
    );
  };

  const isDateSelected = (date) => {
    if (!date || !selectedDate) return false;
    return date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear();
  };

  const handleContinue = async () => {
    if (!selectedDate || !selectedTime) {
      toast.error('Please select date and time slot to continue');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        bookingType: 'scheduled',
        scheduledDate: selectedDate,
        scheduledTime: selectedTime
      };

      const res = await api.put(`/users/one-time-bookings/draft/${draftId}`, payload);
      if (res.data.success) {
        navigate(`/user/one-time-review?draftId=${draftId}`);
      } else {
        toast.error(res.data.message || 'Failed to update schedule');
      }
    } catch (error) {
      console.error('Submit schedule error:', error);
      toast.error('Failed to save selected schedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const monthName = currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FCFC] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#10AFA5] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="bg-[#F8FCFC] min-h-screen pb-36">
      {/* Top Header Bar */}
      <header className="px-4 py-4 flex items-center gap-3 sticky top-0 bg-[#F8FCFC]/90 backdrop-blur-md z-10 border-b border-gray-150/40">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-xs border border-gray-100 active:scale-95 transition-all"
        >
          <FiChevronLeft className="w-5 h-5 text-gray-800" />
        </button>
        <span className="text-xs font-black text-gray-850">Select Date & Time</span>
      </header>

      {/* Stepper */}
      <div className="px-5 py-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-2">
          {/* Service */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="w-7 h-7 rounded-full bg-[#10AFA5] flex items-center justify-center text-white text-xs font-bold shadow-sm">✓</div>
            <span className="text-[9px] text-[#10AFA5] font-semibold">Service</span>
          </div>
          <div className="flex-1 h-[2px] bg-[#10AFA5] mx-2 mb-4"></div>

          {/* Address & Time (Active) */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="w-7 h-7 rounded-full bg-[#10AFA5] flex items-center justify-center text-white text-xs font-bold shadow-md shadow-[#10AFA5]/20">
              <FiClock className="w-3.5 h-3.5" />
            </div>
            <span className="text-[9px] text-[#10AFA5] font-black uppercase tracking-wider">Address & Time</span>
          </div>
          <div className="flex-1 h-[2px] bg-gray-250 mx-2 mb-4"></div>

          {/* Review */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="w-7 h-7 rounded-full bg-white border border-gray-250 flex items-center justify-center text-gray-350 text-xs font-bold">3</div>
            <span className="text-[9px] text-gray-400 font-semibold">Review</span>
          </div>
          <div className="flex-1 h-[2px] bg-gray-250 mx-2 mb-4"></div>

          {/* Payment */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="w-7 h-7 rounded-full bg-white border border-gray-250 flex items-center justify-center text-gray-350 text-xs font-bold">4</div>
            <span className="text-[9px] text-gray-400 font-semibold">Payment</span>
          </div>
        </div>
      </div>

      <div className="px-5 pt-6 space-y-6">
        {/* Calendar Picker Card */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-black text-gray-800 uppercase tracking-wide">{monthName}</h2>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1.5 text-gray-500 hover:bg-gray-50 rounded-full active:scale-90 transition-all">
                <FiChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={nextMonth} className="p-1.5 text-gray-500 hover:bg-gray-50 rounded-full active:scale-90 transition-all">
                <FiChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100/50 mb-1">
            {weekDays.map((day, idx) => (
              <span key={idx} className="text-[10px] font-black text-gray-400 py-1 uppercase">{day}</span>
            ))}
            {getDaysInMonth(currentMonthDate).map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="aspect-square"></div>;
              }
              const isAvailable = isDateAvailable(date);
              const isSelected = isDateSelected(date);
              const isToday = date.toDateString() === new Date().toDateString();
              const dayNum = date.getDate();
              
              return (
                <button
                  key={`day-${idx}-${dayNum}`}
                  disabled={!isAvailable}
                  onClick={() => handleDateSelect(date)}
                  className={`aspect-square flex flex-col items-center justify-center rounded-full text-[13px] font-bold relative transition-all ${
                    isSelected 
                      ? 'bg-[#10AFA5] text-white shadow-sm' 
                      : isAvailable
                        ? 'bg-white text-gray-800 border border-gray-100 shadow-2xs active:scale-95'
                        : 'bg-transparent text-gray-300 cursor-not-allowed font-normal'
                  }`}
                >
                  <span>{dayNum}</span>
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1 w-1 h-1 bg-[#10AFA5] rounded-full"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Slot Picker Card */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-xs">
          <h3 className="text-xs font-black text-gray-800 uppercase tracking-wide mb-4">Select Time Slot</h3>
          
          {loadingSlots ? (
            <div className="py-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-[#10AFA5] rounded-full animate-spin"></div>
            </div>
          ) : timeSlots.length === 0 ? (
            <div className="text-center py-8 bg-gray-50/50 rounded-2xl border border-dashed border-gray-150/60">
              <p className="text-gray-400 text-xs font-bold">No slots available for this date</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {timeSlots.map((slot, idx) => {
                const timeDisplay = slot.time.split(' - ')[0];
                const isSelected = selectedSlotId === slot.id;
                
                return (
                  <button
                    key={idx}
                    disabled={!slot.isAvailable}
                    onClick={() => {
                      setSelectedSlotId(slot.id);
                      setSelectedTime(slot.time);
                    }}
                    className={`py-3 rounded-xl text-[12px] font-black transition-all border ${
                      !slot.isAvailable 
                        ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                        : isSelected
                          ? 'bg-[#F0FDFA] border-[#10AFA5] text-[#10AFA5] shadow-2xs'
                          : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'
                    }`}
                  >
                    {timeDisplay}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Info Notification */}
        <div className="bg-[#F8FAFC] rounded-2xl p-4 flex items-center gap-3 border border-gray-100">
          <FiInfo className="text-gray-400 w-5 h-5 shrink-0" />
          <p className="text-[11px] text-gray-500 font-semibold leading-relaxed">
            Our certified technician will call you 30 minutes before arriving at your location.
          </p>
        </div>
      </div>

      {/* Sticky Action Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-white border-t border-gray-100 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.06)] z-20 max-w-[480px] mx-auto">
        <button
          onClick={handleContinue}
          disabled={!selectedDate || !selectedTime || isSubmitting}
          className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 ${
            !selectedDate || !selectedTime || isSubmitting
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-[#10AFA5] shadow-md shadow-[#10AFA5]/15 active:scale-[0.98]'
          }`}
        >
          {isSubmitting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              <span>Confirm Schedule</span>
              <span>→</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default OneTimeServiceSchedule;
