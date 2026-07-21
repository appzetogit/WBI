import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FolderKanban, Play, Pause, CheckCircle, Archive, Users, IndianRupee, AlertTriangle, Plus, X, ListChecks, UserPlus } from 'lucide-react';
import { fetchProjects, createProject, updateProject, formatINR, statusColors } from '../../../services/projectOpsService';
import { useProjectOps } from '../context/ProjectOpsContext';
import { useVendorConfig } from '../../../context/VendorConfigContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';
import AssignEngineerModal from '../components/AssignEngineerModal';

const PAGE = 8;

const emptyForm = {
  title: '',
  clientName: '',
  serviceCategoryCode: '',
  projectType: 'project',
  priority: 'normal',
  budget: '',
  city: '',
  startDate: '',
  endDate: ''
};

const ProjectOS = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { search, filters, refreshKey, triggerRefresh } = useProjectOps();
  const { approvedServices = [], projectMilestones = {}, inventoryCategories = [], siteChecklist = {} } = useVendorConfig();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [assignTarget, setAssignTarget] = useState(null);

  // Open assign modal from Business Intake redirect: ?assign=projectId
  useEffect(() => {
    const assignId = searchParams.get('assign');
    if (assignId) {
      setAssignTarget({
        projectId: assignId,
        title: searchParams.get('title') || 'Assign engineer',
      });
      searchParams.delete('assign');
      searchParams.delete('title');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const services = (approvedServices || []).filter((s) => s.status !== 'suspended');
  const previewMilestones = form.serviceCategoryCode
    ? (projectMilestones[form.serviceCategoryCode] || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
    : [];
  const previewChecklist = form.serviceCategoryCode
    ? (siteChecklist[form.serviceCategoryCode] || [])
    : [];
  const previewInventory = form.serviceCategoryCode
    ? (inventoryCategories || []).slice(0, 6)
    : [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE };
      if (search) params.search = search;
      if (filters.category) params.category = filters.category;
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      const res = await fetchProjects(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateProject(id, { action }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  const openCreate = () => {
    setForm({
      ...emptyForm,
      serviceCategoryCode: services[0]?.categoryCode || ''
    });
    setCreateError('');
    setShowCreate(true);
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.serviceCategoryCode) {
      setCreateError('Title and service category are required');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await createProject({
        title: form.title.trim(),
        clientName: form.clientName.trim(),
        serviceCategoryCode: form.serviceCategoryCode,
        projectType: form.projectType,
        priority: form.priority,
        budget: Number(form.budget) || 0,
        city: form.city.trim(),
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined
      });
      setShowCreate(false);
      setForm(emptyForm);
      triggerRefresh?.();
      load();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={openCreate}
          disabled={!services.length}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" /> Create Project
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2,3,4].map((i) => <div key={i} className="h-56 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects"
          description={services.length
            ? 'Create a project to auto-load milestones from your service template.'
            : 'Projects matching your services will appear here.'}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((p) => {
              const sc = statusColors[p.status] || statusColors.planning;
              return (
                <div key={p._id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md p-5 flex flex-col">
                  <div className="flex justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{p.projectCode}</p>
                      <h3 className="font-bold text-gray-900 mt-0.5 line-clamp-2">{p.title}</h3>
                      <p className="text-xs text-gray-500 mt-1">{p.clientName} · {p.serviceCategoryName}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border h-fit ${sc}`}>{p.status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-600 mb-3">
                    <span className="px-2 py-0.5 bg-gray-100 rounded-full capitalize">{p.projectType?.replace('_', ' ')}</span>
                    <span className="font-semibold text-blue-700 flex items-center gap-0.5"><IndianRupee className="h-3 w-3" />{formatINR(p.budget)}</span>
                    {p.riskLevel === 'high' && <span className="text-red-600 flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" /> High risk</span>}
                    <span>SLA: {p.slaStatus?.replace('_', ' ')}</span>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{p.currentStage}</span>
                      <span className="font-semibold text-gray-800">{p.progress}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${p.progress}%` }} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                    <Users className="h-3 w-3" /> {p.assignedManager || 'Unassigned'} · {p.assignedEngineers?.length || 0} engineers · {p.city}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <button
                      onClick={() => setAssignTarget({ projectId: p._id, title: p.title })}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100"
                    >
                      <UserPlus className="h-3 w-3" /> Assign Engineer
                    </button>
                    {p.status === 'planning' && (
                      <button onClick={() => act(p._id, 'start')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg"><Play className="h-3 w-3" /> Start</button>
                    )}
                    {p.status === 'in_progress' && (
                      <>
                        <button onClick={() => act(p._id, 'pause')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><Pause className="h-3 w-3" /> Pause</button>
                        <button onClick={() => act(p._id, 'complete')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg"><CheckCircle className="h-3 w-3" /> Complete</button>
                      </>
                    )}
                    {p.status === 'completed' && (
                      <button onClick={() => act(p._id, 'archive')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><Archive className="h-3 w-3" /> Archive</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
        </>
      )}

      {assignTarget && (
        <AssignEngineerModal
          projectId={assignTarget.projectId}
          projectTitle={assignTarget.title}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => { setAssignTarget(null); load(); triggerRefresh?.(); }}
        />
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Create Project</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitCreate} className="p-5 space-y-4">
              {createError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{createError}</p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project title *</label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. ATM Installation — HDFC Phase 2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client name</label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={form.clientName}
                  onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service category *</label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                  value={form.serviceCategoryCode}
                  onChange={(e) => setForm((f) => ({ ...f, serviceCategoryCode: e.target.value }))}
                  required
                >
                  <option value="">Select service</option>
                  {services.map((s) => (
                    <option key={s.categoryCode} value={s.categoryCode}>
                      {s.categoryCode} · {s.categoryName}
                    </option>
                  ))}
                </select>
              </div>
              {previewMilestones.length > 0 && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5 mb-2">
                      <ListChecks className="h-3.5 w-3.5" />
                      {previewMilestones.length} milestones will auto-create
                    </p>
                    <ol className="text-xs text-blue-900 space-y-1 list-decimal list-inside">
                      {previewMilestones.map((m) => (
                        <li key={m.order || m.title}>{m.title}{m.defaultDays ? ` · ${m.defaultDays}d` : ''}</li>
                      ))}
                    </ol>
                  </div>
                  {previewChecklist.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-blue-800 mb-1">Site checklist</p>
                      <ul className="text-xs text-blue-900 space-y-0.5">
                        {previewChecklist.slice(0, 5).map((c) => (
                          <li key={c.item}>• {c.item}{c.required ? ' (required)' : ''}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {previewInventory.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-blue-800 mb-1">Suggested inventory</p>
                      <p className="text-xs text-blue-900">{previewInventory.map((i) => i.name).join(', ')}</p>
                    </div>
                  )}
                </div>
              )}
              {!services.length && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  No approved services on your profile. Complete registration or wait for admin approval.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white"
                    value={form.projectType}
                    onChange={(e) => setForm((f) => ({ ...f, projectType: e.target.value }))}
                  >
                    <option value="project">Project</option>
                    <option value="amc">AMC</option>
                    <option value="installation">Installation</option>
                    <option value="support">Support</option>
                    <option value="break_fix">Break-fix</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Budget (₹)</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    value={form.budget}
                    onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {creating ? 'Creating…' : 'Create & load milestones'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default ProjectOS;
