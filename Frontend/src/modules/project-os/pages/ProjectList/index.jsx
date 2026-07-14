import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiSearch, FiArrowRight, FiActivity, FiMapPin, FiCheckSquare, FiAlertCircle } from 'react-icons/fi';
import { projectApi, templateApi } from '../../services/projectOS.api';
import { StatusBadge } from '../../components/WidgetRenderer';
import toast from 'react-hot-toast';

const HEALTH_DOT = { GREEN: 'bg-emerald-500', AMBER: 'bg-amber-500', RED: 'bg-red-500' };
const STATUS_OPTS = ['DRAFT','PROPOSED','APPROVED','PLANNING','IN_PROGRESS','ON_HOLD','AT_RISK','COMPLETED','CANCELLED','CLOSED'];

function CreateProjectModal({ onClose, onCreated }) {
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ title: '', projectTemplateId: '', clientType: 'B2B', clientName: '', contractValue: '', startDate: '', expectedEndDate: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    templateApi.getAll({ status: 'PUBLISHED', limit: 100 })
      .then(res => setTemplates(res.data.data || []))
      .catch(() => toast.error('Failed to load templates'));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.projectTemplateId) return toast.error('Title and Template are required');
    setSaving(true);
    try {
      const res = await projectApi.create({ ...form, contractValue: Number(form.contractValue) || 0 });
      toast.success('Project created successfully!');
      onCreated(res.data.data._id);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to create project'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-800">Create New Project</h3>
            <p className="text-xs text-slate-400 mt-0.5">Select a published template to configure this project</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Template selector */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Project Template *</label>
            <select value={form.projectTemplateId} onChange={e => setForm(f => ({ ...f, projectTemplateId: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white text-slate-700">
              <option value="">Select a template...</option>
              {templates.map(t => <option key={t._id} value={t._id}>{t.name} — {t.category}</option>)}
            </select>
            {templates.length === 0 && <p className="text-xs text-amber-500 mt-1">⚠️ No published templates yet. Ask an admin to create and publish one.</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Project Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="e.g. Solar Rollout - Phase 1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Client Type</label>
              <select value={form.clientType} onChange={e => setForm(f => ({ ...f, clientType: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white">
                <option value="B2B">B2B Client</option>
                <option value="USER">Individual User</option>
                <option value="VENDOR_DIRECT">Vendor Direct</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Client Name</label>
              <input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="Client organization / name" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Contract Value (₹)</label>
              <input type="number" value={form.contractValue} onChange={e => setForm(f => ({ ...f, contractValue: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Expected End Date</label>
              <input type="date" value={form.expectedEndDate} onChange={e => setForm(f => ({ ...f, expectedEndDate: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving || !form.projectTemplateId} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProjectListPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', category: '' });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await projectApi.getAll({ page, limit: 20, search, ...filters });
      setProjects(res.data.data);
      setTotal(res.data.total);
    } catch { toast.error('Failed to load projects'); }
    finally { setLoading(false); }
  }, [page, search, filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 lg:p-8">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Project OS</h1>
            <p className="text-slate-500 text-sm mt-1">{total} projects · Configuration-driven enterprise engine</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-5 py-2.5 font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200">
            <FiPlus size={16} /> New Project
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex-1 min-w-48">
            <FiSearch size={14} className="text-slate-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search projects..." className="bg-transparent text-sm outline-none flex-1 text-slate-700 placeholder-slate-400" />
          </div>
          <select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}
            className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-600">
            <option value="">All Status</option>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
          </select>
        </div>

        {/* Project Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-52 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-slate-200">
            <div className="text-5xl mb-4">🚀</div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">No Projects Yet</h3>
            <p className="text-slate-400 text-sm mb-6">Create your first project using a published template.</p>
            <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700">
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map(p => (
              <div key={p._id} onClick={() => navigate(`${p._id}`)}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden group">
                {/* Top accent */}
                <div className={`h-1 w-full ${p.health === 'RED' ? 'bg-red-500' : p.health === 'AMBER' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{p.projectCode}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <h3 className="font-bold text-slate-800 leading-tight line-clamp-1">{p.title}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{p.category} · {p.clientName || 'N/A'}</p>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${HEALTH_DOT[p.health] || 'bg-slate-300'}`} title={`Health: ${p.health}`} />
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Progress</span>
                      <span className="font-semibold text-slate-600">{p.progress || 0}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${p.progress || 0}%` }} />
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[
                      { icon: FiMapPin, label: 'Sites', value: p.stats?.siteCount || 0 },
                      { icon: FiCheckSquare, label: 'Open Tasks', value: p.stats?.openTasks || 0 },
                      { icon: FiAlertCircle, label: 'Issues', value: p.stats?.openIssues || 0 },
                    ].map(s => (
                      <div key={s.label} className="text-center p-2 bg-slate-50 rounded-lg">
                        <p className="text-lg font-bold text-slate-800">{s.value}</p>
                        <p className="text-xs text-slate-400">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">₹{Number(p.contractValue || 0).toLocaleString('en-IN')}</span>
                    <FiArrowRight size={14} className="text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-center gap-3">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 text-sm border border-slate-200 bg-white rounded-xl disabled:opacity-40 hover:bg-slate-50">Previous</button>
            <span className="text-sm text-slate-500">Page {page} of {Math.ceil(total / 20)}</span>
            <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="px-4 py-2 text-sm border border-slate-200 bg-white rounded-xl disabled:opacity-40 hover:bg-slate-50">Next</button>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); navigate(String(id)); }}
        />
      )}
    </div>
  );
}
