import React from 'react';
import { LogOut, X } from 'lucide-react';

/** Confirm dialog used by header / sidebar / settings */
export default function VendorLogoutConfirm({ open, loggingOut, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vendor-logout-title"
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <LogOut className="h-5 w-5" />
            </span>
            <div>
              <h2 id="vendor-logout-title" className="text-base font-bold text-gray-900">Sign out?</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                You will need to log in again to access the vendor portal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loggingOut}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={loggingOut}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loggingOut}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  );
}
