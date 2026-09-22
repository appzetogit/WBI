import React, { useCallback, useEffect, useState } from 'react';
import { FiTag, FiLoader, FiPlus, FiTrash2, FiPlayCircle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import CardShell from '../UserCategories/components/CardShell';

/**
 * Admin pricing matrix.
 *
 * Rules are resolved contract → company → default; this screen edits the
 * COMPANY and DEFAULT levels (contract prices live on the contract itself).
 * All arithmetic is the backend's: the preview here calls the same engine the
 * bulk upload uses, so what an admin sees is what a company is charged.
 */

const LEVELS = [
  { key: 'DEFAULT', label: 'Default matrix', hint: 'Applies to every company with no closer rule.' },
  { key: 'COMPANY', label: 'Company profile', hint: 'Applies to one company or one named pricing profile.' }
];

const emptyRule = {
  name: '',
  level: 'DEFAULT',
  serviceKey: '',
  pricingProfile: '',
  baseAmount: 0,
  geographicSurcharge: 0,
  priorityCharges: { Low: 0, Medium: 0, High: 0 },
  slaCharge: 0,
  emergencyCharge: 0,
  afterHoursCharge: 0,
  taxPercent: 18,
  region: { cities: [], pincodePrefixes: [] },
  isActive: true
};

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const B2BPricing = () => {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(emptyRule);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewCtx, setPreviewCtx] = useState({ serviceKey: '', city: '', pincode: '', priority: 'Medium' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/b2b/pricing-rules', { params: { limit: 100 } });
      setRules(res.data?.data || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load pricing rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const save = async () => {
    if (!form.name.trim()) return toast.error('Give the rule a name');
    if (!form.serviceKey.trim()) return toast.error('A rule must name the service key it prices');
    try {
      setSaving(true);
      await api.post('/admin/b2b/pricing-rules', {
        ...form,
        serviceKey: form.serviceKey.toUpperCase().trim(),
        region: {
          cities: String(form.region.cities || '').split(',').map((c) => c.trim()).filter(Boolean),
          pincodePrefixes: String(form.region.pincodePrefixes || '').split(',').map((c) => c.trim()).filter(Boolean)
        }
      });
      toast.success('Pricing rule created');
      setForm(emptyRule);
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not create the rule');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/admin/b2b/pricing-rules/${id}`);
      toast.success('Rule removed');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not remove the rule');
    }
  };

  const runPreview = async () => {
    try {
      const res = await api.post('/admin/b2b/pricing-rules/preview', {
        serviceKey: previewCtx.serviceKey.toUpperCase().trim(),
        city: previewCtx.city || undefined,
        pincode: previewCtx.pincode || undefined,
        priority: previewCtx.priority,
        quantity: 1
      });
      setPreview(res.data?.data || null);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Preview failed');
    }
  };

  const field = (label, value, onChange, type = 'text') => (
    <label className="block">
      <span className="text-[11px] font-semibold text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
    </label>
  );

  return (
    <div className="space-y-6">
      <CardShell icon={FiTag} title="B2B pricing matrix">
        <p className="text-xs text-gray-500 mb-4">
          Resolution order is fixed: a contract override wins, then a company or
          profile rule, then the default matrix. Prices are never set in the panel.
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <FiLoader className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">No pricing rules yet — the legacy flat rate applies.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-3 pr-4">Rule</th>
                  <th className="py-3 pr-4">Level</th>
                  <th className="py-3 pr-4">Service key</th>
                  <th className="py-3 pr-4">Scope</th>
                  <th className="py-3 pr-4">Base</th>
                  <th className="py-3 pr-4">Priority (L/M/H)</th>
                  <th className="py-3 pr-4">SLA · Emergency · After hours</th>
                  <th className="py-3 pr-4">Tax</th>
                  <th className="py-3" />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r._id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-semibold text-gray-800">{r.name}</td>
                    <td className="py-3 pr-4">{r.level || (r.companyId ? 'COMPANY' : 'DEFAULT')}</td>
                    <td className="py-3 pr-4">{r.serviceKey || r.service || 'any'}</td>
                    <td className="py-3 pr-4 text-gray-500">
                      {[r.pricingProfile, ...(r.region?.cities || []), ...(r.region?.pincodePrefixes || [])]
                        .filter(Boolean).join(', ') || 'everywhere'}
                    </td>
                    <td className="py-3 pr-4">{money(r.baseAmount)}</td>
                    <td className="py-3 pr-4">
                      {money(r.priorityCharges?.Low)} / {money(r.priorityCharges?.Medium)} / {money(r.priorityCharges?.High)}
                    </td>
                    <td className="py-3 pr-4">
                      {money(r.slaCharge)} · {money(r.emergencyCharge)} · {money(r.afterHoursCharge)}
                    </td>
                    <td className="py-3 pr-4">{r.taxPercent}%</td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => remove(r._id)}
                        className="text-red-500 hover:text-red-600"
                        title="Remove this rule"
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardShell>

      <CardShell icon={FiPlus} title="Add a pricing rule">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {field('Name', form.name, (v) => setForm({ ...form, name: v }))}
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500">Level</span>
            <select
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              {LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
            <span className="text-[10px] text-gray-400">{LEVELS.find((l) => l.key === form.level)?.hint}</span>
          </label>
          {field('Service key', form.serviceKey, (v) => setForm({ ...form, serviceKey: v }))}
          {field('Pricing profile (optional)', form.pricingProfile, (v) => setForm({ ...form, pricingProfile: v }))}
          {field('Cities (comma separated)', form.region.cities, (v) => setForm({ ...form, region: { ...form.region, cities: v } }))}
          {field('Pincode prefixes', form.region.pincodePrefixes, (v) => setForm({ ...form, region: { ...form.region, pincodePrefixes: v } }))}
          {field('Base amount', form.baseAmount, (v) => setForm({ ...form, baseAmount: v }), 'number')}
          {field('Geographic surcharge', form.geographicSurcharge, (v) => setForm({ ...form, geographicSurcharge: v }), 'number')}
          {field('Tax %', form.taxPercent, (v) => setForm({ ...form, taxPercent: v }), 'number')}
          {field('Priority — Low', form.priorityCharges.Low, (v) => setForm({ ...form, priorityCharges: { ...form.priorityCharges, Low: v } }), 'number')}
          {field('Priority — Medium', form.priorityCharges.Medium, (v) => setForm({ ...form, priorityCharges: { ...form.priorityCharges, Medium: v } }), 'number')}
          {field('Priority — High', form.priorityCharges.High, (v) => setForm({ ...form, priorityCharges: { ...form.priorityCharges, High: v } }), 'number')}
          {field('SLA charge', form.slaCharge, (v) => setForm({ ...form, slaCharge: v }), 'number')}
          {field('Emergency charge', form.emergencyCharge, (v) => setForm({ ...form, emergencyCharge: v }), 'number')}
          {field('After-hours charge', form.afterHoursCharge, (v) => setForm({ ...form, afterHoursCharge: v }), 'number')}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-4 bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:bg-gray-300"
        >
          {saving ? 'Saving…' : 'Create rule'}
        </button>
      </CardShell>

      <CardShell icon={FiPlayCircle} title="Price a job (preview)">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {field('Service key', previewCtx.serviceKey, (v) => setPreviewCtx({ ...previewCtx, serviceKey: v }))}
          {field('City', previewCtx.city, (v) => setPreviewCtx({ ...previewCtx, city: v }))}
          {field('Pincode', previewCtx.pincode, (v) => setPreviewCtx({ ...previewCtx, pincode: v }))}
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500">Priority</span>
            <select
              value={previewCtx.priority}
              onChange={(e) => setPreviewCtx({ ...previewCtx, priority: e.target.value })}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              {['Low', 'Medium', 'High'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={runPreview}
          className="mt-4 border border-gray-300 text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Show the price
        </button>

        {preview && (
          <div className="mt-4 border border-gray-100 rounded-xl p-4 text-sm">
            <p className="font-semibold text-gray-800">
              {preview.ruleName} · resolved at {preview.level}
            </p>
            <ul className="mt-2 space-y-1 text-gray-600">
              <li>Base {money(preview.perJob.baseAmount)}</li>
              <li>Geographic {money(preview.perJob.geographicCharge)}</li>
              <li>Priority {money(preview.perJob.priorityCharge)}</li>
              <li>SLA {money(preview.perJob.slaCharge)}</li>
              <li>Emergency {money(preview.perJob.emergencyCharge)}</li>
              <li>After hours {money(preview.perJob.afterHoursCharge)}</li>
              <li>Tax ({preview.perJob.taxPercent}%) {money(preview.perJob.taxAmount)}</li>
            </ul>
            <p className="mt-2 font-bold text-gray-900">Total {money(preview.perJob.total)}</p>
          </div>
        )}
      </CardShell>
    </div>
  );
};

export default B2BPricing;
