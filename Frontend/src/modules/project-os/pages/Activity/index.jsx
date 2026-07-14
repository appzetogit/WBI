import React, { useState, useEffect } from 'react';
import { activityApi } from '../../services/projectOS.api';
import toast from 'react-hot-toast';

const EVENT_ICON = {
  PROJECT_CREATED: '🚀', PROJECT_STATUS_CHANGED: '🔄', PROJECT_COMPLETED: '🏆',
  SITE_CREATED: '📍', SITE_ASSIGNED: '👤', SITE_COMPLETED: '✅', SITE_BULK_IMPORTED: '📥',
  TASK_CREATED: '📋', TASK_ASSIGNED: '👤', TASK_ACCEPTED: '👍', TASK_STARTED: '▶️',
  TASK_SUBMITTED: '📤', TASK_APPROVED: '✅', TASK_REJECTED: '❌', TASK_COMPLETED: '🏁',
  FORM_SUBMITTED: '📝', FORM_APPROVED: '✅', FORM_REJECTED: '❌',
  MILESTONE_STARTED: '🏃', MILESTONE_COMPLETED: '🏆', MILESTONE_APPROVED: '✅',
  ISSUE_RAISED: '⚠️', ISSUE_RESOLVED: '✅', ISSUE_ESCALATED: '🔺',
  SLA_WARNING: '⏰', SLA_BREACHED: '🚨', SLA_ESCALATED: '📞',
  INVOICE_CREATED: '💰', PAYMENT_RECEIVED: '💳',
};

const EVENT_COLOR = {
  PROJECT_CREATED: 'bg-emerald-100 text-emerald-700',
  TASK_APPROVED: 'bg-emerald-100 text-emerald-700',
  TASK_COMPLETED: 'bg-emerald-100 text-emerald-700',
  TASK_REJECTED: 'bg-red-100 text-red-700',
  ISSUE_RAISED: 'bg-amber-100 text-amber-700',
  ISSUE_ESCALATED: 'bg-red-100 text-red-700',
  SLA_BREACHED: 'bg-red-100 text-red-700',
  SLA_WARNING: 'bg-amber-100 text-amber-700',
  PAYMENT_RECEIVED: 'bg-emerald-100 text-emerald-700',
};

function getEventColor(type) {
  return EVENT_COLOR[type] || 'bg-slate-100 text-slate-600';
}

export default function ActivityPage({ projectId }) {
  const [activities, setActivities] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    activityApi.getAll(projectId, { page, limit: 30 })
      .then(res => { setActivities(res.data.data); setTotal(res.data.total); })
      .catch(() => toast.error('Failed to load activity'))
      .finally(() => setLoading(false));
  }, [projectId, page]);

  // Group by date
  const grouped = activities.reduce((acc, a) => {
    const date = new Date(a.createdAt).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(a);
    return acc;
  }, {});

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Activity Log</h2>
        <p className="text-sm text-slate-500 mt-0.5">{total} total events</p>
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-white rounded-xl border border-slate-200 animate-pulse" />)}</div>
      ) : activities.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No activity recorded yet.</div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([date, events]) => (
            <div key={date}>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 sticky top-0 bg-[#F8FAFC] py-1">{date}</h3>
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
                <div className="space-y-3">
                  {events.map((a, i) => (
                    <div key={i} className="flex gap-4 relative pl-12">
                      {/* Icon */}
                      <div className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center text-sm z-10 ${getEventColor(a.eventType)}`}>
                        {EVENT_ICON[a.eventType] || '•'}
                      </div>
                      {/* Content */}
                      <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                        <p className="text-sm text-slate-800">{a.description}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                          <span className="font-medium text-slate-500">{a.actorName || a.actorRole}</span>
                          <span>·</span>
                          <span>{new Date(a.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span>·</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${getEventColor(a.eventType)}`}>{a.eventType?.replace(/_/g, ' ')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 30 && (
        <div className="flex justify-center gap-3 pt-4">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-40 bg-white hover:bg-slate-50">Previous</button>
          <button disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-40 bg-white hover:bg-slate-50">Next</button>
        </div>
      )}
    </div>
  );
}
