import React, { useState, useEffect } from 'react';
import { FiFlag, FiCheckCircle, FiClock, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { milestoneApi } from '../../services/projectOS.api';
import { StatusBadge } from '../../components/WidgetRenderer';
import toast from 'react-hot-toast';

export default function MilestonesPage({ projectId, milestones: initialData, onRefresh }) {
  const [milestones, setMilestones] = useState(initialData || []);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (!initialData?.length) {
      setLoading(true);
      milestoneApi.getAll(projectId)
        .then(res => setMilestones(res.data.data || []))
        .catch(() => toast.error('Failed to load milestones'))
        .finally(() => setLoading(false));
    } else {
      setMilestones(initialData);
    }
  }, [projectId, initialData]);

  const completedCount = milestones.filter(m => m.status === 'COMPLETED').length;
  const totalCount = milestones.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Milestones</h2>
          <p className="text-sm text-slate-500 mt-0.5">{completedCount}/{totalCount} completed · {overallProgress}% overall</p>
        </div>
        <button onClick={onRefresh} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <FiRefreshCw size={14} />
        </button>
      </div>

      {/* Overall progress bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-semibold text-slate-700">Overall Milestone Progress</span>
          <span className="font-bold text-slate-800">{overallProgress}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div className="bg-emerald-500 h-3 rounded-full transition-all duration-700" style={{ width: `${overallProgress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-2">
          <span>{completedCount} completed</span>
          <span>{totalCount - completedCount} remaining</span>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />)}</div>
      ) : milestones.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FiFlag size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No milestones configured. They will be auto-generated from the project template.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-slate-200" />
          <div className="space-y-4">
            {milestones.map((m, i) => {
              const isCompleted = m.status === 'COMPLETED';
              const isInProgress = m.status === 'IN_PROGRESS';
              const isBlocked = m.status === 'BLOCKED';

              return (
                <div key={m._id || i} className="flex gap-5 relative">
                  {/* Step indicator */}
                  <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-sm font-bold z-10 shrink-0 transition-all ${
                    isCompleted ? 'bg-emerald-500 border-emerald-500 text-white shadow-emerald-200 shadow-md' :
                    isInProgress ? 'bg-blue-500 border-blue-500 text-white shadow-blue-200 shadow-md' :
                    isBlocked ? 'bg-red-100 border-red-400 text-red-500' :
                    'bg-white border-slate-300 text-slate-400'
                  }`}>
                    {isCompleted ? <FiCheckCircle size={18} /> : <span>{m.order}</span>}
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{m.title}</h3>
                        {m.description && <p className="text-sm text-slate-500 mt-1">{m.description}</p>}
                      </div>
                      <StatusBadge status={m.status || 'NOT_STARTED'} />
                    </div>

                    {/* Progress bar for in-progress milestones */}
                    {isInProgress && m.completionPercentage > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                          <span>Progress</span>
                          <span>{m.completionPercentage}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${m.completionPercentage}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Meta info row */}
                    <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-slate-400">
                      {m.plannedDate && (
                        <span className="flex items-center gap-1">
                          <FiClock size={11} />
                          Planned: {new Date(m.plannedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      {m.actualDate && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <FiCheckCircle size={11} />
                          Completed: {new Date(m.actualDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      {m.requiresApproval && (
                        <span className={`flex items-center gap-1 ${m.approvalStatus === 'APPROVED' ? 'text-emerald-600' : 'text-amber-500'}`}>
                          <FiAlertCircle size={11} />
                          Approval: {m.approvalStatus || 'Pending'}
                        </span>
                      )}
                      {m.requiresInvoice && m.invoicePercentage > 0 && (
                        <span className="flex items-center gap-1 text-blue-500">
                          💰 Invoice: {m.invoicePercentage}% of contract
                          {m.invoiceTriggered && <FiCheckCircle size={11} className="text-emerald-500" />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
