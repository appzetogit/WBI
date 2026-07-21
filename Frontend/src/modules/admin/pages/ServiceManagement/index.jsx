import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiArchive, FiCheckCircle, FiEdit2, FiPlus, FiRefreshCw, FiSave, FiSearch,
  FiSend, FiSlash, FiX
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  archiveManagedService,
  createManagedService,
  getManagedService,
  listManagedServices,
  publishManagedService,
  setManagedServiceStatus,
  updateManagedService,
  upsertDashboardConfiguration,
  upsertFormSchema,
  upsertRegistrationTemplate,
  upsertSubcategories
} from '../../services/serviceManagementService';
import { publicCatalogService } from '../../../../services/catalogService';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'subs', label: 'Sub-services' },
  { id: 'forms', label: 'User Forms' },
  { id: 'ops', label: 'Ops Config' },
  { id: 'registration', label: 'Registration' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'publish', label: 'Publish' }
];

const emptyCreate = () => ({
  categoryCode: '',
  categoryName: '',
  description: '',
  serviceType: 'hybrid',
  icon: 'FiGrid',
  color: '#10AFA5',
  tags: '',
  publish: true,
  subCategories: [
    { subCatCode: '', subCatName: '', basePrice: 999, isActive: true }
  ]
});

const statusBadge = (status) => {
  const map = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    inactive: 'bg-amber-50 text-amber-700 border-amber-100',
    archived: 'bg-slate-100 text-slate-600 border-slate-200'
  };
  return map[status] || map.inactive;
};

