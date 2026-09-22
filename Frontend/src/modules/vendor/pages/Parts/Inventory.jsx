import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, Loader2, History, PackagePlus, ClipboardCheck, AlertOctagon, Pencil } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, Pagination, StatCard, Modal } from '../../components/ops/OpsUi';
import { formatDateTime, formatINR } from '../../components/ops/opsFormat';
import { getInventory, createInventoryItem, adjustInventoryItem, getInventoryMovements, errorMessage } from '../../services/vendorJobsService';
import useTeamServices from '../VendorEngineers/useTeamServices';

const STATUS = {
  in_stock: { label: 'In stock', cls: 'bg-emerald-50 text-emerald-700' },
  low_stock: { label: 'Low', cls: 'bg-amber-50 text-amber-800' },
  out_of_stock: { label: 'Out of stock', cls: 'bg-red-50 text-red-700' },
  damaged: { label: 'Damaged', cls: 'bg-gray-100 text-gray-600' },
  reserved: { label: 'Reserved', cls: 'bg-blue-50 text-blue-700' },
  allocated: { label: 'Allocated', cls: 'bg-blue-50 text-blue-700' }
};
const MOVE_LABEL = { create: 'Added', restock: 'Restocked', correction: 'Count corrected', damaged: 'Damaged', reserve: 'Reserved for job', release: 'Released from job', use: 'Used on job' };
const input = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none';

/** Add a stock item (optionally pre-filled from a WBI catalog part). */
export const AddItemModal = ({ preset = null, onClose, onSaved }) => {
  const services = useTeamServices();
  const [f, setF] = useState({
    name: preset?.name || '', serviceKey: '', quantity: 0, reorderLevel: 5,
    unitCost: preset?.price ?? '', unit: 'pcs', hsnCode: preset?.hsnCode || '', category: preset?.category?.name || ''
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const serviceKey = f.serviceKey || services[0]?.serviceKey || '';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createInventoryItem({
        ...(preset?.id ? { catalogPartId: preset.id } : { name: f.name.trim() }),
        serviceKey, quantity: Number(f.quantity), reorderLevel: Number(f.reorderLevel),
        ...(f.unitCost !== '' ? { unitCost: Number(f.unitCost) } : {}),
        unit: f.unit, hsnCode: f.hsnCode, category: f.category || undefined
      });
      toast.success(res.message || 'Item added');
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add the item'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={preset ? `Stock ${preset.name}` : 'Add inventory item'}
      subtitle="Free stock can be reserved for jobs and is deducted when parts are used."
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" form="add-item-form" disabled={busy} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add to inventory</button>
        </>
      )}
    >
      <form id="add-item-form" onSubmit={submit} className="grid grid-cols-2 gap-3">
        {!preset && <label className="block col-span-2"><span className="block text-xs font-bold text-gray-700 mb-1">Part name</span><input required minLength={2} value={f.name} onChange={set('name')} className={input} /></label>}
        <label className="block col-span-2"><span className="block text-xs font-bold text-gray-700 mb-1">Service</span>
          <select value={serviceKey} onChange={set('serviceKey')} className={input}>{services.map((s) => <option key={s.serviceKey} value={s.serviceKey}>{s.serviceName}</option>)}</select>
        </label>
        <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">Opening stock</span><input type="number" min="0" step="1" value={f.quantity} onChange={set('quantity')} className={input} /></label>
        <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">Reorder at</span><input type="number" min="0" step="1" value={f.reorderLevel} onChange={set('reorderLevel')} className={input} /></label>
        <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">Unit cost ₹</span><input type="number" min="0" step="0.01" value={f.unitCost} onChange={set('unitCost')} className={input} /></label>
        <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">Unit</span><input value={f.unit} onChange={set('unit')} className={input} /></label>
        {!preset && <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">HSN (optional)</span><input value={f.hsnCode} onChange={set('hsnCode')} className={input} /></label>}
        {!preset && <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">Category (optional)</span><input value={f.category} onChange={set('category')} className={input} /></label>}
      </form>
    </Modal>
  );
};

const ACTIONS = {
  restock: { title: 'Restock', label: 'Quantity received', noteLabel: 'Note (PO / supplier)', needNote: false },
  correct: { title: 'Correct stock count', label: 'Counted free stock', noteLabel: 'Why (e.g. physical count)', needNote: true },
  damaged: { title: 'Write off damaged stock', label: 'Quantity damaged', noteLabel: 'What happened', needNote: true },
  edit: { title: 'Edit item', label: null, noteLabel: null, needNote: false }
};

const AdjustModal = ({ item, action, onClose, onSaved }) => {
  const cfg = ACTIONS[action];
  const [f, setF] = useState({ quantity: action === 'correct' ? item.available : 1, note: '', reorderLevel: item.reorderLevel, unitCost: item.unitCost });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = action === 'edit'
        ? { action, reorderLevel: Number(f.reorderLevel), unitCost: Number(f.unitCost) }
        : { action, quantity: Number(f.quantity), note: f.note.trim() };
      await adjustInventoryItem(item.id, body);
      toast.success(`${item.name} updated`);
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update stock'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`${cfg.title} · ${item.name}`}
      subtitle={`${item.available} ${item.unit} free · ${item.reserved} reserved for jobs`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" form="adjust-form" disabled={busy || (cfg.needNote && f.note.trim().length < 3)} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save</button>
        </>
      )}
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-3">
        {action === 'edit' ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">Reorder at</span><input type="number" min="0" step="1" value={f.reorderLevel} onChange={set('reorderLevel')} className={input} /></label>
            <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">Unit cost ₹</span><input type="number" min="0" step="0.01" value={f.unitCost} onChange={set('unitCost')} className={input} /></label>
          </div>
        ) : (
          <>
            <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">{cfg.label}</span><input type="number" min={action === 'correct' ? 0 : 1} step="1" value={f.quantity} onChange={set('quantity')} className={input} /></label>
            <label className="block"><span className="block text-xs font-bold text-gray-700 mb-1">{cfg.noteLabel}{cfg.needNote ? '' : ' — optional'}</span><input value={f.note} onChange={set('note')} maxLength={200} className={input} /></label>
          </>
        )}
      </form>
    </Modal>
  );
};

