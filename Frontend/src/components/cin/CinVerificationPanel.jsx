import React, { useState } from 'react';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiShield, FiRefreshCw, FiUsers } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  cinVerificationService,
  normalizeCin,
  isValidCinClient
} from '../../services/cinVerificationService';

/**
 * Shared CIN / MCA verification UI for Vendor & B2B registration.
 */
export default function CinVerificationPanel({
  value = '',
  onChange,
  onVerified,
  entityType = 'unbound',
  entityId = null,
  profile: controlledProfile = null,
  required = false,
  label = 'CIN (MCA)',
  readOnlyAfterVerify = true
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localProfile, setLocalProfile] = useState(null);
  const profile = controlledProfile || localProfile;
  const verified =
    profile?.companyStatus === 'ACTIVE' || Boolean(profile?.companyName);

  const handleChange = (e) => {
    const next = normalizeCin(e.target.value).slice(0, 21);
    onChange?.(next);
    if (localProfile) setLocalProfile(null);
    setError('');
  };

  const handleVerify = async () => {
    const cin = normalizeCin(value);
    if (!isValidCinClient(cin)) {
      setError('Enter a valid 21-character CIN (e.g. U72900MH2019PTC123456)');
      toast.error('Invalid CIN format');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await cinVerificationService.verify({
        cinNumber: cin,
        entityType,
        entityId,
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
        locked: res.data?.locked,
        transactionId: res.data?.transactionId,
        requestId: res.data?.requestId
      });
      toast.success('CIN verified with MCA');
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'CIN verification failed. Please check the number and try again.';
      setError(msg);
      toast.error(msg);
      setLocalProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const locked = Boolean(verified && readOnlyAfterVerify);
  const directors = profile?.presentDirectors || profile?.directors || [];

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            autoComplete="off"
            className="w-full p-3 border rounded-xl uppercase focus:ring-2 focus:ring-[#0D8A72] font-mono tracking-wide disabled:bg-gray-50 disabled:text-gray-700"
            value={value}
            onChange={handleChange}
            placeholder="U72900MH2019PTC123456"
            maxLength={21}
            disabled={locked || loading}
          />
        </div>
        <button
          type="button"
          onClick={handleVerify}
          disabled={loading || !value || value.length < 8}
          className="shrink-0 px-4 py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[120px] justify-center"
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
              <FiShield /> Verify CIN
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
        <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sky-900 font-semibold text-sm">
            <FiCheckCircle className="w-4 h-4 text-emerald-600" />
            MCA Verified
            {profile.companyStatus && (
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {profile.companyStatus}
              </span>
            )}
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ['Company Name', profile.companyName],
              ['CIN', profile.cin],
              ['Company Type', profile.companyType],
              ['Category', profile.companyCategory],
              ['Class', profile.companyClass],
              ['ROC', profile.rocCode],
              ['Registration No.', profile.registrationNumber],
              ['Incorporation Date', profile.dateOfIncorporation],
              ['Listed', profile.listedStatus],
              ['Authorised Capital', profile.authorisedCapital],
              ['Paid-up Capital', profile.paidUpCapital],
              ['State', profile.state],
              ['Pincode', profile.pincode],
              ['Registered Office', profile.registeredAddress],
              ['Transaction ID', profile.transactionId],
              ['Request ID', profile.requestId]
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className={k === 'Registered Office' || k === 'Company Name' ? 'sm:col-span-2' : ''}>
                  <dt className="text-[11px] uppercase tracking-wide text-sky-800/70 font-semibold">{k}</dt>
                  <dd className="text-slate-800 font-medium break-words">{v}</dd>
                </div>
              ))}
          </dl>
          {directors.length > 0 && (
            <div className="pt-2 border-t border-sky-100">
              <p className="text-xs font-bold text-sky-900 flex items-center gap-1 mb-2">
                <FiUsers className="w-3.5 h-3.5" /> Present Directors ({directors.length})
              </p>
              <ul className="space-y-1.5">
                {directors.map((d, i) => (
                  <li key={i} className="text-xs text-slate-700 bg-white/70 rounded-lg px-2 py-1.5 border border-sky-50">
                    <span className="font-semibold">{d.name}</span>
                    {d.dinPan && <span className="text-slate-500"> · DIN/PAN {d.dinPan}</span>}
                    {d.dateOfAppointment && <span className="text-slate-500"> · {d.dateOfAppointment}</span>}
                    {d.nationality && <span className="text-slate-500"> · {d.nationality}</span>}
                    {d.gender && <span className="text-slate-500"> · {d.gender}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {locked && (
            <p className="text-xs text-sky-900/70">
              Verified fields are locked. Contact support if you need an admin override.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
