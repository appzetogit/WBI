import React, { useState } from 'react';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiShield, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  gstVerificationService,
  normalizeGstin,
  isValidGstinClient
} from '../../services/gstVerificationService';

/**
 * Shared GST verification UI for Vendor & B2B registration.
 *
 * @param {object} props
 * @param {string} props.value - current GSTIN
 * @param {(gstin: string) => void} props.onChange
 * @param {(fields: object, meta: object) => void} props.onVerified - auto-fill callback
 * @param {'vendor'|'b2b'|'unbound'} [props.entityType]
 * @param {string|null} [props.entityId]
 * @param {string} [props.expectedPan]
 * @param {object|null} [props.profile] - already verified profile (controlled)
 * @param {boolean} [props.required]
 * @param {string} [props.label]
 * @param {boolean} [props.readOnlyAfterVerify]
 */
export default function GstVerificationPanel({
  value = '',
  onChange,
  onVerified,
  entityType = 'unbound',
  entityId = null,
  expectedPan = '',
  profile: controlledProfile = null,
  required = true,
  label = 'GSTIN',
  readOnlyAfterVerify = true
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localProfile, setLocalProfile] = useState(null);
  const profile = controlledProfile || localProfile;
  const verified = profile?.registrationStatus === 'ACTIVE' || profile?.legalName;

  const handleChange = (e) => {
    const next = normalizeGstin(e.target.value).slice(0, 15);
    onChange?.(next);
    if (localProfile) setLocalProfile(null);
    setError('');
  };

  const handleVerify = async () => {
    const gstin = normalizeGstin(value);
    if (!isValidGstinClient(gstin)) {
      setError('Enter a valid 15-character GSTIN (e.g. 27ABCDE1234F1Z5)');
      toast.error('Invalid GSTIN format');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await gstVerificationService.verify({
        gstNumber: gstin,
        entityType,
        entityId,
        expectedPan: expectedPan || undefined,
        forceRefresh: Boolean(localProfile || controlledProfile)
      });
      if (!res.success) {
        throw new Error(res.message || 'Verification failed');
      }
      const fields = res.data?.fields || res.data?.profile || {};
      setLocalProfile(fields);
      onVerified?.(fields, {
        verificationId: res.data?.verificationId,
        verifiedAt: res.data?.verifiedAt,
        locked: res.data?.locked
      });
      toast.success('GST verified successfully');
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'GST verification failed. Please check the number and try again.';
      setError(msg);
      toast.error(msg);
      setLocalProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const locked = Boolean(verified && readOnlyAfterVerify);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            className="w-full p-3 border rounded-xl uppercase focus:ring-2 focus:ring-[#0D8A72] font-mono tracking-wide disabled:bg-gray-50 disabled:text-gray-700"
            value={value}
            onChange={handleChange}
            placeholder="27ABCDE1234F1Z5"
            maxLength={15}
            disabled={locked || loading}
          />
        </div>
        <button
          type="button"
          onClick={handleVerify}
          disabled={loading || !value || value.length < 15}
          className="shrink-0 px-4 py-3 rounded-xl bg-[#0D8A72] text-white font-semibold text-sm hover:bg-[#0a6e5b] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[120px] justify-center"
        >
          {loading ? (
            <>
              <FiLoader className="animate-spin" /> Verifying…
            </>
          ) : verified ? (
            <>
              <FiRefreshCw /> Re-verify
            </>
          ) : (
            <>
              <FiShield /> Verify GST
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
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
            <FiCheckCircle className="w-4 h-4" />
            GST Verified
            {profile.registrationStatus && (
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {profile.registrationStatus}
              </span>
            )}
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ['Legal Name', profile.legalName],
              ['Trade Name', profile.tradeName],
              ['GSTIN', profile.gstin],
              ['PAN (linked)', profile.pan],
              ['Constitution', profile.constitutionOfBusiness],
              ['Taxpayer Type', profile.taxpayerType],
              ['Registration Date', profile.registrationDate],
              ['State', profile.state ? `${profile.state} (${profile.stateCode || ''})` : profile.stateCode],
              ['Pincode', profile.pincode],
              ['Nature of Business', profile.natureOfBusiness],
              ['Address', profile.businessAddress],
              ['Portal Last Updated', profile.lastUpdated]
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className={k === 'Address' || k === 'Nature of Business' ? 'sm:col-span-2' : ''}>
                  <dt className="text-[11px] uppercase tracking-wide text-emerald-800/70 font-semibold">{k}</dt>
                  <dd className="text-slate-800 font-medium break-words">{v}</dd>
                </div>
              ))}
          </dl>
          {locked && (
            <p className="text-xs text-emerald-900/70">
              Verified fields are locked. Contact support if you need an admin override.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
