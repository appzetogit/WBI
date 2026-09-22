import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Link2, Copy, RefreshCw, UserPlus, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../components/ops/OpsUi';
import { formatDateTime } from '../../components/ops/opsFormat';
import { addEngineer, errorMessage } from '../../services/vendorJobsService';
import { fetchCompanyCode, generateInviteLink } from '../../services/companyCodeService';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import { EngineerForm } from './components/EngineerUi';
import useTeamServices from './useTeamServices';

const copy = async (text, what) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Copy failed — select and copy it manually');
  }
};

/** Invite link / company code for engineers who already have a WBI account. */
const InviteCard = () => {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchCompanyCode();
      setState({ loading: false, error: '', data: res.data?.data || null });
    } catch (err) {
      setState({ loading: false, error: errorMessage(err, 'Invite details unavailable'), data: null });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const newLink = async () => {
    setBusy(true);
    try {
      const res = await generateInviteLink();
      setState({ loading: false, error: '', data: { ...(state.data || {}), ...(res.data?.data || {}) } });
      toast.success('New invite link created (valid 7 days)');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create invite link'));
    } finally {
      setBusy(false);
    }
  };

  const d = state.data;
  const expired = d?.inviteLinkExpiresAt && new Date(d.inviteLinkExpiresAt) < new Date();
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
      <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Invite with a link</h2>
      <p className="text-xs text-gray-500">For engineers who already have a WBI engineer account, or prefer to sign up themselves. They appear under Pending Engineers for you to approve.</p>
      {state.loading ? <p className="text-xs text-gray-400">Loading…</p> : state.error ? <p className="text-xs text-red-600">{state.error}</p> : (
        <>
          {d?.uniqueCompanyCode && (
            <div>
              <p className="text-[11px] text-gray-500">Company code</p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-extrabold tracking-wider">{d.uniqueCompanyCode}</span>
                <button type="button" onClick={() => copy(d.uniqueCompanyCode, 'Company code')} className="p-1.5 border border-gray-200 rounded-lg" aria-label="Copy company code"><Copy className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}
          {d?.inviteUrl && !expired ? (
            <div>
              <p className="text-[11px] text-gray-500">Invite link · expires {formatDateTime(d.inviteLinkExpiresAt)}</p>
              <div className="flex items-center gap-2">
                <input readOnly value={d.inviteUrl} aria-label="Invite link" className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono" />
                <button type="button" onClick={() => copy(d.inviteUrl, 'Invite link')} className="p-2 border border-gray-200 rounded-lg" aria-label="Copy invite link"><Copy className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ) : <p className="text-xs text-gray-500">{expired ? 'Your last invite link has expired.' : 'No invite link yet.'}</p>}
          <button type="button" onClick={newLink} disabled={busy} className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {d?.inviteUrl ? 'Create a new link' : 'Create invite link'}
          </button>
        </>
      )}
    </section>
  );
};

const AddEngineer = () => {
  const navigate = useNavigate();
  const { basePath } = useVendorBasePath();
  const services = useTeamServices();
  const [busy, setBusy] = useState(false);

  const submit = async (body) => {
    setBusy(true);
    try {
      const res = await addEngineer(body);
      toast.success(res.message || 'Engineer added');
      navigate(`${basePath}/engineers?tab=pending&pendingOn=wbi`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add engineer'), { duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="Engineers"
        title="Add Engineer"
        subtitle="Add someone to your team. They get an engineer account and can take your jobs once WBI verifies their documents."
        actions={<Link to={`${basePath}/engineers?tab=all`} className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700">Back to engineers</Link>}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <section className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
          <EngineerForm id="add-engineer-form" services={services} onSubmit={submit} />
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
            <p className="text-[11px] text-gray-500 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Verification by WBI is required before routing sends them work.</p>
            <button type="submit" form="add-engineer-form" disabled={busy} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Add engineer
            </button>
          </div>
        </section>
        <InviteCard />
      </div>
    </div>
  );
};

export default AddEngineer;
