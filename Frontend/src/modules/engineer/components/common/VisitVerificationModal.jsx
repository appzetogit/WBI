import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiCheckCircle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import engineerService from '../../../../services/engineerService';
import { getUserFacingError } from '../../../../utils/userFacingError';

/**
 * Visit Verification Modal — OTP + fresh GPS check-in
 */
const VisitVerificationModal = ({ isOpen, onClose, bookingId, onSuccess }) => {
  const [otpInput, setOtpInput] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const verifyingRef = useRef(false);

  const getPosition = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported on this device'));
        return;
      }

      // Production: require a fresh high-accuracy fix (no stale cached coords)
      navigator.geolocation.getCurrentPosition(
        resolve,
        (error) => {
          // Fallback once with slightly longer timeout
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
          );
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  };

  const handleVerify = useCallback(async () => {
    const otp = otpInput.join('');
    if (otp.length !== 4) {
      toast.error('Please enter the 4-digit OTP');
      return;
    }
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setLoading(true);

    try {
      const position = await getPosition();
      const accuracy = position.coords.accuracy;
      if (typeof accuracy === 'number' && accuracy > 200) {
        toast.error('GPS accuracy is too low. Move outdoors and try again.');
        return;
      }

      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };

      const response = await engineerService.verifyVisit(bookingId, otp, location);

      if (response.success) {
        toast.success('Visit verified successfully');
        setOtpInput(['', '', '', '']);
        onSuccess?.(response);
        onClose?.();
      } else {
        toast.error(response.message || 'Invalid OTP. Please try again.');
      }
    } catch (error) {
      if (error?.code === 1) {
        toast.error('Location permission is required to verify arrival.');
      } else if (error?.code === 3) {
        toast.error('Could not get GPS fix in time. Try again outdoors.');
      } else {
        toast.error(getUserFacingError(error, 'Visit verification failed. Please try again.'));
      }
    } finally {
      verifyingRef.current = false;
      setLoading(false);
    }
  }, [otpInput, bookingId, onSuccess, onClose]);

  React.useEffect(() => {
    if (!isOpen) {
      setOtpInput(['', '', '', '']);
      verifyingRef.current = false;
      setLoading(false);
      return;
    }
    const otpValue = otpInput.join('');
    if (otpValue.length === 4 && !loading) {
      handleVerify();
    }
  }, [otpInput, isOpen, loading, handleVerify]);

  const handleOtpChange = (index, value) => {
    const sanitized = value.replace(/[^0-9]/g, '');
    if (sanitized.length > 1) return;

    const newOtp = [...otpInput];
    newOtp[index] = sanitized;
    setOtpInput(newOtp);

    if (sanitized && index < 3) {
      document.getElementById(`visit-otp-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpInput[index] && index > 0) {
      document.getElementById(`visit-otp-${index - 1}`)?.focus();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={loading ? undefined : onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 16 }}
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl relative z-10 overflow-hidden"
          >
            <div className="px-6 pt-6 pb-2 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Verify Arrival</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Enter the customer OTP. Your current GPS location will be recorded.
                </p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                aria-label="Close"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-6">
              <div className="flex justify-center gap-3 mb-6">
                {otpInput.map((digit, index) => (
                  <input
                    key={index}
                    id={`visit-otp-${index}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    disabled={loading}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none disabled:opacity-60"
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handleVerify}
                disabled={loading || otpInput.join('').length !== 4}
                className="w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: '#10AFA5' }}
              >
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FiCheckCircle className="w-5 h-5" />
                )}
                {loading ? 'Verifying…' : 'Verify & Continue'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default VisitVerificationModal;
