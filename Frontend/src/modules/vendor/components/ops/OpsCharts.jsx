import React, { useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Legend
} from 'recharts';
import { Table2, BarChart3 } from 'lucide-react';

/*
 * Chart tokens (validated with the dataviz palette validator against the
 * panel's white card surface): single-series marks use blue; the two-series
 * trend uses blue + orange (adjacent CVD ΔE 24.7, normal-vision 33.6).
 * Status red/green is NOT used as a stacked pair — it fails CVD separation —
 * so SLA is shown as a single "% met" series instead.
 */
const C = {
  series1: '#2a78d6',
  series2: '#eb6834',
  grid: '#e1e0d9',
  axis: '#898781',
  ink: '#52514e'
};

const axisProps = { stroke: C.axis, tick: { fill: C.axis, fontSize: 11 }, tickLine: false, axisLine: { stroke: C.grid } };

const TooltipBox = ({ active, payload, label, format }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-gray-900 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-gray-700">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
          {p.name}: <b className="text-gray-900 tabular-nums">{format ? format(p.value, p.payload) : p.value}</b>
        </p>
      ))}
    </div>
  );
};

/** Card with a chart ↔ table toggle (table view is the accessible fallback). */
export const ChartCard = ({ title, subtitle, rows, columns, empty = 'No data for this period', children }) => {
  const [table, setTable] = useState(false);
  const hasData = rows && rows.length > 0;
  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm min-w-0">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
        </div>
        {hasData && (
          <button
            type="button"
            onClick={() => setTable((t) => !t)}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900"
            aria-label={table ? 'Show chart' : 'Show data table'}
            title={table ? 'Show chart' : 'Show data table'}
          >
            {table ? <BarChart3 className="w-4 h-4" /> : <Table2 className="w-4 h-4" />}
          </button>
        )}
      </div>
      {!hasData ? (
        <p className="py-10 text-center text-xs text-gray-400">{empty}</p>
      ) : table ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left">
              <tr>{columns.map((c) => <th key={c.key} className="py-1 pr-3 font-semibold">{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  {columns.map((c) => <td key={c.key} className="py-1.5 pr-3 tabular-nums text-gray-800">{c.format ? c.format(r[c.key], r) : r[c.key] ?? '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : children}
    </section>
  );
};

/** Horizontal single-hue bars: counts by category (status, service, engineer). */
export const HBarChart = ({ rows, labelKey, valueKey, valueName = 'Jobs', height }) => (
  <ResponsiveContainer width="100%" height={height || Math.max(160, rows.length * 30 + 30)}>
    <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={2}>
      <CartesianGrid horizontal={false} stroke={C.grid} strokeWidth={1} />
      <XAxis type="number" allowDecimals={false} {...axisProps} />
      <YAxis type="category" dataKey={labelKey} width={120} {...axisProps} tick={{ fill: C.ink, fontSize: 11 }} />
      <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<TooltipBox />} />
      <Bar dataKey={valueKey} name={valueName} fill={C.series1} radius={[0, 4, 4, 0]} maxBarSize={18} />
    </BarChart>
  </ResponsiveContainer>
);

/** Line chart over periods. `series`: [{ key, name }] — max two, one axis. */
export const TrendChart = ({ rows, xKey = 'period', series, format, height = 220 }) => (
  <ResponsiveContainer width="100%" height={height}>
    <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
      <CartesianGrid vertical={false} stroke={C.grid} strokeWidth={1} />
      <XAxis dataKey={xKey} {...axisProps} minTickGap={16} />
      <YAxis allowDecimals={false} {...axisProps} width={44} tickFormatter={format ? (v) => format(v) : undefined} />
      <Tooltip content={<TooltipBox format={format ? (v) => format(v) : undefined} />} cursor={{ stroke: C.axis, strokeDasharray: '3 3' }} />
      {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, color: C.ink }} />}
      {series.map((s, i) => (
        <Line
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.name}
          stroke={i === 0 ? C.series1 : C.series2}
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 2, fill: '#ffffff' }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
          connectNulls
        />
      ))}
    </LineChart>
  </ResponsiveContainer>
);
