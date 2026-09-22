import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, X, UserX, UserCheck, Pencil, Loader2 } from 'lucide-react';
import { ConfirmDialog, Modal } from '../../../components/ops/OpsUi';
import {
  activateEngineer, deactivateEngineer, approveEngineerJoin, rejectEngineerJoin, errorMessage
} from '../../../services/vendorJobsService';

const btn = 'px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 disabled:opacity-50';

/**
 * Team actions for one engineer, driven by the server's `actions` flags.
 * Every action is re-checked by the server (e.g. no deactivation while the
 * engineer holds a job).
 */
const TeamActions = ({ row, onChanged, onEdit, size = 'sm' }) => {
  const a = row.actions || {};
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try {
      const res = await fn();
      toast.success(res?.message || 'Done');
      setDialog(null);
      onChanged?.();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pad = size === 'lg' ? 'px-3 py-2 text-xs' : '';
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {a.approveJoin && (
          <button type="button" disabled={busy} onClick={() => run(() => approveEngineerJoin(row.id))} className={`${btn} ${pad} bg-emerald-600 text-white`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
          </button>
        )}
        {a.rejectJoin && (
          <button type="button" disabled={busy} onClick={() => setDialog('reject')} className={`${btn} ${pad} border border-red-200 text-red-700`}>
            <X className="w-3.5 h-3.5" /> Decline
          </button>
        )}
        {a.edit && onEdit && (
          <button type="button" onClick={() => onEdit(row)} className={`${btn} ${pad} border border-gray-200 text-gray-700`}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
        {a.reactivate && (
          <button type="button" disabled={busy} onClick={() => run(() => activateEngineer(row.id))} className={`${btn} ${pad} border border-emerald-200 text-emerald-700`}>
            <UserCheck className="w-3.5 h-3.5" /> Reactivate
          </button>
        )}
        {a.deactivate && (
          <button type="button" disabled={busy} onClick={() => setDialog(a.deactivateBlockedBy?.length ? 'blocked' : 'deactivate')} className={`${btn} ${pad} border border-red-200 text-red-700`}>
            <UserX className="w-3.5 h-3.5" /> Deactivate
          </button>
        )}
      </div>

      {dialog === 'reject' && (
        <ConfirmDialog
          title={`Decline ${row.name}'s join request?`}
          message="They are removed from your team and told the reason. Their WBI account is not affected."
          confirmLabel="Decline request"
          danger
          requireReason
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => run(() => rejectEngineerJoin(row.id, reason))}
        />
      )}
      {dialog === 'deactivate' && (
        <ConfirmDialog
          title={`Deactivate ${row.name}?`}
          message="They stop receiving new jobs from you immediately and are told the reason. You can reactivate them any time."
          confirmLabel="Deactivate"
          danger
          requireReason
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => run(() => deactivateEngineer(row.id, reason))}
        />
      )}
      {dialog === 'blocked' && (
        <Modal
          title={`${row.name} is on ${a.deactivateBlockedBy.length} job(s)`}
          subtitle="Reassign these jobs first, then deactivate."
          onClose={() => setDialog(null)}
          footer={<button type="button" onClick={() => setDialog(null)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold">OK</button>}
        >
          <ul className="space-y-1">
            {a.deactivateBlockedBy.map((code) => <li key={code} className="font-mono text-sm font-bold text-gray-900">{code}</li>)}
          </ul>
          <p className="mt-3 text-xs text-gray-500">Open Jobs → Assigned / Accepted / In Progress and use Reassign on each one.</p>
        </Modal>
      )}
    </>
  );
};

export default TeamActions;