const ServiceManagement = () => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCode, setSelectedCode] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('overview');
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate());

  const [overviewForm, setOverviewForm] = useState({});
  const [subsForm, setSubsForm] = useState([]);
  const [selectedFormCode, setSelectedFormCode] = useState('');
  const [formEditor, setFormEditor] = useState(null);
  const [regForm, setRegForm] = useState(null);
  const [dashForm, setDashForm] = useState(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listManagedServices({
        q: q.trim() || undefined,
        status: statusFilter,
        limit: 100
      });
      setList(res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load services');
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter]);

  const loadDetail = useCallback(async (code) => {
    if (!code) return;
    try {
      const res = await getManagedService(code);
      setDetail(res.data);
      setOverviewForm({ ...(res.data?.config || {}) });
      setSubsForm([...(res.data?.config?.subCategories || [])]);
      setRegForm(res.data?.registration || {
        categoryCode: code,
        categoryName: res.data?.config?.categoryName,
        requiredDocuments: [],
        requiredCertifications: [],
        requiredSkills: [],
        teamFields: [],
        extraFields: []
      });
      setDashForm(res.data?.dashboard || {
        categoryCode: code,
        categoryName: res.data?.config?.categoryName,
        sidebarModules: [],
        widgets: []
      });
      const firstForm = (res.data?.forms || [])[0];
      setSelectedFormCode(firstForm?.subCatCode || '');
      setFormEditor(firstForm || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load service detail');
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedCode) loadDetail(selectedCode);
  }, [selectedCode, loadDetail]);

  const filteredHint = useMemo(() => `${list.length} service(s)`, [list]);

  const handleCreate = async () => {
    if (!createForm.categoryName.trim()) {
      toast.error('Service name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...createForm,
        categoryCode: createForm.categoryCode.trim() || undefined,
        tags: String(createForm.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        subCategories: (createForm.subCategories || [])
          .filter((s) => s.subCatName)
          .map((s, i) => ({
            ...s,
            subCatCode: s.subCatCode || undefined,
            displayOrder: i + 1
          }))
      };
      const res = await createManagedService(payload);
      toast.success(res.published ? 'Created & published' : 'Service created');
      setShowCreate(false);
      setCreateForm(emptyCreate());
      await loadList();
      const code = res.data?.categoryCode;
      if (code) setSelectedCode(code);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const saveOverview = async () => {
    setSaving(true);
    try {
      await updateManagedService(selectedCode, {
        categoryName: overviewForm.categoryName,
        description: overviewForm.description,
        tags: overviewForm.tags || [],
        displayOrder: Number(overviewForm.displayOrder) || 0,
        serviceType: overviewForm.serviceType,
        icon: overviewForm.icon,
        color: overviewForm.color,
        image: overviewForm.image,
        requiredVendorType: overviewForm.requiredVendorType,
        requiredSkills: overviewForm.requiredSkills || [],
        requiredDocuments: overviewForm.requiredDocuments || [],
        matchAliases: overviewForm.matchAliases || [],
        pricingRules: overviewForm.pricingRules || [],
        paymentRules: overviewForm.paymentRules || {},
        commissionRules: overviewForm.commissionRules || {},
        slaRules: overviewForm.slaRules || [],
        approvalFlow: overviewForm.approvalFlow || {}
      });
      toast.success('Overview saved');
      await loadDetail(selectedCode);
      await loadList();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveSubs = async () => {
    setSaving(true);
    try {
      await upsertSubcategories(selectedCode, subsForm);
      toast.success('Sub-services saved');
      await loadDetail(selectedCode);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveForm = async () => {
    if (!formEditor?.subCatCode) return;
    setSaving(true);
    try {
      await upsertFormSchema(formEditor.subCatCode, {
        ...formEditor,
        categoryCode: selectedCode,
        categoryName: overviewForm.categoryName || selectedCode
      });
      toast.success('Form schema saved');
      await loadDetail(selectedCode);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveOps = async () => {
    setSaving(true);
    try {
      await updateManagedService(selectedCode, {
        projectMilestones: overviewForm.projectMilestones || [],
        siteChecklist: overviewForm.siteChecklist || [],
        inventoryCategories: overviewForm.inventoryCategories || [],
        toolCategories: overviewForm.toolCategories || [],
        complianceDocs: overviewForm.complianceDocs || [],
        extraKPIs: overviewForm.extraKPIs || [],
        assetFields: overviewForm.assetFields || []
      });
      toast.success('Ops config saved');
      await loadDetail(selectedCode);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveRegistration = async () => {
    setSaving(true);
    try {
      await upsertRegistrationTemplate(selectedCode, {
        ...regForm,
        categoryName: overviewForm.categoryName || selectedCode
      });
      toast.success('Registration template saved');
      await loadDetail(selectedCode);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveDashboard = async () => {
    setSaving(true);
    try {
      await upsertDashboardConfiguration(selectedCode, {
        ...dashForm,
        categoryName: overviewForm.categoryName || selectedCode
      });
      toast.success('Dashboard config saved');
      await loadDetail(selectedCode);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const doPublish = async () => {
    setSaving(true);
    try {
      const res = await publishManagedService(selectedCode);
      publicCatalogService.invalidateLocalCatalogCache?.();
      toast.success(
        `Published: ${res.data?.subServices || 0} services, ${res.data?.forms || 0} forms`
      );
      await loadDetail(selectedCode);
      await loadList();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Publish failed');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status) => {
    setSaving(true);
    try {
      if (status === 'archived') await archiveManagedService(selectedCode);
      else await setManagedServiceStatus(selectedCode, status);
      toast.success(`Status → ${status}`);
      await loadDetail(selectedCode);
      await loadList();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Status update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Service Management</h1>
          <p className="text-sm text-slate-500">
            Create, configure, and publish services to User / Vendor / Engineer panels
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadList}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700"
          >
            <FiRefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#10AFA5] text-white text-sm font-semibold"
          >
            <FiPlus className="w-4 h-4" /> New Service
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[70vh]">
        {/* List */}
        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search code or name…"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 text-sm px-2"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <p className="text-xs text-slate-400 mb-2">{filteredHint}</p>
          <div className="space-y-1 max-h-[62vh] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-sm text-slate-400">Loading…</div>
            ) : list.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">No services found</div>
            ) : (
              list.map((svc) => (
                <button
                  key={svc.categoryCode}
                  type="button"
                  onClick={() => {
                    setSelectedCode(svc.categoryCode);
                    setTab('overview');
                  }}
                  className={`w-full text-left px-3 py-3 rounded-xl border transition ${
                    selectedCode === svc.categoryCode
                      ? 'border-[#10AFA5] bg-[#10AFA5]/5'
                      : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#10AFA5]">{svc.categoryCode}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusBadge(svc.status || 'active')}`}>
                      {svc.status || 'active'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-800 mt-0.5 truncate">
                    {svc.categoryName}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {(svc.subCategories || []).length} sub · v{svc.version || 1}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          {!selectedCode || !detail ? (
            <div className="h-full min-h-[50vh] flex items-center justify-center text-slate-400 text-sm">
              Select a service or create a new one
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">
                      {detail.config?.categoryName}
                    </h2>
                    <span className="text-xs font-mono text-slate-500">{selectedCode}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Version {detail.config?.version || 1}
                    {detail.config?.publishedAt
                      ? ` · Published ${new Date(detail.config.publishedAt).toLocaleString('en-IN')}`
                      : ' · Not published yet'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => changeStatus('active')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700"
                  >
                    <FiCheckCircle /> Activate
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => changeStatus('inactive')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700"
                  >
                    <FiSlash /> Deactivate
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => changeStatus('archived')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600"
                  >
                    <FiArchive /> Archive
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 border-b border-slate-100 mb-4">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`px-3 py-2 text-xs font-semibold rounded-t-lg ${
                      tab === t.id
                        ? 'text-[#0F766E] bg-[#10AFA5]/10 border-b-2 border-[#10AFA5]'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'overview' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="text-xs font-semibold text-slate-600 block">
                      Name
                      <input
                        className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        value={overviewForm.categoryName || ''}
                        onChange={(e) =>
                          setOverviewForm((p) => ({ ...p, categoryName: e.target.value }))
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-600 block">
                      Service type
                      <select
                        className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        value={overviewForm.serviceType || 'hybrid'}
                        onChange={(e) =>
                          setOverviewForm((p) => ({ ...p, serviceType: e.target.value }))
                        }
                      >
                        <option value="hybrid">Hybrid</option>
                        <option value="project">Project</option>
                        <option value="one_time">One-Time</option>
                        <option value="b2b">B2B</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-600 block md:col-span-2">
                      Description
                      <textarea
                        className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm min-h-[80px]"
                        value={overviewForm.description || ''}
                        onChange={(e) =>
                          setOverviewForm((p) => ({ ...p, description: e.target.value }))
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-600 block">
                      Icon
                      <input
                        className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        value={overviewForm.icon || ''}
                        onChange={(e) => setOverviewForm((p) => ({ ...p, icon: e.target.value }))}
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-600 block">
                      Color
                      <input
                        type="color"
                        className="mt-1 w-full h-10 px-1 rounded-xl border border-slate-200"
                        value={overviewForm.color || '#10AFA5'}
                        onChange={(e) => setOverviewForm((p) => ({ ...p, color: e.target.value }))}
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-600 block">
                      Display order
                      <input
                        type="number"
                        className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        value={overviewForm.displayOrder ?? 0}
                        onChange={(e) =>
                          setOverviewForm((p) => ({ ...p, displayOrder: Number(e.target.value) }))
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-600 block">
                      Tags (comma separated)
                      <input
                        className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        value={Array.isArray(overviewForm.tags) ? overviewForm.tags.join(', ') : ''}
                        onChange={(e) =>
                          setOverviewForm((p) => ({
                            ...p,
                            tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean)
                          }))
                        }
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveOverview}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#10AFA5] text-white text-sm font-semibold"
                  >
                    <FiSave /> Save overview
                  </button>
                </div>
              )}

              {tab === 'subs' && (
                <div className="space-y-3">
                  {subsForm.map((sub, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center border border-slate-100 rounded-xl p-3">
                      <input
                        className="col-span-3 h-9 px-2 rounded-lg border border-slate-200 text-xs font-mono"
                        placeholder="C25-01"
                        value={sub.subCatCode || ''}
                        onChange={(e) => {
                          const next = [...subsForm];
                          next[idx] = { ...next[idx], subCatCode: e.target.value.toUpperCase() };
                          setSubsForm(next);
                        }}
                      />
                      <input
                        className="col-span-5 h-9 px-2 rounded-lg border border-slate-200 text-sm"
                        placeholder="Sub-service name"
                        value={sub.subCatName || ''}
                        onChange={(e) => {
                          const next = [...subsForm];
                          next[idx] = { ...next[idx], subCatName: e.target.value };
                          setSubsForm(next);
                        }}
                      />
                      <input
                        type="number"
                        className="col-span-2 h-9 px-2 rounded-lg border border-slate-200 text-sm"
                        placeholder="Price"
                        value={sub.basePrice ?? 999}
                        onChange={(e) => {
                          const next = [...subsForm];
                          next[idx] = { ...next[idx], basePrice: Number(e.target.value) };
                          setSubsForm(next);
                        }}
                      />
                      <label className="col-span-1 text-[10px] flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={sub.isActive !== false}
                          onChange={(e) => {
                            const next = [...subsForm];
                            next[idx] = { ...next[idx], isActive: e.target.checked };
                            setSubsForm(next);
                          }}
                        />
                        On
                      </label>
                      <button
                        type="button"
                        className="col-span-1 text-slate-400 hover:text-red-500"
                        onClick={() => setSubsForm(subsForm.filter((_, i) => i !== idx))}
                      >
                        <FiX />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSubsForm([
                          ...subsForm,
                          {
                            subCatCode: `${selectedCode}-${String(subsForm.length + 1).padStart(2, '0')}`,
                            subCatName: '',
                            basePrice: 999,
                            isActive: true
                          }
                        ])
                      }
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                    >
                      <FiPlus /> Add sub-service
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={saveSubs}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#10AFA5] text-white text-sm font-semibold"
                    >
                      <FiSave /> Save sub-services
                    </button>
                  </div>
                </div>
              )}

              {tab === 'forms' && (
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {(detail.forms || []).map((f) => (
                      <button
                        key={f.subCatCode}
                        type="button"
                        onClick={() => {
                          setSelectedFormCode(f.subCatCode);
                          setFormEditor(f);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                          selectedFormCode === f.subCatCode
                            ? 'border-[#10AFA5] bg-[#10AFA5]/10 text-[#0F766E]'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        {f.subCatCode}
                      </button>
                    ))}
                    {!(detail.forms || []).length && (
                      <p className="text-sm text-slate-400">
                        No forms yet — Publish to create default forms, or add via sub-services then publish.
                      </p>
                    )}
                  </div>
                  {formEditor && (
                    <>
                      <label className="text-xs font-semibold text-slate-600 block">
                        Form title
                        <input
                          className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                          value={formEditor.subCategoryName || ''}
                          onChange={(e) =>
                            setFormEditor((p) => ({ ...p, subCategoryName: e.target.value }))
                          }
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-600 block">
                        Fields (JSON array)
                        <textarea
                          className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono min-h-[220px]"
                          value={JSON.stringify(formEditor.fields || [], null, 2)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              setFormEditor((p) => ({ ...p, fields: parsed }));
                            } catch {
                              /* allow typing invalid JSON until blur/save */
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={saveForm}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#10AFA5] text-white text-sm font-semibold"
                      >
                        <FiEdit2 /> Save form
                      </button>
                    </>
                  )}
                </div>
              )}

              {tab === 'ops' && (
                <div className="space-y-3">
                  {[
                    ['projectMilestones', 'Project milestones (JSON)'],
                    ['siteChecklist', 'Site checklist (JSON)'],
                    ['inventoryCategories', 'Inventory categories (JSON)'],
                    ['toolCategories', 'Tool categories (JSON)'],
                    ['complianceDocs', 'Compliance docs (JSON)'],
                    ['extraKPIs', 'Extra KPIs (JSON)']
                  ].map(([key, label]) => (
                    <label key={key} className="text-xs font-semibold text-slate-600 block">
                      {label}
                      <textarea
                        className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono min-h-[90px]"
                        value={JSON.stringify(overviewForm[key] || [], null, 2)}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            setOverviewForm((p) => ({ ...p, [key]: parsed }));
                          } catch {
                            /* ignore while typing */
                          }
                        }}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveOps}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#10AFA5] text-white text-sm font-semibold"
                  >
                    <FiSave /> Save ops config
                  </button>
                </div>
              )}

              {tab === 'registration' && regForm && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-600 block">
                    Required documents (JSON)
                    <textarea
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono min-h-[100px]"
                      value={JSON.stringify(regForm.requiredDocuments || [], null, 2)}
                      onChange={(e) => {
                        try {
                          setRegForm((p) => ({
                            ...p,
                            requiredDocuments: JSON.parse(e.target.value)
                          }));
                        } catch { /* */ }
                      }}
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600 block">
                    Required certifications (JSON)
                    <textarea
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono min-h-[100px]"
                      value={JSON.stringify(regForm.requiredCertifications || [], null, 2)}
                      onChange={(e) => {
                        try {
                          setRegForm((p) => ({
                            ...p,
                            requiredCertifications: JSON.parse(e.target.value)
                          }));
                        } catch { /* */ }
                      }}
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600 block">
                    Required skills (comma separated)
                    <input
                      className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                      value={(regForm.requiredSkills || []).join(', ')}
                      onChange={(e) =>
                        setRegForm((p) => ({
                          ...p,
                          requiredSkills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveRegistration}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#10AFA5] text-white text-sm font-semibold"
                  >
                    <FiSave /> Save registration template
                  </button>
                </div>
              )}

              {tab === 'dashboard' && dashForm && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-600 block">
                    Sidebar modules (JSON)
                    <textarea
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono min-h-[140px]"
                      value={JSON.stringify(dashForm.sidebarModules || [], null, 2)}
                      onChange={(e) => {
                        try {
                          setDashForm((p) => ({ ...p, sidebarModules: JSON.parse(e.target.value) }));
                        } catch { /* */ }
                      }}
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600 block">
                    Widgets (JSON)
                    <textarea
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono min-h-[120px]"
                      value={JSON.stringify(dashForm.widgets || [], null, 2)}
                      onChange={(e) => {
                        try {
                          setDashForm((p) => ({ ...p, widgets: JSON.parse(e.target.value) }));
                        } catch { /* */ }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveDashboard}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#10AFA5] text-white text-sm font-semibold"
                  >
                    <FiSave /> Save dashboard config
                  </button>
                </div>
              )}

              {tab === 'publish' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#10AFA5]/20 bg-[#10AFA5]/5 p-4">
                    <h3 className="font-bold text-slate-900 mb-1">Publish to all panels</h3>
                    <p className="text-sm text-slate-600 mb-3">
                      Dual-writes ServiceCategory, SubService, and FormSchema stubs. Vendor picker and
                      user search pick up changes after cache invalidation — no code deploy needed.
                    </p>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={doPublish}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10AFA5] text-white text-sm font-semibold"
                    >
                      <FiSend /> Publish now
                    </button>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 mb-2">Recent audit</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(detail.audits || []).length === 0 && (
                        <p className="text-xs text-slate-400">No audits yet</p>
                      )}
                      {(detail.audits || []).map((a) => (
                        <div
                          key={a._id}
                          className="text-xs border border-slate-100 rounded-xl px-3 py-2 flex justify-between gap-2"
                        >
                          <div>
                            <span className="font-semibold text-slate-700">{a.action}</span>
                            <span className="text-slate-400"> — {a.summary}</span>
                          </div>
                          <span className="text-slate-400 whitespace-nowrap">
                            {new Date(a.createdAt).toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {(detail.projectTemplates || []).length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 mb-2">Linked Project OS templates</h4>
                      <ul className="text-xs text-slate-600 space-y-1">
                        {detail.projectTemplates.map((t) => (
                          <li key={t._id || t.templateKey}>
                            {t.name} ({t.templateKey}) — {t.status}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Create service</h3>
              <button type="button" onClick={() => setShowCreate(false)}>
                <FiX className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                placeholder="Service name (e.g. Drone Inspection)"
                value={createForm.categoryName}
                onChange={(e) => setCreateForm((p) => ({ ...p, categoryName: e.target.value }))}
              />
              <input
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-mono"
                placeholder="Optional code (e.g. C25) — auto if empty"
                value={createForm.categoryCode}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, categoryCode: e.target.value.toUpperCase() }))
                }
              />
              <textarea
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm min-h-[70px]"
                placeholder="Description"
                value={createForm.description}
                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
              />
              <input
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                placeholder="First sub-service name"
                value={createForm.subCategories[0]?.subCatName || ''}
                onChange={(e) =>
                  setCreateForm((p) => ({
                    ...p,
                    subCategories: [{ ...p.subCategories[0], subCatName: e.target.value }]
                  }))
                }
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={!!createForm.publish}
                  onChange={(e) => setCreateForm((p) => ({ ...p, publish: e.target.checked }))}
                />
                Publish immediately to User + Vendor catalogs
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleCreate}
                className="px-4 py-2 rounded-xl bg-[#10AFA5] text-white text-sm font-semibold"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceManagement;
