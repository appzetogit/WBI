import React, { useState, useEffect, useRef } from 'react';
import { FiChevronLeft, FiChevronRight, FiInfo } from 'react-icons/fi';

const TimeSlotModal = ({
  isOpen,
  onClose,
  availableDates = [],
  isLoading = false,
  onSave,
  fetchSlots,
  selectedDate,
  selectedTime
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  
  // Local state for selections before saving
  const [localSelectedDate, setLocalSelectedDate] = useState(selectedDate || null);
  const [localSelectedTime, setLocalSelectedTime] = useState(selectedTime || null);
  const [localSelectedSlotId, setLocalSelectedSlotId] = useState(null);
  
  const [timeSlots, setTimeSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (!localSelectedDate && availableDates.length > 0) {
        handleDateSelect(availableDates[0]);
      } else if (localSelectedDate) {
        handleDateSelect(localSelectedDate);
      }
    } else {
      document.body.style.overflow = '';
      setIsClosing(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, availableDates]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  };

  const handleDateSelect = async (date) => {
    setLocalSelectedDate(date);
    setCurrentMonthDate(date);
    setLocalSelectedTime(null);
    setLocalSelectedSlotId(null);
    
    if (fetchSlots) {
      setLoadingSlots(true);
      try {
        const slots = await fetchSlots(date);
        setTimeSlots(slots);
      } catch (error) {
        console.error("Failed to load slots", error);
      } finally {
        setLoadingSlots(false);
      }
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

  if (!isOpen && !isClosing) return null;

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysCount = new Date(year, month + 1, 0).getDate();
    let firstDayIndex = new Date(year, month, 1).getDay();
    // Adjust Sunday from 0 to 6, and Monday-Saturday from 1-6 to 0-5
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
    if (!date || !localSelectedDate) return false;
    return date.getDate() === localSelectedDate.getDate() &&
      date.getMonth() === localSelectedDate.getMonth() &&
      date.getFullYear() === localSelectedDate.getFullYear();
  };

  const monthName = currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={handleClose}
      />

      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div
          className={`bg-white rounded-t-3xl ${isClosing ? 'animate-slide-down' : 'animate-slide-up'} flex flex-col`}
          style={{ maxHeight: '95vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-6 pb-4 shrink-0">
            <button onClick={handleClose} className="p-2 -ml-2 text-gray-800 hover:bg-gray-100 rounded-full">
              <FiChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="text-[17px] font-bold text-[#0F172A]">{monthName}</h2>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-full">
                <FiChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={nextMonth} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-full">
                <FiChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="px-5 overflow-y-auto pb-6 scrollbar-hide">
            {/* Monthly Calendar Grid */}
            {isLoading ? (
              <div className="py-4 flex justify-center">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-[#10AFA5] rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center mb-4 bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
                {weekDays.map((day, idx) => (
                  <span key={idx} className="text-[11px] font-bold text-gray-400 uppercase py-1">{day}</span>
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
                          ? 'bg-[#10AFA5] text-white shadow-md' 
                          : isAvailable
                            ? 'bg-white text-[#0F172A] border border-gray-100/80 shadow-sm active:scale-95'
                            : 'bg-transparent text-gray-300 cursor-not-allowed font-normal'
                      }`}
                    >
                      <span>{dayNum}</span>
                      {isToday && !isSelected && (
                        <span className="absolute bottom-1.5 w-1 h-1 bg-[#10AFA5] rounded-full"></span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Time Slots */}
            <div className="mt-4">
              <h3 className="text-[15px] font-bold text-[#0F172A] mb-4">Select Time Slot</h3>
              
              {loadingSlots ? (
                <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-gray-200 border-t-[#10AFA5] rounded-full animate-spin"></div></div>
              ) : timeSlots.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <p className="text-gray-500 text-sm">No slots available for this date</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {timeSlots.map((slot, idx) => {
                    const timeDisplay = slot.time.split(' - ')[0]; // Just show start time "09:00 AM"
                    const isSelected = localSelectedSlotId === slot.id;
                    
                    return (
                      <button
                        key={idx}
                        disabled={!slot.isAvailable}
                        onClick={() => {
                          setLocalSelectedSlotId(slot.id);
                          setLocalSelectedTime(slot.time);
                        }}
                        className={`py-3 rounded-xl text-[13px] font-bold transition-all border ${
                          !slot.isAvailable 
                            ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                            : isSelected
                              ? 'bg-[#F1FAF9] border-[#10AFA5] text-[#10AFA5]'
                              : 'bg-white border-gray-100 text-[#64748B] hover:border-gray-200'
                        }`}
                      >
                        {timeDisplay}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="mt-6 bg-[#F8FAFC] rounded-xl p-3 flex items-center gap-3">
              <FiInfo className="text-gray-400 w-4 h-4 shrink-0" />
              <p className="text-[13px] text-gray-500">You will be notified before arrival</p>
            </div>

            {/* Action Button */}
            <button
              onClick={() => onSave(localSelectedDate, localSelectedTime, localSelectedSlotId)}
              disabled={!localSelectedDate || !localSelectedSlotId}
              className={`w-full mt-6 py-4 rounded-xl text-[15px] font-bold transition-all ${
                localSelectedDate && localSelectedSlotId
                  ? 'bg-[#10AFA5] text-white shadow-md active:scale-[0.98]'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default TimeSlotModal;
