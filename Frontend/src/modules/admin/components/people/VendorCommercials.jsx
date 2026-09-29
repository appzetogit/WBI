import React, { useState } from 'react';
import api from '../../../../services/api';
import { Button, Field } from '../../pages/ControlCenter/ui';
import { useApi, act, inputCls } from '../../pages/ControlCenter/helpers';

/** Vendor commission override + performance scorecard (spec §4). */
const VendorCommercials = ({ vendorId }) => {
  const perf = useApi(`/admin/vendors/${vendorId}/performance`);
  const [percent, setPercent] = useState('');
  const [reason, setReason] = useState('');
  const p = perf.data;
  const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
  return (
    <div className="space-y-3">
      {p && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[['Jobs (B2C+B2B)', p.jobs.total], ['Completion rate', pct(p.completionRate)], ['Cancellation rate', pct(p.cancellationRate)], ['SLA compliance', pct(p.slaCompliance)],
            ['Avg completion', p.avgCompletionMins ? `${p.avgCompletionMins} min` : '—'], ['Rating', p.rating ? `${p.rating} (${p.reviews})` : 'New'], ['Active engineers', p.activeEngineers], ['Commission', p.commissionOverride === null ? 'Default' : `${p.commissionOverride}%`]]
            .map(([l, v]) => (
              <div key={l} className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                <p className="text-[10px] uppercase font-bold text-gray-400">{l}</p>
                <p className="text-lg font-bold text-gray-900">{v}</p>
              </div>
            ))}
        </div>
      )}
      <div className="grid sm:grid-cols-3 gap-3 items-end">
        <Field label="Commission % (blank = default)"><input type="number" min="0" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} className={inputCls} /></Field>
        <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></Field>
        <Button disabled={!reason} onClick={async () => {
          if (await act(() => api.patch(`/admin/vendors/${vendorId}/commission`, { percent: percent === '' ? null : Number(percent), reason }))) { setReason(''); perf.reload(); }
        }}>Save commission</Button>
      </div>
    </div>
  );
};

export default VendorCommercials;
