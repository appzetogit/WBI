import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Check, RefreshCw, Link2, QrCode, KeyRound } from 'lucide-react';
import {
  fetchCompanyCode,
  regenerateCompanyCode,
  generateInviteLink,
} from '../../../services/companyCodeService';

/**
 * Vendor dashboard — Your Company Code
 */
const CompanyCode = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchCompanyCode();
      setData(res.data?.data || null);
      if (res.data?.data?.inviteUrl) setInviteUrl(res.data.data.inviteUrl);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load company code');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert('Copy failed');
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm('Old code will stop working immediately. Engineers using the old code will not be able to join. Continue?')) {
      return;
    }
    setBusy('regen');
    try {
      const res = await regenerateCompanyCode();
      setData((prev) => ({
        ...prev,
        uniqueCompanyCode: res.data?.newCode || res.data?.data?.uniqueCompanyCode,
        codeGeneratedAt: res.data?.data?.codeGeneratedAt || new Date().toISOString(),
        codeRegeneratedCount: res.data?.data?.codeRegeneratedCount,
        inviteUrl: null,
        inviteLinkToken: null,
      }));
      setInviteUrl('');
      alert(res.data?.message || 'Code regenerated');
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to regenerate');
    } finally {
      setBusy('');
    }
  };

  const handleInvite = async () => {
    setBusy('invite');
    try {
      const res = await generateInviteLink();
      const url = res.data?.data?.inviteUrl || '';
      setInviteUrl(url);
      setData((prev) => ({
        ...prev,
        inviteUrl: url,
        inviteLinkExpiresAt: res.data?.data?.inviteLinkExpiresAt,
      }));
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to generate invite link');
    } finally {
      setBusy('');
    }
  };

  const qrSrc = inviteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(inviteUrl)}`
    : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-blue-600" />
          Your Company Code
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Share this code with engineers so they can join your company during signup.
        </p>
      </div>

      {loading ? (
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
      ) : error ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
      ) : (
        <>
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-100 mb-2">
              {data?.companyName || 'Company Code'}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <code className="text-2xl sm:text-3xl font-black tracking-widest">
                {data?.uniqueCompanyCode || '—'}
              </code>
              <button
                type="button"
                onClick={() => copy(data?.uniqueCompanyCode || '')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-white/15 hover:bg-white/25 rounded-lg border border-white/20"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-blue-100 mt-3">
              Generated:{' '}
              {data?.codeGeneratedAt
                ? new Date(data.codeGeneratedAt).toLocaleString('en-IN')
                : '—'}
              {typeof data?.codeRegeneratedCount === 'number' && data.codeRegeneratedCount > 0
                ? ` · Regenerated ${data.codeRegeneratedCount}×`
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === 'regen'}
              onClick={handleRegenerate}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border border-amber-200 text-amber-800 bg-amber-50 rounded-xl hover:bg-amber-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy === 'regen' ? 'animate-spin' : ''}`} />
              Regenerate Code
            </button>
            <button
              type="button"
              disabled={busy === 'invite'}
              onClick={handleInvite}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" />
              Generate Invite Link
            </button>
          </div>

          {inviteUrl && (
            <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <QrCode className="h-4 w-4" /> Shareable invite (expires in 7 days)
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  className="flex-1 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => copy(inviteUrl)}
                  className="px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Copy
                </button>
              </div>
              {qrSrc && (
                <img src={qrSrc} alt="Invite QR" className="w-[180px] h-[180px] rounded-lg border border-gray-100" />
              )}
              {data?.inviteLinkExpiresAt && (
                <p className="text-xs text-gray-500">
                  Expires: {new Date(data.inviteLinkExpiresAt).toLocaleString('en-IN')}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CompanyCode;
