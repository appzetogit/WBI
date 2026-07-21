import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { logout as vendorLogout } from '../services/authService';

/**
 * Shared production logout for the vendor portal.
 * Clears server session + FCM + local storage, then redirects to login.
 */
export default function useVendorLogout() {
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const openConfirm = useCallback(() => setConfirmOpen(true), []);
  const closeConfirm = useCallback(() => {
    if (!loggingOut) setConfirmOpen(false);
  }, [loggingOut]);

  const confirmLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await vendorLogout();
      toast.success('Signed out successfully');
      setConfirmOpen(false);
      navigate('/vendor/login', { replace: true });
    } catch (err) {
      console.error('[VENDOR] Logout unexpected error:', err);
      toast.success('Signed out');
      setConfirmOpen(false);
      navigate('/vendor/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut, navigate]);

  return {
    loggingOut,
    confirmOpen,
    openConfirm,
    closeConfirm,
    confirmLogout
  };
}
