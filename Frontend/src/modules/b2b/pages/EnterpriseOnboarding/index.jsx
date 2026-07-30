import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchMyOnboarding,
  fetchOnboardingConfig,
  saveOnboardingStep,
  submitOnboarding,
  fetchActivationStatus,
  registerDocument,
  verifyGst,
  verifyPan,
  verifyCin,
  verifyBank,
  sendContactOtp,
  confirmContactOtp,
  signSla,
  createOnboardingBranch,
  fetchOnboardingBranches,
  deleteOnboardingBranch,
  uploadB2BFile
} from '../../services/b2bOnboardingApi';

const STEP_LABELS = [
  'Company',
  'Addresses',
  'Primary Contact',
  'Finance Contact',
  'Services',
  'Coverage',
  'Banking',
  'Credit',
  'Payments',
  'SLA',
  'Approvals',
  'Bulk Projects',
  'Compliance',
  'KYC & Docs',
  'Review',
  'Submit'
];

const inputClass = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-teal-500 outline-none text-sm';

function StatusPill({ status }) {
  const color = status === 'verified' ? 'bg-emerald-100 text-emerald-800' : status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{status || 'pending'}</span>;
}

export default function EnterpriseOnboarding() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [activation, setActivation] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchForm, setBranchForm] = useState({ branchName: '', address: '', city: '', state: '', pincode: '', contactPerson: '', contactPhone: '' });
  const [form, setForm] = useState({
    companyInfo: {},
    addresses: {},
    primaryContact: {},
    financeContact: {},
    serviceRequirements: { selectedServices: [] },
    operationalCoverage: {},
    banking: {},
    creditProfile: {},
    escrowPaymentRules: {},
    slaConfig: {},
    approvalHierarchy: {},
    bulkProjectSettings: {},
    compliance: {}
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cfgRes, stateRes, actRes] = await Promise.all([
        fetchOnboardingConfig(),
        fetchMyOnboarding(),
        fetchActivationStatus()
      ]);
      setConfig(cfgRes.data.data);
      const st = stateRes.data.data;
      setOnboarding(st.onboarding);
      setDocuments(st.documents || []);
      setStep(st.onboarding?.currentStep || 1);
      setForm((prev) => ({
        ...prev,
        companyInfo: st.onboarding?.companyInfo || prev.companyInfo,
        addresses: st.onboarding?.addresses || prev.addresses,
        primaryContact: st.onboarding?.primaryContact || prev.primaryContact,
        financeContact: st.onboarding?.financeContact || prev.financeContact,
        serviceRequirements: st.onboarding?.serviceRequirements || prev.serviceRequirements,
        operationalCoverage: st.onboarding?.operationalCoverage || prev.operationalCoverage,
        banking: st.onboarding?.banking || prev.banking,
        creditProfile: st.onboarding?.creditProfile || prev.creditProfile,
        escrowPaymentRules: st.onboarding?.escrowPaymentRules || prev.escrowPaymentRules,
        slaConfig: st.onboarding?.slaConfig || prev.slaConfig,
        approvalHierarchy: st.onboarding?.approvalHierarchy || prev.approvalHierarchy,
        bulkProjectSettings: st.onboarding?.bulkProjectSettings || prev.bulkProjectSettings,
        compliance: st.onboarding?.compliance || prev.compliance
      }));
      setActivation(actRes.data.data);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load onboarding');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === 6) {
      fetchOnboardingBranches().then((r) => setBranches(r.data.data || [])).catch(() => {});
    }
  }, [step]);

  useEffect(() => { load(); }, [load]);

  const addBranch = async () => {
    await createOnboardingBranch(branchForm);
    const r = await fetchOnboardingBranches();
    setBranches(r.data.data || []);
    setBranchForm({ branchName: '', address: '', city: '', state: '', pincode: '', contactPerson: '', contactPhone: '' });
    await load();
  };

  const removeBranch = async (id) => {
    await deleteOnboardingBranch(id);
    const r = await fetchOnboardingBranches();
    setBranches(r.data.data || []);
    await load();
  };

  const stepPayload = useMemo(() => {
    const map = {
      1: form.companyInfo,
      2: form.addresses,
      3: form.primaryContact,
      4: form.financeContact,
      5: form.serviceRequirements,
      6: form.operationalCoverage,
      7: form.banking,
      8: form.creditProfile,
      9: form.escrowPaymentRules,
      10: form.slaConfig,
      11: form.approvalHierarchy,
      12: form.bulkProjectSettings,
      13: form.compliance,
      14: {},
      15: {},
      16: {}
    };
    return map[step] || {};
  }, [step, form]);

  const persistStep = async () => {
    setSaving(true);
    setError('');
    try {
      if (step <= 13) {
        await saveOnboardingStep(step, stepPayload);
      }
      if (step === 10 && form.slaConfig?.acceptTerms) {
        await signSla({ method: 'clickwrap', accepted: true });
      }
      if (step === 16) {
        await submitOnboarding();
        await load();
        navigate('/b2b/dashboard');
        return;
      }
      setStep((s) => Math.min(16, s + 1));
      await load();
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleService = (svc) => {
    setForm((f) => {
      const list = [...(f.serviceRequirements.selectedServices || [])];
      const key = svc.key;
      const idx = list.findIndex((s) => (s.key || s) === key);
      if (idx >= 0) list.splice(idx, 1);
      else list.push({ key, name: svc.name });
      return { ...f, serviceRequirements: { ...f.serviceRequirements, selectedServices: list } };
    });
  };

  const handleDocUpload = async (docKey, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const up = await uploadB2BFile(fd);
    const url = up.data.fileUrl || up.data.imageUrl;
    const label = config?.documentTemplates?.find((d) => d.key === docKey)?.label || docKey;
    await registerDocument({ documentKey: docKey, documentLabel: label, fileUrl: url, fileKey: up.data.fileKey });
    await load();
  };

  const kyc = onboarding?.kycFlags || {};
  const requiredDocs = onboarding?.requiredDocumentKeys?.length
    ? onboarding.requiredDocumentKeys
    : (config?.documentTemplates || []).filter((d) => d.required).map((d) => d.key);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0FDFA] p-6">
        <p className="text-gray-500">Loading enterprise onboarding…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0FDFA] p-4 md:p-8">
      <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto">
        <aside className="lg:w-64 shrink-0">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Enterprise onboarding</h1>
          <p className="text-sm text-gray-500 mb-4">16-step B2B activation</p>
          <ol className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const active = n === step;
              return (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => setStep(n)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm ${active ? 'bg-teal-50 text-teal-800 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    {n}. {label}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <main className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
          )}

          {step === 1 && (
            <StepBlock title="Company information">
              <Field label="Legal company name" value={form.companyInfo.legalName} onChange={(v) => setForm((f) => ({ ...f, companyInfo: { ...f.companyInfo, legalName: v } }))} />
              <Field label="Brand name" value={form.companyInfo.brandName} onChange={(v) => setForm((f) => ({ ...f, companyInfo: { ...f.companyInfo, brandName: v } }))} />
              <Field label="Industry" value={form.companyInfo.industryType} onChange={(v) => setForm((f) => ({ ...f, companyInfo: { ...f.companyInfo, industryType: v } }))} />
              <Field label="GSTIN" value={form.companyInfo.gstNumber} onChange={(v) => setForm((f) => ({ ...f, companyInfo: { ...f.companyInfo, gstNumber: v } }))} />
              <Field label="PAN" value={form.companyInfo.panNumber} onChange={(v) => setForm((f) => ({ ...f, companyInfo: { ...f.companyInfo, panNumber: v } }))} />
              <Field label="CIN (optional)" value={form.companyInfo.cinNumber} onChange={(v) => setForm((f) => ({ ...f, companyInfo: { ...f.companyInfo, cinNumber: v } }))} />
            </StepBlock>
          )}

          {step === 2 && (
            <StepBlock title="Registered & billing addresses">
              <Field label="Registered address" value={form.addresses.registered} onChange={(v) => setForm((f) => ({ ...f, addresses: { ...f.addresses, registered: v } }))} />
              <Field label="Billing address" value={form.addresses.billing} onChange={(v) => setForm((f) => ({ ...f, addresses: { ...f.addresses, billing: v } }))} />
              <Field label="City" value={form.addresses.city} onChange={(v) => setForm((f) => ({ ...f, addresses: { ...f.addresses, city: v } }))} />
              <Field label="State" value={form.addresses.state} onChange={(v) => setForm((f) => ({ ...f, addresses: { ...f.addresses, state: v } }))} />
              <Field label="Pincode" value={form.addresses.pincode} onChange={(v) => setForm((f) => ({ ...f, addresses: { ...f.addresses, pincode: v } }))} />
            </StepBlock>
          )}

          {step === 3 && (
            <StepBlock title="Primary contact">
              <Field label="Name" value={form.primaryContact.name} onChange={(v) => setForm((f) => ({ ...f, primaryContact: { ...f.primaryContact, name: v } }))} />
              <Field label="Email" value={form.primaryContact.email} onChange={(v) => setForm((f) => ({ ...f, primaryContact: { ...f.primaryContact, email: v } }))} />
              <Field label="Mobile" value={form.primaryContact.mobile} onChange={(v) => setForm((f) => ({ ...f, primaryContact: { ...f.primaryContact, mobile: v } }))} />
              <OtpRow channel="email" target={form.primaryContact.email} send={sendContactOtp} confirm={confirmContactOtp} status={kyc.contactEmail?.status} />
              <OtpRow channel="mobile" target={form.primaryContact.mobile} send={sendContactOtp} confirm={confirmContactOtp} status={kyc.contactMobile?.status} />
            </StepBlock>
          )}

          {step === 4 && (
            <StepBlock title="Finance contact">
              <Field label="Name" value={form.financeContact.name} onChange={(v) => setForm((f) => ({ ...f, financeContact: { ...f.financeContact, name: v } }))} />
              <Field label="Email" value={form.financeContact.email} onChange={(v) => setForm((f) => ({ ...f, financeContact: { ...f.financeContact, email: v } }))} />
              <Field label="Mobile" value={form.financeContact.mobile} onChange={(v) => setForm((f) => ({ ...f, financeContact: { ...f.financeContact, mobile: v } }))} />
            </StepBlock>
          )}

          {step === 5 && (
            <StepBlock title="Service requirements (dynamic catalog)">
              <p className="text-sm text-gray-500 mb-3">Select services — required documents and SLA adapt automatically.</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {(config?.serviceCatalog || []).filter((s) => s.isActive !== false).map((svc) => {
                  const selected = (form.serviceRequirements.selectedServices || []).some((s) => (s.key || s) === svc.key);
                  return (
                    <button
                      key={svc.key}
                      type="button"
                      onClick={() => toggleService(svc)}
                      className={`text-left p-3 rounded-xl border text-sm ${selected ? 'border-teal-500 bg-teal-50' : 'border-gray-200'}`}
                    >
                      <div className="font-medium">{svc.name}</div>
                      <div className="text-xs text-gray-500">{svc.key}</div>
                    </button>
                  );
                })}
              </div>
            </StepBlock>
          )}

          {step === 6 && (
            <StepBlock title="Operational coverage & branches">
              <Field label="Regions / cities" value={form.operationalCoverage.regions} onChange={(v) => setForm((f) => ({ ...f, operationalCoverage: { ...f.operationalCoverage, regions: v } }))} />
              <Field label="Site count estimate" value={form.operationalCoverage.siteCount} onChange={(v) => setForm((f) => ({ ...f, operationalCoverage: { ...f.operationalCoverage, siteCount: v } }))} />
              <div className="border-t pt-4 mt-2">
                <h3 className="text-sm font-semibold mb-2">Branches</h3>
                <ul className="space-y-2 mb-3">
                  {branches.map((b) => (
                    <li key={b._id} className="flex justify-between items-center text-sm border rounded-lg px-3 py-2">
                      <span>{b.branchName} — {b.city}</span>
                      <button type="button" className="text-red-600 text-xs" onClick={() => removeBranch(b._id)}>Remove</button>
                    </li>
                  ))}
                </ul>
                <div className="grid sm:grid-cols-2 gap-2">
                  <Field label="Branch name" value={branchForm.branchName} onChange={(v) => setBranchForm((f) => ({ ...f, branchName: v }))} />
                  <Field label="Address" value={branchForm.address} onChange={(v) => setBranchForm((f) => ({ ...f, address: v }))} />
                  <Field label="City" value={branchForm.city} onChange={(v) => setBranchForm((f) => ({ ...f, city: v }))} />
                  <Field label="State" value={branchForm.state} onChange={(v) => setBranchForm((f) => ({ ...f, state: v }))} />
                  <Field label="Pincode" value={branchForm.pincode} onChange={(v) => setBranchForm((f) => ({ ...f, pincode: v }))} />
                  <Field label="Contact person" value={branchForm.contactPerson} onChange={(v) => setBranchForm((f) => ({ ...f, contactPerson: v }))} />
                  <Field label="Contact phone" value={branchForm.contactPhone} onChange={(v) => setBranchForm((f) => ({ ...f, contactPhone: v }))} />
                </div>
                <button type="button" onClick={addBranch} className="mt-2 px-3 py-1.5 rounded-lg border text-sm">Add branch</button>
              </div>
            </StepBlock>
          )}

          {step === 7 && (
            <StepBlock title="Banking">
              <Field label="Account holder" value={form.banking.accountHolderName} onChange={(v) => setForm((f) => ({ ...f, banking: { ...f.banking, accountHolderName: v } }))} />
              <Field label="Account number" value={form.banking.accountNumber} onChange={(v) => setForm((f) => ({ ...f, banking: { ...f.banking, accountNumber: v } }))} />
              <Field label="IFSC" value={form.banking.ifsc} onChange={(v) => setForm((f) => ({ ...f, banking: { ...f.banking, ifsc: v } }))} />
              <VerifyButton label="Verify bank" status={kyc.bank?.status} onClick={async () => { await verifyBank(form.banking.accountNumber, form.banking.ifsc); await load(); }} />
            </StepBlock>
          )}

          {step === 8 && (
            <StepBlock title="Credit profile">
              <Field label="Requested credit limit (INR)" value={form.creditProfile.requestedLimit} onChange={(v) => setForm((f) => ({ ...f, creditProfile: { ...f.creditProfile, requestedLimit: v } }))} />
              <Field label="Payment terms (days)" value={form.creditProfile.paymentTermsDays} onChange={(v) => setForm((f) => ({ ...f, creditProfile: { ...f.creditProfile, paymentTermsDays: v } }))} />
            </StepBlock>
          )}

          {step === 9 && (
            <StepBlock title="Escrow & payment rules">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!form.escrowPaymentRules.escrowRequired} onChange={(e) => setForm((f) => ({ ...f, escrowPaymentRules: { ...f.escrowPaymentRules, escrowRequired: e.target.checked } }))} />
                Escrow required
              </label>
              <Field label="Billing cycle" value={form.escrowPaymentRules.billingCycle} onChange={(v) => setForm((f) => ({ ...f, escrowPaymentRules: { ...f.escrowPaymentRules, billingCycle: v } }))} />
              <Field label="PO mandatory" value={form.escrowPaymentRules.poMandatory} onChange={(v) => setForm((f) => ({ ...f, escrowPaymentRules: { ...f.escrowPaymentRules, poMandatory: v } }))} />
            </StepBlock>
          )}

          {step === 10 && (
            <StepBlock title="SLA configuration">
              <select
                className={inputClass}
                value={form.slaConfig.templateKey || ''}
                onChange={(e) => setForm((f) => ({ ...f, slaConfig: { ...f.slaConfig, templateKey: e.target.value } }))}
              >
                <option value="">Select SLA template</option>
                {(config?.slaTemplates || []).map((t) => (
                  <option key={t.key} value={t.key}>{t.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm mt-3">
                <input type="checkbox" checked={!!form.slaConfig.acceptTerms} onChange={(e) => setForm((f) => ({ ...f, slaConfig: { ...f.slaConfig, acceptTerms: e.target.checked } }))} />
                I accept the enterprise SLA terms
              </label>
              <p className="text-xs text-gray-500 mt-2">Status: <StatusPill status={kyc.agreementSigned?.status} /></p>
            </StepBlock>
          )}

          {step === 11 && (
            <StepBlock title="Approval hierarchy">
              <select
                className={inputClass}
                value={form.approvalHierarchy.templateKey || ''}
                onChange={(e) => setForm((f) => ({ ...f, approvalHierarchy: { ...f.approvalHierarchy, templateKey: e.target.value } }))}
              >
                <option value="">Select approval template</option>
                {(config?.approvalTemplates || []).map((t) => (
                  <option key={t.key} value={t.key}>{t.name}</option>
                ))}
              </select>
            </StepBlock>
          )}

          {step === 12 && (
            <StepBlock title="Bulk project configuration">
              <select
                className={inputClass}
                value={form.bulkProjectSettings.projectTemplateKey || ''}
                onChange={(e) => setForm((f) => ({ ...f, bulkProjectSettings: { ...f.bulkProjectSettings, projectTemplateKey: e.target.value } }))}
              >
                <option value="">Project template</option>
                {(config?.projectTemplates || []).map((t) => (
                  <option key={t.key} value={t.key}>{t.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={!!form.bulkProjectSettings.otpRequired} onChange={(e) => setForm((f) => ({ ...f, bulkProjectSettings: { ...f.bulkProjectSettings, otpRequired: e.target.checked } }))} /> OTP on site</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.bulkProjectSettings.geoFencing} onChange={(e) => setForm((f) => ({ ...f, bulkProjectSettings: { ...f.bulkProjectSettings, geoFencing: e.target.checked } }))} /> Geo-fencing</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.bulkProjectSettings.photosRequired} onChange={(e) => setForm((f) => ({ ...f, bulkProjectSettings: { ...f.bulkProjectSettings, photosRequired: e.target.checked } }))} /> Before/after photos</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.bulkProjectSettings.digitalSignature} onChange={(e) => setForm((f) => ({ ...f, bulkProjectSettings: { ...f.bulkProjectSettings, digitalSignature: e.target.checked } }))} /> Digital signature</label>
            </StepBlock>
          )}

          {step === 13 && (
            <StepBlock title="Compliance">
              <Field label="MSME / regulatory notes" value={form.compliance.notes} onChange={(v) => setForm((f) => ({ ...f, compliance: { ...f.compliance, notes: v } }))} />
            </StepBlock>
          )}

          {step === 14 && (
            <StepBlock title="API verification & documents">
              <div className="flex flex-wrap gap-2 mb-4">
                <VerifyButton label="Verify GST" status={kyc.gst?.status} onClick={async () => { await verifyGst(form.companyInfo.gstNumber); await load(); }} />
                <VerifyButton label="Verify PAN" status={kyc.pan?.status} onClick={async () => { await verifyPan(form.companyInfo.panNumber); await load(); }} />
                {form.companyInfo.cinNumber && (
                  <VerifyButton label="Verify CIN" status={kyc.cin?.status} onClick={async () => { await verifyCin(form.companyInfo.cinNumber); await load(); }} />
                )}
              </div>
              <h3 className="font-semibold text-sm mt-4 mb-2">Required documents</h3>
              <ul className="space-y-3">
                {requiredDocs.map((key) => {
                  const tpl = config?.documentTemplates?.find((d) => d.key === key);
                  const doc = documents.find((d) => d.documentType === key);
                  return (
                    <li key={key} className="border rounded-xl p-3 text-sm">
                      <div className="font-medium">{tpl?.label || key}</div>
                      <div className="text-xs text-gray-500">Status: {doc?.status || 'missing'}</div>
                      <input type="file" className="mt-2 text-xs" onChange={(e) => e.target.files?.[0] && handleDocUpload(key, e.target.files[0])} />
                    </li>
                  );
                })}
              </ul>
            </StepBlock>
          )}

          {step === 15 && (
            <StepBlock title="Review">
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <ScoreCard label="KYC score" value={onboarding?.scores?.kyc} />
                <ScoreCard label="Risk score" value={onboarding?.scores?.risk} />
                <ScoreCard label="Credit score" value={onboarding?.scores?.credit} />
              </div>
              <p className="text-sm text-gray-600 mt-4">Lifecycle: <strong>{onboarding?.lifecycleStatus}</strong></p>
              {activation?.blockers?.length > 0 && (
                <ul className="mt-2 text-sm text-amber-800 bg-amber-50 rounded-lg p-3 list-disc pl-5">
                  {activation.blockers.map((b) => <li key={b}>{b}</li>)}
                </ul>
              )}
            </StepBlock>
          )}

          {step === 16 && (
            <StepBlock title="Submit for review">
              <p className="text-sm text-gray-600">Submit your application for finance, compliance, operations, and admin approval.</p>
              {activation?.canActivate === false && (
                <p className="text-sm text-amber-700 mt-2">Complete all activation gates before final approval (admin will verify).</p>
              )}
            </StepBlock>
          )}

          <div className="flex justify-between mt-8 pt-4 border-t">
            <button type="button" disabled={step <= 1 || saving} onClick={() => setStep((s) => Math.max(1, s - 1))} className="px-4 py-2 rounded-xl border text-sm disabled:opacity-40">Back</button>
            <button type="button" disabled={saving} onClick={() => persistStep()} className="px-5 py-2 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: '#10AFA5' }}>
              {saving ? 'Saving…' : step === 16 ? 'Submit application' : 'Save & continue'}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

function StepBlock({ title, children }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <input className={`${inputClass} mt-1`} value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function VerifyButton({ label, status, onClick }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-gray-50">
      {label} <StatusPill status={status} />
    </button>
  );
}

function OtpRow({ channel, target, send, confirm, status }) {
  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div className="flex flex-wrap gap-2 items-end text-sm">
      <button type="button" className="px-3 py-1.5 rounded-lg border" onClick={async () => { setMsg(''); await send(channel === 'email' ? { channel, email: target } : { channel, phone: target }); setMsg('OTP sent'); }}>Send {channel} OTP</button>
      <input className="w-24 px-2 py-1.5 border rounded-lg" placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
      <button type="button" className="px-3 py-1.5 rounded-lg bg-gray-900 text-white" onClick={async () => { await confirm(channel === 'email' ? { channel, email: target, otp } : { channel, phone: target, otp }); setMsg('Verified'); }}>Verify</button>
      <StatusPill status={status} />
      {msg && <span className="text-xs text-teal-700">{msg}</span>}
    </div>
  );
}

function ScoreCard({ label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-bold">{value ?? '—'}</div>
    </div>
  );
}
