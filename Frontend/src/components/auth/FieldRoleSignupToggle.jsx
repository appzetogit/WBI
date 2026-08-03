import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const clearRoleAuth = (role) => {
  if (role === 'worker') {
    localStorage.removeItem('workerAccessToken');
    localStorage.removeItem('workerRefreshToken');
    localStorage.removeItem('workerData');
    return;
  }
  localStorage.removeItem('engineerAccessToken');
  localStorage.removeItem('engineerRefreshToken');
  localStorage.removeItem('engineerData');
};

/**
 * Worker / Engineer signup header switch — SPA navigate (no full reload).
 * Active tab follows the URL.
 */
export default function FieldRoleSignupToggle() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isEngineer = pathname.startsWith('/engineer');
  const isWorker = pathname.startsWith('/worker');

  const base =
    'px-4 py-2 rounded-lg text-sm font-semibold transition-all inline-flex items-center justify-center select-none cursor-pointer border-0';
  const workerActive = 'bg-white text-black shadow-sm';
  const engineerActive = 'bg-white text-[#4F46E5] shadow-sm';
  const inactive = 'bg-transparent text-gray-500 hover:text-gray-700';

  const go = (role) => {
    const path = role === 'engineer' ? '/engineer/signup' : '/worker/signup';
    // Already on this role
    if ((role === 'engineer' && isEngineer) || (role === 'worker' && isWorker)) return;
    clearRoleAuth(role);
    navigate(path, { replace: true });
  };

  return (
    <div
      className="flex bg-gray-100 p-1 rounded-xl relative z-10 shrink-0"
      role="tablist"
      aria-label="Signup role"
    >
      <button
        type="button"
        role="tab"
        aria-selected={isWorker}
        onClick={() => go('worker')}
        className={`${base} ${isWorker ? workerActive : inactive}`}
      >
        Worker
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isEngineer}
        onClick={() => go('engineer')}
        className={`${base} ${isEngineer ? engineerActive : inactive}`}
      >
        Engineer
      </button>
    </div>
  );
}
