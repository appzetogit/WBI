import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';

const CATEGORIES = [
  ['quality', 'Work quality'], ['incomplete_work', 'Work not completed'], ['overcharged', 'Charged too much'],
  ['no_show', 'Professional did not come'], ['damage', 'Damage to property'], ['behaviour', 'Behaviour'],
  ['payment', 'Payment issue'], ['other', 'Something else']
];

/**
 * Raise a dispute on a booking (or, with `source="b2b"`, a B2B job) and show
 * its progress once raised. Admin resolves it from the Control Center.
 */
const ReportProblem = ({ sourceId, source = 'user', className = '' }) => {
  const base = source === 'b2b' ? '/b2b/disputes' : '/users/disputes';
  const [existing, setExisting] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: 'quality', reason: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get(base).then((res) => {
      if (!alive) return;
      setExisting((res.data?.data || []).find((d) => String(d.sourceId) === String(sourceId)) || null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [base, sourceId]);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await api.post(base, { sourceId, ...form });
      setExisting(res.data.data);
      setOpen(false);
      toast.success(res.data.message || 'Reported — our team will review it');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not report the problem');
    } finally {
      setSaving(false);
    }
  };

  if (existing) {
    return (
      <div className={`rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm ${className}`}>
        <div className="font-bold text-amber-800">Problem reported · {existing.disputeNumber}</div>
        <div className="text-amber-700 mt-0.5">Status: {existing.status.replace('_', ' ')}{existing.resolution ? ` — ${existing.resolution.replace('_', ' ')}` : ''}</div>
        {existing.refundAmount > 0 && <div className="text-amber-700">Refund: ₹{existing.refundAmount}</div>}
        {existing.resolutionNote && <div className="text-amber-700">{existing.resolutionNote}</div>}
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`py-3 rounded-2xl text-amber-700 font-bold text-sm bg-amber-50 border border-amber-100 hover:bg-amber-100 ${className}`}>
        Report a problem
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900">Report a problem</h3>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm">
              {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={200}
              placeholder="What went wrong? (short)" className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm" />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={4000}
              placeholder="Details (optional)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setOpen(false)} className="px-4 h-10 rounded-xl text-sm font-bold text-gray-600">Cancel</button>
              <button type="button" disabled={!form.reason.trim() || saving} onClick={submit}
                className="px-4 h-10 rounded-xl text-sm font-bold bg-gray-900 text-white disabled:opacity-40">{saving ? 'Sending…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReportProblem;
