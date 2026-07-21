import React, { useEffect, useState } from 'react';
import { FiSave, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  listAssignmentConfigs,
  upsertAssignmentConfig
} from '../../services/assignmentConfigService';

const emptyForm = () => ({
  categoryCode: 'DEFAULT',
  label: 'Default assignment rules',
  isActive: true,
  vendorResponseTimeoutMinutes: 120,
  maxVendorsToNotify: 10,
  vendorRetryCount: 3,
  priorityMode: 'vendor_then_freelancer',
  releaseToFreelancerOnVendorExhausted: true,
  freelancerPoolVendorId: '',
  scoringWeights: {
    location: 30,
    service: 25,
    capacity: 20,
    rating: 15,
    responseScore: 10
  }
});

const AssignmentConfig = () => {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const load = async () => {
    setLoading(true);
    try {
      const res = await listAssignmentConfigs();
      const list = res.data || [];
      setConfigs(list);
      const def = list.find((c) => c.categoryCode === 'DEFAULT') || list[0];
      if (def) {
        setForm({
          ...emptyForm(),
          ...def,
          freelancerPoolVendorId: def.freelancerPoolVendorId ? String(def.freelancerPoolVendorId) : ''
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load assignment configs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectConfig = (code) => {
    const found = configs.find((c) => c.categoryCode === code);
    if (found) {
      setForm({
        ...emptyForm(),
        ...found,
        freelancerPoolVendorId: found.freelancerPoolVendorId ? String(found.freelancerPoolVendorId) : ''
      });
    } else {
      setForm({ ...emptyForm(), categoryCode: code.toUpperCase() });
    }
  };

  const handleWeight = (key, value) => {
    setForm((prev) => ({
      ...prev,
      scoringWeights: { ...prev.scoringWeights, [key]: Number(value) || 0 }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        categoryCode: String(form.categoryCode || 'DEFAULT').toUpperCase(),
        freelancerPoolVendorId: form.freelancerPoolVendorId?.trim() || null
      };
      const res = await upsertAssignmentConfig(payload.categoryCode, payload);
      toast.success('Assignment rules saved');
      if (res.data) {
        setConfigs((prev) => {
          const next = prev.filter((c) => c.categoryCode !== res.data.categoryCode);
          return [...next, res.data].sort((a, b) => a.categoryCode.localeCompare(b.categoryCode));
        });
        setForm({
          ...form,
          ...res.data,
          freelancerPoolVendorId: res.data.freelancerPoolVendorId ? String(res.data.freelancerPoolVendorId) : ''
        });
      } else {
        load();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project assignment engine</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vendor queue timeouts, freelancer pool, and scoring. Set{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">FREELANCER_POOL_VENDOR_ID</code> in env as fallback.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {configs.map((c) => (
          <button
            key={c.categoryCode}
            type="button"
            onClick={() => selectConfig(c.categoryCode)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
              form.categoryCode === c.categoryCode
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-700 border-gray-200'
            }`}
          >
            {c.categoryCode}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setForm(emptyForm())}
          className="px-3 py-1.5 text-xs font-semibold rounded-full border border-dashed border-gray-300 text-gray-600"
        >
          + New category code
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Category code</span>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm uppercase"
                value={form.categoryCode}
                onChange={(e) => setForm({ ...form, categoryCode: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Label</span>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active for this category
          </label>

          <div className="grid md:grid-cols-3 gap-4">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Vendor response (minutes)</span>
              <input
                type="number"
                min={5}
                max={1440}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={form.vendorResponseTimeoutMinutes}
                onChange={(e) => setForm({ ...form, vendorResponseTimeoutMinutes: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Max vendors to notify</span>
              <input
                type="number"
                min={1}
                max={50}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={form.maxVendorsToNotify}
                onChange={(e) => setForm({ ...form, maxVendorsToNotify: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Vendor retry count</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={form.vendorRetryCount}
                onChange={(e) => setForm({ ...form, vendorRetryCount: e.target.value })}
              />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Priority mode</span>
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={form.priorityMode}
                onChange={(e) => setForm({ ...form, priorityMode: e.target.value })}
              >
                <option value="vendor_then_freelancer">Vendor first, then freelancer pool</option>
                <option value="vendor_first">Vendor only</option>
                <option value="freelancer_only">Freelancer pool only</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Freelancer pool vendor ID (Mongo)</span>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono text-xs"
                placeholder="Platform vendor _id for ops projects"
                value={form.freelancerPoolVendorId}
                onChange={(e) => setForm({ ...form, freelancerPoolVendorId: e.target.value })}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.releaseToFreelancerOnVendorExhausted}
              onChange={(e) => setForm({ ...form, releaseToFreelancerOnVendorExhausted: e.target.checked })}
            />
            Release to freelancer pool when vendor queue is exhausted
          </label>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Scoring weights (relative)</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Object.entries(form.scoringWeights || {}).map(([key, val]) => (
                <label key={key} className="text-xs">
                  <span className="capitalize text-gray-600">{key}</span>
                  <input
                    type="number"
                    min={0}
                    className="mt-0.5 w-full border rounded px-2 py-1"
                    value={val}
                    onChange={(e) => handleWeight(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-60"
          >
            <FiSave /> {saving ? 'Saving…' : 'Save rules'}
          </button>
        </div>
      )}
    </div>
  );
};

export default AssignmentConfig;
