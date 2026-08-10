import React, { useState } from 'react';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiShield, FiRefreshCw, FiSmartphone } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  cgpeSuiteService,
  normalizeVpa,
  isValidVpaClient,
  normalizeMobile10,
  isValidMobileClient
} from '../../services/cgpeSuiteService';

/**
 * UPI verify + optional Mobile→UPI discover for registration / payouts.
 */
export default function UpiVerificationPanel({
  value = '',
  onChange,
  onVerified,
  mobile = '',
  entityType = 'unbound',
  entityId = null,
  required = false,
  label = 'UPI ID (VPA)',
  profile: controlledProfile = null,
  accountHolderName = '',
  onAccountHolderChange
}) {
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState('');
  const [localProfile, setLocalProfile] = useState(null);
  const profile = controlledProfile || localProfile;
  const verified = Boolean(profile?.accountHolderName || profile?.vpa);

  const handleVerify = async () => {
    const vpa = normalizeVpa(value);
    if (!isValidVpaClient(vpa)) {
      setError('Enter a valid UPI ID (e.g. name@paytm or 9876543210@ybl)');
      toast.error('Invalid UPI format');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await cgpeSuiteService.verifyUpi({
        vpa,
        entityType,
        entityId,
        forceRefresh: Boolean(localProfile || controlledProfile)
      });
      if (!res.success) throw new Error(res.message || 'Verification failed');
      const fields = res.data?.fields || res.data?.profile || {};
      setLocalProfile(fields);
      if (fields.accountHolderName && onAccountHolderChange) {
        onAccountHolderChange(fields.accountHolderName);
      }
      onVerified?.(fields, {
        verificationId: res.data?.verificationId,
        verifiedAt: res.data?.verifiedAt
      });
      toast.success('UPI verified');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'UPI verification failed';
      setError(msg);
      toast.error(msg);
      setLocalProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLookupMobile = async () => {
    const m = normalizeMobile10(mobile);
    if (!isValidMobileClient(m)) {
      toast.error('Enter a valid 10-digit mobile to look up linked UPI');
      return;
    }
    setLookupLoading(true);
    setError('');
    try {
      const res = await cgpeSuiteService.lookupMobileUpi({
        mobile: m,
        entityType,
        entityId
      });
      const fields = res.data?.fields || res.data?.profile || {};
      if (res.data?.found && fields.vpa) {
        onChange?.(fields.vpa);
        if (fields.mobileLinkedName || fields.accountHolderName) {
          onAccountHolderChange?.(fields.mobileLinkedName || fields.accountHolderName);
        }
        toast.success(`Linked UPI found: ${fields.vpa}`);
        // Auto-verify found VPA
        setLocalProfile(fields);
        onVerified?.(fields, {
          verificationId: res.data?.verificationId,
          source: 'mobile_upi'
        });
      } else {
        toast('No linked UPI found. Enter UPI manually and verify.', { icon: 'ℹ️' });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {mobile && (
        <button
          type="button"
          onClick={handleLookupMobile}
          disabled={lookupLoading}
          className="text-sm font-semibold text-teal-700 flex items-center gap-2 hover:underline disabled:opacity-50"
        >
          {lookupLoading ? <FiLoader className="animate-spin" /> : <FiSmartphone />}
          Find UPI linked to mobile {normalizeMobile10(mobile)}
        </button>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            autoComplete="off"
            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#0D8A72] font-mono text-sm disabled:bg-gray-50"
            value={value}
            onChange={(e) => {
              onChange?.(normalizeVpa(e.target.value));
              if (localProfile) setLocalProfile(null);
              setError('');
            }}
            placeholder="name@paytm"
            disabled={loading}
          />
        </div>
        <button
          type="button"
          onClick={handleVerify}
          disabled={loading || !value}
          className="shrink-0 px-4 py-3 rounded-xl bg-[#0D8A72] text-white font-semibold text-sm disabled:opacity-50 flex items-center gap-2 min-w-[110px] justify-center"
        >
          {loading ? (
            <>
              <FiLoader className="animate-spin" /> …
            </>
          ) : verified ? (
            <>
              <FiRefreshCw /> Re-verify
            </>
          ) : (
            <>
              <FiShield /> Verify
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <FiAlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {verified && profile && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold">
            <FiCheckCircle /> UPI Verified
          </div>
          <p className="mt-1 text-slate-800">
            <span className="text-xs uppercase text-slate-500 font-semibold">Holder</span>
            <br />
            {profile.accountHolderName || profile.mobileLinkedName || accountHolderName || '—'}
          </p>
          {profile.vpa && (
            <p className="mt-1 font-mono text-xs text-slate-600">{profile.vpa}</p>
          )}
        </div>
      )}
    </div>
  );
}
