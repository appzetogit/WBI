import React, { useState, useEffect, useCallback } from 'react';
import { Calendar as CalIcon } from 'lucide-react';
import { fetchCalendar } from '../../../services/projectOpsService';
import { useProjectOps } from '../context/ProjectOpsContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';

const TYPE_COLORS = {
  project: 'border-l-blue-500 bg-blue-50',
  milestone: 'border-l-violet-500 bg-violet-50',
  dispatch: 'border-l-emerald-500 bg-emerald-50',
  leave: 'border-l-amber-500 bg-amber-50',
  meeting: 'border-l-indigo-500 bg-indigo-50',
  holiday: 'border-l-rose-500 bg-rose-50',
  maintenance: 'border-l-orange-500 bg-orange-50',
  deadline: 'border-l-red-500 bg-red-50'
};

const CalendarSchedule = () => {
  const { refreshKey } = useProjectOps();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [view, setView] = useState('week');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - (view === 'month' ? 7 : 1));
      const to = new Date();
      to.setDate(to.getDate() + (view === 'month' ? 35 : view === 'week' ? 7 : 2));
      const params = { from: from.toISOString(), to: to.toISOString() };
      if (type) params.type = type;
      const res = await fetchCalendar(params);
      setEvents(res.data.data || []);
    } catch { setEvents([]); }
    finally { setLoading(false); }
  }, [type, view]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Group by date
  const byDate = events.reduce((acc, ev) => {
    const key = new Date(ev.start).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {['day', 'week', 'month'].map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize ${view === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {v}
          </button>
        ))}
        <select value={type} onChange={(e) => setType(e.target.value)} className="ml-auto px-3 py-1.5 text-xs border border-gray-200 rounded-lg">
          <option value="">All types</option>
          {['project', 'milestone', 'dispatch', 'leave', 'meeting', 'maintenance', 'deadline'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : events.length === 0 ? (
        <EmptyState icon={CalIcon} title="No scheduled events" description="Projects, milestones, leaves and meetings appear on this calendar." />
      ) : (
        <div className="space-y-5">
          {Object.entries(byDate).map(([date, list]) => (
            <div key={date}>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{date}</h3>
              <div className="space-y-2">
                {list.map((ev) => (
                  <div key={ev._id} className={`border-l-4 rounded-lg px-4 py-3 ${TYPE_COLORS[ev.type] || TYPE_COLORS.project}`}>
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{ev.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 capitalize">
                          {ev.type} · {ev.engineerName || 'Team'} · {ev.location || '—'}
                          {ev.projectId?.projectCode ? ` · ${ev.projectId.projectCode}` : ''}
                        </p>
                      </div>
                      <div className="text-right text-xs text-gray-500 shrink-0">
                        <p>{new Date(ev.start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="capitalize">{ev.status}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default CalendarSchedule;
