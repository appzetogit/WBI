/* Shared, non-component helpers for the vendor operations pages. */

/** Canonical job lifecycle states → label + colour (matches backend jobStateMachine). */
export const JOB_STATUS_META = {
  CREATED: { label: 'Created', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  VALIDATED: { label: 'Validated', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  ROUTED: { label: 'New Request', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  PENDING_ASSIGNMENT: { label: 'Pending Assignment', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  ASSIGNED: { label: 'Assigned', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  REASSIGNED: { label: 'Reassigned', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  ACCEPTED: { label: 'Accepted', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  EN_ROUTE: { label: 'En Route', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  ARRIVED: { label: 'Arrived', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  ON_HOLD: { label: 'On Hold', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  VERIFICATION: { label: 'Verification', cls: 'bg-lime-50 text-lime-800 border-lime-200' },
  CLOSED: { label: 'Closed', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  REJECTED: { label: 'Rejected', cls: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-50 text-red-700 border-red-200' },
  FAILED: { label: 'Failed', cls: 'bg-red-100 text-red-800 border-red-300' }
};

export const formatINR = (n) => (typeof n === 'number' ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—');
export const formatDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** Merge two period series into one row per period (missing = 0). */
export const mergeByPeriod = (a = [], aKey, b = [], bKey) => {
  const map = new Map();
  a.forEach((r) => map.set(r.period, { period: r.period, [aKey]: r[aKey], [bKey]: 0 }));
  b.forEach((r) => map.set(r.period, { ...(map.get(r.period) || { period: r.period, [aKey]: 0 }), [bKey]: r[bKey] }));
  return [...map.values()].sort((x, y) => String(x.period).localeCompare(String(y.period)));
};
