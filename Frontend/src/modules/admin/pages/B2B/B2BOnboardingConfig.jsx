import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminOnboardingConfig,
  adminUpdateOnboardingConfig,
  adminSyncCatalog
} from '../../../b2b/services/b2bOnboardingApi';

export default function B2BOnboardingConfigPage() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [jsonDraft, setJsonDraft] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    const res = await adminOnboardingConfig();
    setConfig(res.data.data);
    setJsonDraft(JSON.stringify({
      documentTemplates: res.data.data.documentTemplates,
      serviceCatalog: res.data.data.serviceCatalog,
      slaTemplates: res.data.data.slaTemplates,
      projectTemplates: res.data.data.projectTemplates,
      approvalTemplates: res.data.data.approvalTemplates,
      paymentRules: res.data.data.paymentRules,
      activationRules: res.data.data.activationRules
    }, null, 2));
  };

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const body = JSON.parse(jsonDraft);
      const res = await adminUpdateOnboardingConfig(body);
      setConfig(res.data.data);
      window.alert('Configuration saved');
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Invalid JSON');
    } finally {
      setSaving(false);
    }
  };

  const syncCatalog = async () => {
    await adminSyncCatalog();
    await load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Onboarding configuration</h1>
          <p className="text-sm text-gray-500">Document templates, services, SLA, approvals, activation rules (version {config?.version ?? '—'})</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/b2b/onboarding" className="text-sm text-teal-700 hover:underline">Review queue</Link>
          <button type="button" onClick={syncCatalog} className="px-3 py-2 border rounded-lg text-sm">Sync service catalog</button>
          <button type="button" disabled={saving} onClick={save} className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save config'}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>}

      <p className="text-xs text-gray-500">
        Edit JSON below. Service catalog merges with platform ServiceConfig and RegistrationTemplate on sync.
      </p>

      <textarea
        className="w-full h-[70vh] font-mono text-xs border rounded-xl p-4"
        value={jsonDraft}
        onChange={(e) => setJsonDraft(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
