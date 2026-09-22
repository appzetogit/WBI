import React, { useCallback, useEffect, useState } from 'react';
import { FiFileText, FiLoader, FiPlus, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import CardShell from '../UserCategories/components/CardShell';

/**
 * Admin contracts.
 *
 * A contract is the top of the pricing chain and the source of a company's
 * allowed services, SLA and payment terms. Activating one supersedes the
 * company's previous contract; terminating one needs a stated reason.
 */

const STATUS_STYLE = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  DRAFT: 'bg-gray-100 text-gray-600',
  EXPIRED: 'bg-amber-50 text-amber-700',
  TERMINATED: 'bg-red-50 text-red-600'
};

const emptyContract = {
  companyId: '',
  contractCode: '',
  title: '',
  services: '',
  validFrom: new Date().toISOString().slice(0, 10),
  validTo: '',
  pricing: [{ serviceKey: '', baseAmount: 0, taxPercent: 18 }],
  sla: { assignmentMinutes: '', acceptanceMinutes: '', arrivalMinutes: '', resolutionMinutes: '' },
  paymentTerms: { mode: 'PREPAID_WALLET', minimumWalletBalance: 0, reservationRequired: true }
};

const B2BContracts = () => {
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(emptyContract);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [c, comp] = await Promise.all([
        api.get('/admin/b2b/contracts', { params: { limit: 100 } }),
        api.get('/admin/b2b-companies', { params: { limit: 100 } })
      ]);
      setContracts(c.data?.data || []);
      setCompanies(comp.data?.companies || comp.data?.data || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const create = async () => {
    try {
      setSaving(true);
      await api.post('/admin/b2b/contracts', {
        ...form,
        services: String(form.services || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        pricing: form.pricing
          .filter((p) => p.serviceKey)
          .map((p) => ({ ...p, serviceKey: p.serviceKey.toUpperCase().trim(), baseAmount: Number(p.baseAmount) })),
        sla: Object.fromEntries(
          Object.entries(form.sla).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])
        ),
        validTo: form.validTo || null
      });
      toast.success('Contract created as a draft');
      setForm(emptyContract);
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not create the contract');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (contract, status) => {
    let reason = '';
    if (status === 'TERMINATED') {
      reason = window.prompt('Why is this contract being terminated?') || '';
      if (!reason.trim()) return;
    }
    try {
      await api.post(`/admin/b2b/contracts/${contract._id}/status`, { status, reason });
      toast.success(`Contract is now ${status}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not change the status');
    }
  };

  const field = (label, value, onChange, type = 'text') => (
    <label className="block">
      <span className="text-[11px] font-semibold text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
    </label>
  );

  return (
    <div className="space-y-6">
      <CardShell icon={FiFileText} title="B2B contracts">
        {loading ? (
          <div className="flex justify-center py-16">
            <FiLoader className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : contracts.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">No contracts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-3 pr-4">Contract</th>
                  <th className="py-3 pr-4">Company</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Services</th>
                  <th className="py-3 pr-4">Priced</th>
                  <th className="py-3 pr-4">Valid</th>
                  <th className="py-3" />
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c._id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-semibold text-gray-800">
                      {c.contractCode}
                      {c.inForce && <span className="ml-2 text-[10px] font-bold text-emerald-600">in force</span>}
                    </td>
                    <td className="py-3 pr-4">{c.company?.companyName || '—'}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[c.status] || ''}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{c.serviceCount}</td>
                    <td className="py-3 pr-4">{c.pricedServices}</td>
                    <td className="py-3 pr-4 text-gray-500">
                      {c.validFrom ? new Date(c.validFrom).toLocaleDateString('en-IN') : '—'}
                      {c.validTo ? ` → ${new Date(c.validTo).toLocaleDateString('en-IN')}` : ' → open'}
                    </td>
                    <td className="py-3 space-x-2 whitespace-nowrap">
                      {c.status !== 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => setStatus(c, 'ACTIVE')}
                          className="text-emerald-600 hover:text-emerald-700"
                          title="Activate (supersedes the previous contract)"
                        >
                          <FiCheckCircle />
                        </button>
                      )}
                      {c.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => setStatus(c, 'TERMINATED')}
                          className="text-red-500 hover:text-red-600"
                          title="Terminate"
                        >
                          <FiXCircle />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardShell>

      <CardShell icon={FiPlus} title="New contract">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500">Company</span>
            <select
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Pick a company</option>
              {companies.map((c) => (
                <option key={c._id || c.id} value={c._id || c.id}>{c.companyName}</option>
              ))}
            </select>
          </label>
          {field('Contract code', form.contractCode, (v) => setForm({ ...form, contractCode: v }))}
          {field('Title', form.title, (v) => setForm({ ...form, title: v }))}
          {field('Service keys (comma separated)', form.services, (v) => setForm({ ...form, services: v }))}
          {field('Valid from', form.validFrom, (v) => setForm({ ...form, validFrom: v }), 'date')}
          {field('Valid to (optional)', form.validTo, (v) => setForm({ ...form, validTo: v }), 'date')}
        </div>

        <p className="text-[11px] font-semibold text-gray-500 mt-5 mb-2">Contract prices (these override everything else)</p>
        {form.pricing.map((row, i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
            {field('Service key', row.serviceKey, (v) => {
              const next = [...form.pricing];
              next[i] = { ...row, serviceKey: v };
              setForm({ ...form, pricing: next });
            })}
            {field('Base amount', row.baseAmount, (v) => {
              const next = [...form.pricing];
              next[i] = { ...row, baseAmount: v };
              setForm({ ...form, pricing: next });
            }, 'number')}
            {field('Tax %', row.taxPercent, (v) => {
              const next = [...form.pricing];
              next[i] = { ...row, taxPercent: v };
              setForm({ ...form, pricing: next });
            }, 'number')}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setForm({ ...form, pricing: [...form.pricing, { serviceKey: '', baseAmount: 0, taxPercent: 18 }] })}
          className="text-xs font-semibold text-gray-600 underline"
        >
          Add another priced service
        </button>

        <p className="text-[11px] font-semibold text-gray-500 mt-5 mb-2">SLA (minutes, blank uses the platform profile)</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {['assignmentMinutes', 'acceptanceMinutes', 'arrivalMinutes', 'resolutionMinutes'].map((k) =>
            field(k.replace('Minutes', ''), form.sla[k], (v) => setForm({ ...form, sla: { ...form.sla, [k]: v } }), 'number'))}
        </div>

        <button
          type="button"
          onClick={create}
          disabled={saving}
          className="mt-5 bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:bg-gray-300"
        >
          {saving ? 'Saving…' : 'Create draft contract'}
        </button>
      </CardShell>
    </div>
  );
};

export default B2BContracts;
