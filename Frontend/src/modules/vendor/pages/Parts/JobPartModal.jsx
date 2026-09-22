import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Modal } from '../../components/ops/OpsUi';
import { listJobs, getInventory, getPartsCatalog, addRequiredPart, recordUsedPart, errorMessage } from '../../services/vendorJobsService';

const OPEN = ['PENDING_ASSIGNMENT', 'REJECTED', 'ASSIGNED', 'REASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'ON_HOLD'];
const input = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none';

/**
 * Add a part to one of your jobs.
 *   mode="required" — needed for an open job; optionally reserved from stock
 *   mode="used"     — already fitted; deducted from stock unless bought locally
 */
const JobPartModal = ({ mode = 'required', presetJobId = '', onClose, onSaved }) => {
  const used = mode === 'used';
  const [jobs, setJobs] = useState([]);
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [catSearch, setCatSearch] = useState('');
  const [f, setF] = useState({ jobId: presetJobId, source: 'inventory', inventoryItemId: '', catalogPartId: '', name: '', unitPrice: '', quantity: 1, reserve: true, fromStock: true, note: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listJobs({ tab: 'all', limit: 100, sort: 'updatedAt', order: 'desc' })
      .then((r) => setJobs((r.data || []).filter((j) => j.heldByYou && (used ? j.status !== 'CANCELLED' : OPEN.includes(j.status)))))
      .catch(() => setJobs([]));
    getInventory({ limit: 100 }).then((r) => setItems(r.data || [])).catch(() => setItems([]));
  }, [used]);

  useEffect(() => {
    if (f.source !== 'catalog') return undefined;
    const t = setTimeout(() => {
      getPartsCatalog({ limit: 30, ...(catSearch.trim() ? { search: catSearch.trim() } : {}) }).then((r) => setCatalog(r.data || [])).catch(() => setCatalog([]));
    }, 300);
    return () => clearTimeout(t);
  }, [f.source, catSearch]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const item = items.find((i) => i.id === f.inventoryItemId);
  const qty = Number(f.quantity) || 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!f.jobId) return toast.error('Pick a job');
    if (!Number.isInteger(qty) || qty < 1) return toast.error('Quantity must be a whole number of at least 1');
    const body = { jobId: f.jobId, quantity: qty, note: f.note.trim() || undefined };
    if (f.source === 'inventory') {
      if (!f.inventoryItemId) return toast.error('Pick an item from your inventory');
      body.inventoryItemId = f.inventoryItemId;
    } else if (f.source === 'catalog') {
      if (!f.catalogPartId) return toast.error('Pick a catalog part');
      body.catalogPartId = f.catalogPartId;
    } else {
      if (f.name.trim().length < 2) return toast.error('Enter the part name');
      body.name = f.name.trim();
      if (f.unitPrice !== '') body.unitPrice = Number(f.unitPrice);
    }
    if (used) body.fromStock = f.fromStock;
    else body.reserve = f.reserve;
    setBusy(true);
    try {
      const res = used ? await recordUsedPart(body) : await addRequiredPart(body);
      toast.success(res.message || 'Saved', { duration: 5000 });
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the part'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={used ? 'Record a used part' : 'Add a required part'}
      subtitle={used ? 'A part fitted on the job. Stock is deducted unless you bought it locally.' : 'A part the job needs. Reserve it from stock so it is kept for this job.'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" form="job-part-form" disabled={busy} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {used ? 'Record used part' : 'Add part'}
          </button>
        </>
      )}
    >
      <form id="job-part-form" onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block text-xs font-bold text-gray-700 mb-1">Job</span>
          <select value={f.jobId} onChange={set('jobId')} className={input} required>
            <option value="">Select a job…</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.jobCode} · {j.service} · {j.location.city} · {j.statusLabel}</option>)}
          </select>
          {!jobs.length && <span className="text-[11px] text-gray-500">{used ? 'You have no jobs yet.' : 'No open jobs — parts can be requested until work is submitted.'}</span>}
        </label>

        <fieldset>
          <legend className="block text-xs font-bold text-gray-700 mb-1">Part</legend>
          <div className="flex gap-1.5 mb-2">
            {[['inventory', 'From my inventory'], ['catalog', 'WBI catalog'], ['other', 'Other part']].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={f.source === k} onClick={() => setF((x) => ({ ...x, source: k }))} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${f.source === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
            ))}
          </div>
          {f.source === 'inventory' && (
            <select value={f.inventoryItemId} onChange={set('inventoryItemId')} className={input} aria-label="Inventory item">
              <option value="">Select an item…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.available} {i.unit} free{i.reserved ? ` · ${i.reserved} reserved` : ''}</option>)}
            </select>
          )}
          {f.source === 'catalog' && (
            <div className="space-y-2">
              <input value={catSearch} onChange={(e) => setCatSearch(e.target.value)} placeholder="Search catalog by name or HSN" aria-label="Search catalog" className={input} />
              <select value={f.catalogPartId} onChange={set('catalogPartId')} className={input} aria-label="Catalog part">
                <option value="">Select a part…</option>
                {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} · ₹{c.price}{c.inStock !== null ? ` · ${c.inStock} in your stock` : ''}</option>)}
              </select>
            </div>
          )}
          {f.source === 'other' && (
            <div className="grid grid-cols-3 gap-2">
              <input value={f.name} onChange={set('name')} placeholder="Part name" aria-label="Part name" className={`${input} col-span-2`} />
              <input type="number" min="0" step="0.01" value={f.unitPrice} onChange={set('unitPrice')} placeholder="Unit price ₹" aria-label="Unit price" className={input} />
            </div>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3 items-end">
          <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">Quantity</span><input type="number" min="1" step="1" value={f.quantity} onChange={set('quantity')} className={input} /></label>
          {f.source !== 'other' && (used ? (
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700 pb-2.5"><input type="checkbox" checked={f.fromStock} onChange={set('fromStock')} className="w-4 h-4" /> Take from my stock</label>
          ) : (
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700 pb-2.5"><input type="checkbox" checked={f.reserve} onChange={set('reserve')} className="w-4 h-4" /> Reserve from stock now</label>
          ))}
        </div>
        {f.source === 'inventory' && item && qty > item.available && (
          <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Only {item.available} {item.unit} free. {used ? 'Untick “Take from my stock” if it was bought locally.' : 'The part is added as required and shown as short until you restock.'}</p>
        )}
        <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">Note (optional)</span><input value={f.note} onChange={set('note')} maxLength={500} className={input} /></label>
      </form>
    </Modal>
  );
};

export default JobPartModal;
