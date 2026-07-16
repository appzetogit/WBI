import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const CountdownTimer = ({ deadline, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState({});
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const calculate = () => {
      const diff = new Date(deadline) - new Date();
      if (diff <= 0) {
        setExpired(true);
        onExpire?.();
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      const days = Math.floor(hours / 24);
      setTimeLeft({ days, hours: hours % 24, minutes, seconds });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [deadline, onExpire]);

  if (expired) {
    return (
      <span className="flex items-center gap-1 text-gray-500 text-xs font-semibold">
        <Clock className="h-3 w-3" /> Expired
      </span>
    );
  }

  const isUrgent = timeLeft.days < 1;

  const pad = (n) => String(n || 0).padStart(2, '0');

  return (
    <div className={`flex items-center gap-2 ${isUrgent ? 'text-red-600' : 'text-gray-700'}`}>
      <Clock className="h-4 w-4" />
      {timeLeft.days > 0 ? (
        <span className="text-sm font-semibold">{timeLeft.days}d {pad(timeLeft.hours)}h {pad(timeLeft.minutes)}m</span>
      ) : (
        <span className={`text-sm font-bold font-mono ${isUrgent ? 'text-red-600' : ''}`}>
          {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
        </span>
      )}
    </div>
  );
};

export default CountdownTimer;
