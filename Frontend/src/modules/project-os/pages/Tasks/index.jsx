import React, { useState, useEffect, useCallback } from 'react';
import { FiPlus, FiSearch, FiUser, FiAlertCircle, FiCheck, FiClock, FiRefreshCw } from 'react-icons/fi';
import { taskApi } from '../../services/projectOS.api';
import { StatusBadge } from '../../components/WidgetRenderer';
import toast from 'react-hot-toast';

const KANBAN_COLUMNS = [
  { key: 'UNASSIGNED', label: 'Unassigned', color: 'bg-slate-200 text-slate-600' },
  { key: 'ASSIGNED,ACCEPTED,TRAVELLING,ARRIVED', label: 'Assigned', color: 'bg-blue-100 text-blue-700' },
  { key: 'IN_PROGRESS,BLOCKED', label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  { key: 'SUBMITTED,QA_REVIEW', label: 'In Review', color: 'bg-purple-100 text-purple-700' },
  { key: 'APPROVED,COMPLETED', label: 'Done', color: 'bg-emerald-100 text-emerald-700' },
];

const PRIORITY_COLOR = {
  LOW: 'bg-slate-100 text-slate-500',
  MEDIUM: 'bg-blue-100 text-blue-600',
  HIGH: 'bg-amber-100 text-amber-700',
  CRITICAL: 'bg-red-100 text-red-700'
};

// Single task card for kanban board
function TaskCard({ task, onAction }) {
  const isOverdue = task.slaDeadline && new Date(task.slaDeadline) < new Date() && !['COMPLETED','APPROVED','CANCELLED'].includes(task.status);
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">{task.title}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.MEDIUM}`}>{task.priority}</span>
      </div>
      {task.site && <p className="text-xs text-slate-400 mb-2">📍 {task.site.name}</p>}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          {task.assignedTo ? (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">
                {(task.assignedTo.name || 'E').charAt(0)}
              </div>
              <span className="max-w-20 truncate">{task.assignedTo.name}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400 flex items-center gap-1"><FiUser size={11} /> Unassigned</span>
          )}
        </div>
        {isOverdue && (
          <span className="text-xs text-red-500 flex items-center gap-1"><FiAlertCircle size={11} /> Overdue</span>
        )}
        {task.slaDeadline && !isOverdue && (
          <span className="text-xs text-slate-400 flex items-center gap-1"><FiClock size={11} />{new Date(task.slaDeadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
        )}
      </div>
    </div>
  );
}

export default function TasksPage({ projectId }) {
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban'); // 'kanban' | 'list'
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await taskApi.getAll(projectId, { limit: 100 });
      setTasks(res.data.data);
      setTotal(res.data.total);
    } catch { toast.error('Failed to load tasks'); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const filtered = tasks.filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()));

  const getColumnTasks = (statusKey) => {
    const statuses = statusKey.split(',');
    return filtered.filter(t => statuses.includes(t.status));
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1800px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Tasks</h2>
          <p className="text-sm text-slate-500 mt-0.5">{total} total tasks</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 text-xs">
            <button onClick={() => setView('kanban')} className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${view === 'kanban' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Board</button>
            <button onClick={() => setView('list')} className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${view === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>List</button>
          </div>
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><FiRefreshCw size={14} /></button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm max-w-sm">
        <FiSearch size={14} className="text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks..." className="bg-transparent text-sm outline-none flex-1 text-slate-700 placeholder-slate-400" />
      </div>

      {/* ── KANBAN VIEW ─────────────────────────────────────────────────── */}
      {view === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map(col => {
            const colTasks = getColumnTasks(col.key);
            return (
              <div key={col.key} className="flex flex-col gap-3 min-w-72 max-w-72 shrink-0">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${col.color}`}>{col.label}</span>
                  <span className="text-xs text-slate-400 font-medium">{colTasks.length}</span>
                </div>
                <div className="flex flex-col gap-2 min-h-24">
                  {loading ? (
                    [...Array(2)].map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />)
                  ) : colTasks.length === 0 ? (
                    <div className="h-16 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center">
                      <p className="text-xs text-slate-300">No tasks</p>
                    </div>
                  ) : colTasks.map(task => <TaskCard key={task._id} task={task} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── LIST VIEW ───────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Task', 'Site', 'Priority', 'Assigned To', 'Status', 'SLA Deadline'].map(h => (
                  <th key={h} className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(5)].map((_, i) => <tr key={i} className="border-b border-slate-100">{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>)}</tr>)
                : filtered.map(task => (
                  <tr key={task._id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">{task.title}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{task.site?.name || '—'}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PRIORITY_COLOR[task.priority]}`}>{task.priority}</span></td>
                    <td className="px-4 py-3 text-slate-600">{task.assignedTo?.name || <span className="text-slate-300">Unassigned</span>}</td>
                    <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{task.slaDeadline ? new Date(task.slaDeadline).toLocaleDateString('en-IN') : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
