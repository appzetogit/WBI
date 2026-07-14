import React, { useState, useEffect, useCallback } from 'react';
import { FiAlertCircle, FiPlus, FiSearch, FiRefreshCw } from 'react-icons/fi';
import { issueApi } from '../../services/projectOS.api';
import { StatusBadge } from '../../components/WidgetRenderer';
import toast from 'react-hot-toast';

const PRIORITY_COLOR = {
  LOW: 'bg-slate-100 text-slate-500',
  MEDIUM: 'bg-blue-100 text-blue-600',
  HIGH: 'bg-amber-100 text-amber-700',
  CRITICAL: 'bg-red-100 text-red-700'
};

const ISSUE_TYPES = [
  'SITE_UNAVAILABLE','CUSTOMER_UNAVAILABLE','MATERIAL_MISSING','TECHNICAL_FAILURE',
  'ACCESS_DENIED','ENGINEER_NO_SHOW','DAMAGE','SAFETY_INCIDENT','SCOPE_CHANGE',
  'APPROVAL_DELAY','OTHER'
];

function CreateIssueModal({ projectId, onClose, onCreated }) {
  const [form, setForm] = useState({ issueType: 'TECHNICAL_FAILURE', title: '', description: '', priority: 'MEDIUM' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title is required');
    setSaving(true);
    try {
      await issueApi.create(projectId, form);
      toast.success('Issue raised');
      onCreated();
      onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to raise issue'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">Raise New Issue</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Issue Type</label>
            <select value={form.issueType} onChange={e => setForm(f => ({ ...f, issueType: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none text-slate-700 bg-white">
              {ISSUE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="Describe the issue briefly" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none" placeholder="Additional details..." />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Priority</label>
            <div className="flex gap-2">
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => (
                <button key={p} type="button" onClick={() => setForm(f => ({ ...f, priority: p }))}
                  className={`flex-1 text-xs py-2 rounded-lg border font-semibold transition-colors ${form.priority === p ? `${PRIORITY_COLOR[p]} border-current` : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-60">
              {saving ? 'Raising...' : 'Raise Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function IssuesPage({ projectId }) {
  const [issues, setIssues] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filters, setFilters] = useState({ status: '', priority: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await issueApi.getAll(projectId, filters);
      setIssues(res.data.data);
      setTotal(res.data.total);
    } catch { toast.error('Failed to load issues'); }
    finally { setLoading(false); }
  }, [projectId, filters]);

  useEffect(() => { load(); }, [load]);

  const openCount = issues.filter(i => !['CLOSED', 'RESOLVED', 'CANCELLED'].includes(i.status)).length;

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Issues</h2>
          <p className="text-sm text-slate-500 mt-0.5">{openCount} open · {total} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"><FiRefreshCw size={14} /></button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            <FiPlus size={14} /> Raise Issue
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none text-slate-600">
          <option value="">All Status</option>
          {['RAISED','ASSIGNED','IN_PROGRESS','RESOLVED','VERIFIED','CLOSED'].map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
        <select value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none text-slate-600">
          <option value="">All Priority</option>
          {['LOW','MEDIUM','HIGH','CRITICAL'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Issues List */}
      <div className="space-y-3">
        {loading
          ? [...Array(4)].map((_, i) => <div key={i} className="h-20 bg-white rounded-xl border border-slate-200 animate-pulse" />)
          : issues.length === 0
          ? (
            <div className="text-center py-16 text-slate-400">
              <FiAlertCircle size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No issues reported for this project.</p>
            </div>
          )
          : issues.map(issue => (
            <div key={issue._id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-400">{issue.issueCode}</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{issue.issueType?.replace(/_/g, ' ')}</span>
                  </div>
                  <h3 className="font-semibold text-slate-800">{issue.title}</h3>
                  {issue.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{issue.description}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusBadge status={issue.status} />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PRIORITY_COLOR[issue.priority]}`}>{issue.priority}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                <span>Raised by {issue.raisedByRole || 'System'}</span>
                <span>·</span>
                <span>{new Date(issue.raisedAt || issue.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                {issue.slaStatus === 'BREACHED' && <span className="text-red-500 font-semibold">SLA Breached</span>}
              </div>
            </div>
          ))}
      </div>

      {showCreate && <CreateIssueModal projectId={projectId} onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}
