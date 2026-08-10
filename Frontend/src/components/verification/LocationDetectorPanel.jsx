import React, { useState } from 'react';
import { FiMapPin, FiLoader, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { cgpeSuiteService } from '../../services/cgpeSuiteService';

/**
 * Capture GPS → CGPE reverse geocode → autofill address fields.
 */
export default function LocationDetectorPanel({
  onDetected,
  entityType = 'unbound',
  entityId = null,
  purpose = 'registration',
  detailed = false,
  label = 'Detect location from GPS'
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);

  const handleDetect = async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device/browser.');
      toast.error('Geolocation not supported');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        });
      });
      const latitude = pos.coords.latitude;
      const longitude = pos.coords.longitude;

      const res = await cgpeSuiteService.detectLocation({
        latitude,
        longitude,
        detailed,
        entityType,
        entityId,
        purpose
      });
      if (!res.success) throw new Error(res.message || 'Detection failed');
      const fields = res.data?.fields || res.data?.profile || {};
      setProfile(fields);
      onDetected?.(fields, {
        verificationId: res.data?.verificationId,
        latitude,
        longitude
      });
      toast.success('Address detected from location');
    } catch (err) {
      let msg = err?.response?.data?.message || err?.message || 'Location detection failed';
      if (err?.code === 1 || err?.code === err?.PERMISSION_DENIED) {
        msg = 'Location permission denied. Enable GPS and try again.';
      }
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const addr = profile?.address || {};

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleDetect}
        disabled={loading}
        className="w-full sm:w-auto px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <FiLoader className="animate-spin" /> : <FiMapPin />}
        {loading ? 'Detecting…' : label}
      </button>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <FiAlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {profile && (
        <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3 text-sm space-y-1">
          <div className="flex items-center gap-2 text-sky-900 font-semibold">
            <FiCheckCircle className="text-emerald-600" /> Location detected
          </div>
          <p className="font-medium text-slate-800">{profile.displayName || profile.fullAddress}</p>
          <p className="text-xs text-slate-500 font-mono">
            {profile.latitude}, {profile.longitude}
          </p>
          <dl className="grid grid-cols-2 gap-1 text-xs pt-1">
            {addr.city && (
              <>
                <dt className="text-slate-500">City</dt>
                <dd>{addr.city}</dd>
              </>
            )}
            {addr.state && (
              <>
                <dt className="text-slate-500">State</dt>
                <dd>{addr.state}</dd>
              </>
            )}
            {addr.pincode && (
              <>
                <dt className="text-slate-500">Pincode</dt>
                <dd>{addr.pincode}</dd>
              </>
            )}
            {addr.district && (
              <>
                <dt className="text-slate-500">District</dt>
                <dd>{addr.district}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