const MovementsModal = ({ item, onClose }) => {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    getInventoryMovements(item.id).then((r) => setRows(r.data || [])).catch((err) => { toast.error(errorMessage(err)); setRows([]); });
  }, [item.id]);
  return (
    <Modal title={`Stock history · ${item.name}`} subtitle="Every change made through the Parts section" onClose={onClose} footer={<button type="button" onClick={onClose} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold">Close</button>}>
      {rows === null ? <Skeleton rows={4} /> : !rows.length ? <p className="text-xs text-gray-500">No movements recorded yet.</p> : (
        <ul className="divide-y divide-gray-100 text-xs">
          {rows.map((m) => (
            <li key={m.id} className="py-2 flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-gray-900">{MOVE_LABEL[m.type] || m.type}{m.jobCode ? <span className="font-mono font-normal"> · {m.jobCode}</span> : ''}</p>
                <p className="text-gray-500">{m.quantityDelta ? `${m.quantityDelta > 0 ? '+' : ''}${m.quantityDelta} free` : ''}{m.reservedDelta ? ` ${m.reservedDelta > 0 ? '+' : ''}${m.reservedDelta} reserved` : ''} → {m.balanceAfter} free{m.note ? ` · ${m.note}` : ''}</p>
              </div>
              <span className="text-gray-400 whitespace-nowrap">{formatDateTime(m.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

/** Your spare-parts stock: free, reserved for jobs, and when to reorder. */
const Inventory = () => {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: '', rows: [], summary: {}, pagination: {} });
  const [adding, setAdding] = useState(false);
  const [adjust, setAdjust] = useState(null);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const res = await getInventory({ page, limit: 25, ...(status ? { status } : {}), ...(debounced ? { search: debounced } : {}) });
      setState({ loading: false, error: '', rows: res.data || [], summary: res.summary || {}, pagination: res.pagination || {} });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load inventory') }));
    }
  }, [page, status, debounced]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const s = state.summary;
  const filterChip = (key, label, n) => (
    <button type="button" onClick={() => { setParams(key ? { status: key } : {}); setPage(1); }} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${status === key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>{label}{n !== undefined ? ` ${n}` : ''}</button>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Parts"
        title="Inventory"
        subtitle="Your spare-parts stock. “Free” can be reserved for jobs; reserved stock is held until the part is used or the job is cancelled."
        actions={(
          <>
            <button type="button" onClick={() => setAdding(true)} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add item</button>
            <RefreshButton onClick={load} spinning={false} />
          </>
        )}
      />

      {state.loading ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Items" value={s.items} />
            <StatCard label="Low stock" value={s.lowStock} tone={s.lowStock ? 'amber' : 'gray'} />
            <StatCard label="Out of stock" value={s.outOfStock} tone={s.outOfStock ? 'red' : 'gray'} />
            <StatCard label="Stock value" value={formatINR(s.stockValue)} tone="blue" />
          </div>
          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU, category, HSN…" aria-label="Search inventory" className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm" />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {filterChip('', 'All', s.items)}
              {filterChip('low_stock', 'Low', s.lowStock)}
              {filterChip('out_of_stock', 'Out', s.outOfStock)}
              {filterChip('in_stock', 'In stock')}
            </div>
          </div>

          {!state.rows.length ? (
            <EmptyState title={status || debounced ? 'No items match' : 'No stock yet'} message="Add the parts you keep, or stock a part straight from the WBI catalog under Parts." action={<button type="button" onClick={() => setAdding(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">Add item</button>} />
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                    <tr><th className="px-4 py-3">Item</th><th className="px-3 py-3">Service</th><th className="px-3 py-3 text-right">Free</th><th className="px-3 py-3 text-right">Reserved</th><th className="px-3 py-3 text-right">Reorder at</th><th className="px-3 py-3 text-right">Unit cost</th><th className="px-3 py-3 text-right">Value</th><th className="px-3 py-3">Status</th><th className="px-3 py-3" /></tr>
                  </thead>
                  <tbody>
                    {state.rows.map((i) => (
                      <tr key={i.id} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-2.5"><p className="font-bold text-gray-900">{i.name}</p><p className="text-gray-500 font-mono">{i.sku}{i.hsnCode ? ` · HSN ${i.hsnCode}` : ''}</p>{i.warehouse && <p className="text-gray-500">{i.warehouse}</p>}</td>
                        <td className="px-3 py-2.5">{i.serviceName}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold">{i.available} {i.unit}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{i.reserved}{i.reservedForJobs ? <p className="text-gray-500">{i.reservedForJobs} job(s)</p> : null}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{i.reorderLevel}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(i.unitCost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(i.stockValue)}</td>
                        <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full font-bold ${STATUS[i.stockStatus]?.cls || ''}`}>{STATUS[i.stockStatus]?.label || i.stockStatus}</span></td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap justify-end gap-1">
                            <button type="button" onClick={() => setAdjust({ item: i, action: 'restock' })} title="Restock" aria-label={`Restock ${i.name}`} className="p-1.5 border border-emerald-200 text-emerald-700 rounded-lg"><PackagePlus className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => setAdjust({ item: i, action: 'correct' })} title="Correct count" aria-label={`Correct count of ${i.name}`} className="p-1.5 border border-gray-200 text-gray-700 rounded-lg"><ClipboardCheck className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => setAdjust({ item: i, action: 'damaged' })} title="Damaged" aria-label={`Write off damaged ${i.name}`} className="p-1.5 border border-red-200 text-red-700 rounded-lg"><AlertOctagon className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => setAdjust({ item: i, action: 'edit' })} title="Edit" aria-label={`Edit ${i.name}`} className="p-1.5 border border-gray-200 text-gray-700 rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => setHistory(i)} title="Stock history" aria-label={`Stock history of ${i.name}`} className="p-1.5 border border-gray-200 text-gray-700 rounded-lg"><History className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={state.pagination.page} totalPages={state.pagination.totalPages} total={state.pagination.total} onPage={setPage} />
            </>
          )}
        </>
      )}

      {adding && <AddItemModal onClose={() => setAdding(false)} onSaved={load} />}
      {adjust && <AdjustModal item={adjust.item} action={adjust.action} onClose={() => setAdjust(null)} onSaved={load} />}
      {history && <MovementsModal item={history} onClose={() => setHistory(null)} />}
    </div>
  );
};

export default Inventory;
