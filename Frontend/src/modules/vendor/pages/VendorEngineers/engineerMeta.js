/* Labels and colours for the Engineers section. Status definitions live in the
 * backend (services/vendorEngineers.service.js); this only presents them. */

export const TEAM_STATUS = {
  PENDING: { label: 'Pending', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  ACTIVE: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  INACTIVE: { label: 'Inactive', cls: 'bg-gray-100 text-gray-600 border-gray-300' }
};

export const PENDING_ON = {
  vendor: 'Needs your approval',
  wbi: 'WBI verification'
};

export const AVAILABILITY = {
  available: { label: 'Available', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  busy: { label: 'On a job', cls: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  at_capacity: { label: 'At capacity', cls: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  on_leave: { label: 'On leave', cls: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  off_today: { label: 'Off today', cls: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
  offline: { label: 'Offline', cls: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
  unavailable: { label: 'Cannot take jobs', cls: 'bg-gray-50 text-gray-500 border-gray-200', dot: 'bg-gray-300' }
};
/** Filter groups; 'busy' includes engineers at capacity (same as the dashboard). */
export const AVAILABILITY_ORDER = ['available', 'busy', 'on_leave', 'off_today', 'offline'];
export const availabilityCount = (counts, key) => (key === 'busy' ? (counts?.busy || 0) + (counts?.at_capacity || 0) : counts?.[key] || 0);
export const inAvailability = (status, key) => status === key || (key === 'busy' && status === 'at_capacity');

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const SKILL_GAP = {
  no_active_engineer: 'You cover this service but have no active engineer with the skill — routing will not offer you these jobs.',
  no_engineer_no_coverage: 'No active engineer and no service area set.',
  no_coverage: 'Engineers are ready but you have no service area set — add cities or pincodes under Services.',
  none_available_now: 'Skilled engineers exist, but none can take a job right now (leave, busy or deactivated).',
  service_suspended: 'This service is suspended for your account by WBI.'
};

/** "06:30 PM" → "18:30" for <input type="time">. */
export const to24h = (clock) => {
  const m = String(clock || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return '';
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};

export const minutesLabel = (m) => {
  if (m === null || m === undefined) return '—';
  if (m < 60) return `${m} min`;
  if (m < 60 * 48) return `${Math.round((m / 60) * 10) / 10} h`;
  return `${Math.round(m / 1440)} d`;
};

export const pctLabel = (v) => (v === null || v === undefined ? '—' : `${v}%`);
