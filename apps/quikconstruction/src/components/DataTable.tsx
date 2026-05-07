'use client';

import { useState, useMemo, useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ColType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export interface ColDef<T = Record<string, unknown>> {
  key: string;
  label: string;
  type?: ColType;
  options?: string[];
  sortable?: boolean;
  searchable?: boolean;
  freezable?: boolean;
  hideable?: boolean;
  width?: string;
  render?: (row: T, i: number) => React.ReactNode;
  getValue?: (row: T) => string | number | boolean;
}

interface SortCond { key: string; dir: 'asc' | 'desc' }
interface FilterCond { id: string; colKey: string; operator: string; value: string; logic: 'AND' | 'OR' }

interface DataTableProps<T = Record<string, unknown>> {
  id: string;
  columns: ColDef<T>[];
  data: T[];
  onAdd?: () => void;
  addLabel?: string;
  defaultSort?: string;
  defaultSortDir?: 'asc' | 'desc';
  auditEnabled?: boolean;
  /**
   * When true, the table grows with its content instead of capping at 65vh
   * with an internal scrollbar. Use this on pages that already have other
   * content above the table so scrolling stays at the page level rather
   * than producing a nested scrollbar inside the table.
   */
  fitToContent?: boolean;
}

const PAGE_SIZES = [10, 25, 50, 100];

// ─── Audit columns (auto-appended to every grid) ──────────────────────────────

export const AUDIT_COLS: ColDef<Record<string, unknown>>[] = [
  { key: 'createdAt', label: 'Created At', type: 'date', width: '115px', hideable: true, freezable: false },
  { key: 'updatedAt', label: 'Updated At', type: 'date', width: '115px', hideable: true, freezable: false },
  { key: 'createdBy', label: 'Created By', type: 'text', width: '130px', hideable: true, freezable: false },
  { key: 'updatedBy', label: 'Updated By', type: 'text', width: '130px', hideable: true, freezable: false },
];

// ─── Operators ────────────────────────────────────────────────────────────────

const TEXT_OPS = [
  { v: 'contains', l: 'Contains' }, { v: 'not_contains', l: 'Does not contain' },
  { v: 'equals', l: 'Is exactly' }, { v: 'not_equals', l: 'Is not' },
  { v: 'starts_with', l: 'Starts with' }, { v: 'ends_with', l: 'Ends with' },
  { v: 'is_empty', l: 'Is empty' }, { v: 'is_not_empty', l: 'Is not empty' },
];
const NUMBER_OPS = [
  { v: '=', l: '= equals' }, { v: '!=', l: '≠ not equals' }, { v: '>', l: '> greater than' },
  { v: '<', l: '< less than' }, { v: '>=', l: '≥ at least' }, { v: '<=', l: '≤ at most' },
  { v: 'between', l: 'Between' },
];
const DATE_OPS = [
  { v: 'on', l: 'Is on' }, { v: 'before', l: 'Is before' }, { v: 'after', l: 'Is after' },
  { v: 'between', l: 'Is between' }, { v: 'this_week', l: 'This week' },
  { v: 'this_month', l: 'This month' }, { v: 'is_empty', l: 'Is empty' }, { v: 'is_not_empty', l: 'Is not empty' },
];
const SELECT_OPS = [
  { v: 'is', l: 'Is' }, { v: 'is_not', l: 'Is not' },
  { v: 'is_any_of', l: 'Is any of' }, { v: 'is_none_of', l: 'Is none of' },
];
const BOOL_OPS = [{ v: 'is_true', l: 'Is true' }, { v: 'is_false', l: 'Is false' }];

function getOps(type?: ColType) {
  switch (type) {
    case 'number': return NUMBER_OPS; case 'date': return DATE_OPS;
    case 'select': return SELECT_OPS; case 'boolean': return BOOL_OPS;
    default: return TEXT_OPS;
  }
}
function defaultOp(type?: ColType) {
  switch (type) {
    case 'number': return '='; case 'date': return 'on';
    case 'select': return 'is'; case 'boolean': return 'is_true';
    default: return 'contains';
  }
}

const NO_VALUE_OPS = new Set(['is_empty', 'is_not_empty', 'is_true', 'is_false', 'this_week', 'this_month']);

// ─── Row filter logic ─────────────────────────────────────────────────────────

function matchCond<T extends Record<string, unknown>>(
  row: T, col: ColDef<T> | undefined, op: string, val: string
): boolean {
  const raw = col?.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col?.key ?? ''];
  const sv = String(raw ?? '').toLowerCase();
  const v = val.toLowerCase().trim();

  if (col?.type === 'date') {
    if (op === 'is_empty') return !raw;
    if (op === 'is_not_empty') return !!raw;
    if (!raw) return false;
    const rd = new Date(raw as string);
    if (op === 'on') return sv === v;
    if (op === 'before') return v ? rd < new Date(v) : true;
    if (op === 'after') return v ? rd > new Date(v) : true;
    const [v1, v2] = v.split('|');
    if (op === 'between') return (!v1 || rd >= new Date(v1)) && (!v2 || rd <= new Date(v2));
    if (op === 'this_week') {
      const now = new Date(); const s = new Date(now); s.setDate(now.getDate() - now.getDay()); s.setHours(0,0,0,0);
      const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23,59,59,999);
      return rd >= s && rd <= e;
    }
    if (op === 'this_month') { const n = new Date(); return rd.getMonth() === n.getMonth() && rd.getFullYear() === n.getFullYear(); }
    return true;
  }
  if (col?.type === 'number') {
    const n = Number(raw); const fv = Number(val);
    if (isNaN(n) || (!val && !NO_VALUE_OPS.has(op))) return !val;
    if (op === '=') return n === fv; if (op === '!=') return n !== fv;
    if (op === '>') return n > fv; if (op === '<') return n < fv;
    if (op === '>=') return n >= fv; if (op === '<=') return n <= fv;
    if (op === 'between') { const [a, b] = val.split('|'); return n >= Number(a) && n <= Number(b); }
    return true;
  }
  if (col?.type === 'select') {
    if (op === 'is') return !v || sv === v;
    if (op === 'is_not') return !v || sv !== v;
    if (op === 'is_any_of') { if (!v) return true; return v.split(',').map(s => s.trim()).includes(sv); }
    if (op === 'is_none_of') { if (!v) return true; return !v.split(',').map(s => s.trim()).includes(sv); }
    return true;
  }
  if (col?.type === 'boolean') { return op === 'is_true' ? Boolean(raw) : !Boolean(raw); }
  // text
  if (op === 'is_empty') return sv === ''; if (op === 'is_not_empty') return sv !== '';
  if (!v) return true;
  if (op === 'contains') return sv.includes(v); if (op === 'not_contains') return !sv.includes(v);
  if (op === 'equals') return sv === v; if (op === 'not_equals') return sv !== v;
  if (op === 'starts_with') return sv.startsWith(v); if (op === 'ends_with') return sv.endsWith(v);
  return true;
}

// ─── Change History Drawer ────────────────────────────────────────────────────

const MOCK_HISTORY = [
  { v: 3, at: '2024-04-07 14:30', by: 'Akhilesh Sharma', changes: [{ f: 'Status', from: 'Inactive', to: 'Active' }] },
  { v: 2, at: '2024-03-01 10:00', by: 'Alice Johnson', changes: [{ f: 'Role', from: 'Read Only', to: 'Tenant Admin' }, { f: 'Org', from: '—', to: 'Acme North' }] },
  { v: 1, at: '2024-01-15 09:00', by: 'Akhilesh Sharma', changes: [{ f: 'Record created', from: null, to: null }] },
];

function HistoryDrawer({ rowLabel, onClose }: { rowLabel: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-96 bg-white h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="font-semibold text-slate-800">Change History</div>
            <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[280px]">{rowLabel}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-100" />
            {MOCK_HISTORY.map((h, i) => (
              <div key={i} className="relative pl-10 pb-6">
                <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 border-white bg-orange-500 shadow-sm" />
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">v{h.v}</span>
                    <span className="text-[10px] text-slate-400">{h.at}</span>
                  </div>
                  <div className="text-xs text-slate-500 mb-2">by <span className="font-medium text-slate-700">{h.by}</span></div>
                  {h.changes.map((c, j) => (
                    <div key={j} className="text-xs">
                      {c.from === null ? (
                        <span className="text-emerald-600 font-medium">{c.f}</span>
                      ) : (
                        <span>
                          <span className="font-medium text-slate-700">{c.f}</span>
                          <span className="text-slate-400"> · </span>
                          <span className="line-through text-red-400">{c.from}</span>
                          <span className="text-slate-400"> → </span>
                          <span className="text-emerald-600 font-medium">{c.to}</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Filter Panel ───────────────────────────────────────────────────────

function QuickFilterPanel<T extends Record<string, unknown>>({
  columns, data, activeFilters, onToggle, onClear, filtered, onSwitchAdvanced,
}: {
  columns: ColDef<T>[];
  data: T[];
  activeFilters: Record<string, string[]>;
  onToggle: (colKey: string, val: string) => void;
  onClear: () => void;
  filtered: T[];
  onSwitchAdvanced: () => void;
}) {
  const selectCols = columns.filter(c => c.type === 'select' || c.options);

  const getCount = (colKey: string, val: string) => {
    const col = columns.find(c => c.key === colKey);
    return data.filter(row => {
      const rv = String(col?.getValue ? col.getValue(row) : (row as Record<string, unknown>)[colKey] ?? '');
      return rv === val;
    }).length;
  };

  const uniqueVals = (col: ColDef<T>) => {
    if (col.options) return col.options;
    const s = new Set<string>();
    data.forEach(row => {
      const v = String(col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key] ?? '');
      if (v) s.add(v);
    });
    return Array.from(s).sort();
  };

  const recentFilters: { colKey: string; colLabel: string; val: string }[] = [];
  Object.entries(activeFilters).forEach(([k, vals]) => {
    const col = columns.find(c => c.key === k);
    vals.forEach(v => recentFilters.push({ colKey: k, colLabel: col?.label ?? k, val: v }));
  });

  // Small column-tagging dots inside the filter popover. Kept brand-leaning
  // so the popover reads as part of the same design system as the toolbar.
  const chipColors = ['bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-rose-500', 'bg-slate-500', 'bg-orange-400'];

  return (
    <div className="absolute left-0 top-full mt-2 z-50 rounded-2xl border bg-white shadow-2xl" style={{ minWidth: '640px', maxWidth: '90vw' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm text-slate-800">Quick filters</span>
          <span className="text-xs text-slate-500">Showing <strong>{filtered.length}</strong> of <strong>{data.length}</strong> items</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClear} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 hover:bg-slate-100 rounded-lg">Clear all</button>
          <button className="text-xs border px-3 py-1.5 rounded-xl text-slate-600 hover:bg-slate-50">Save as new view</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex gap-0 overflow-x-auto max-h-72">
        {/* Recent filters */}
        <div className="shrink-0 w-44 border-r p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Recent filters</div>
          {recentFilters.length === 0 ? (
            <div className="text-xs text-slate-400 italic">No active filters</div>
          ) : recentFilters.map((rf, i) => (
            <button key={i} onClick={() => onToggle(rf.colKey, rf.val)}
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-orange-50 text-sm mb-0.5 bg-orange-50/70 border border-orange-100">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${chipColors[i % chipColors.length]}`} />
              <span className="truncate text-xs text-slate-700">{rf.colLabel}: {rf.val}</span>
              <span className="ml-auto text-[10px] text-slate-400">{getCount(rf.colKey, rf.val)}</span>
            </button>
          ))}
        </div>

        {/* All columns */}
        <div className="flex-1 p-4 overflow-x-auto">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">All columns</div>
          <div className="flex gap-4">
            {selectCols.map((col, ci) => (
              <div key={col.key} className="shrink-0 min-w-[120px]">
                <div className="text-xs font-medium text-slate-600 mb-2">{col.label}</div>
                {uniqueVals(col).map(val => {
                  const active = (activeFilters[col.key] ?? []).includes(val);
                  const count = getCount(col.key, val);
                  return (
                    <button key={val} onClick={() => onToggle(col.key, val)}
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-xs mb-0.5 transition-colors ${active ? 'bg-orange-50 border border-orange-200 text-orange-700' : 'hover:bg-slate-50 text-slate-700'}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${chipColors[ci % chipColors.length]}`} />
                      <span className="truncate flex-1">{val}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{count}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {selectCols.length === 0 && <div className="text-xs text-slate-400">No filter columns defined</div>}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t px-5 py-3 flex items-center justify-between">
        <button onClick={onSwitchAdvanced} className="text-xs text-orange-600 hover:text-orange-700 font-semibold hover:underline">
          Switch to advanced filters →
        </button>
      </div>
    </div>
  );
}

// ─── Advanced Filter Panel ────────────────────────────────────────────────────

function AdvancedFilterPanel<T extends Record<string, unknown>>({
  columns, conditions, data, filtered, onChangeConditions, onClear, onSwitchQuick,
}: {
  columns: ColDef<T>[];
  conditions: FilterCond[];
  data: T[];
  filtered: T[];
  onChangeConditions: (c: FilterCond[]) => void;
  onClear: () => void;
  onSwitchQuick: () => void;
}) {
  const uid = () => Math.random().toString(36).slice(2, 8);
  const searchable = columns.filter(c => c.searchable !== false);

  const addCond = () => {
    const col = searchable[0]; if (!col) return;
    onChangeConditions([...conditions, { id: uid(), colKey: col.key, operator: defaultOp(col.type), value: '', logic: 'AND' }]);
  };
  const update = (id: string, p: Partial<FilterCond>) => onChangeConditions(conditions.map(c => c.id === id ? { ...c, ...p } : c));
  const remove = (id: string) => onChangeConditions(conditions.filter(c => c.id !== id));

  const getUnique = (key: string) => {
    const col = columns.find(c => c.key === key);
    if (col?.options) return col.options;
    const s = new Set<string>();
    data.forEach(row => { const v = String(col?.getValue ? col.getValue(row) : (row as Record<string, unknown>)[key] ?? ''); if (v) s.add(v); });
    return Array.from(s).sort();
  };

  const sel = 'rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400';
  const inp = 'rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400';

  return (
    <div className="absolute left-0 top-full mt-2 z-50 rounded-2xl border bg-white shadow-2xl" style={{ minWidth: '580px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm text-slate-800">Advanced filters</span>
          {conditions.length > 0 && (
            <span className="text-xs text-slate-500">Showing <strong>{filtered.length}</strong> of <strong>{data.length}</strong> items</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClear} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 hover:bg-slate-100 rounded-lg">Clear all</button>
          <button className="text-xs border px-3 py-1.5 rounded-xl text-slate-600 hover:bg-slate-50">Save as new view</button>
        </div>
      </div>

      {/* Conditions */}
      <div className="px-5 py-4 space-y-2 max-h-72 overflow-y-auto">
        {conditions.length === 0 && (
          <div className="text-sm text-slate-400 text-center py-4">No filters. Click &quot;+ Add new filter&quot; to start.</div>
        )}
        {conditions.map((cond, idx) => {
          const col = columns.find(c => c.key === cond.colKey);
          const ops = getOps(col?.type);
          const needsValue = !NO_VALUE_OPS.has(cond.operator);
          const uniq = getUnique(cond.colKey);

          return (
            <div key={cond.id} className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-500 w-12 text-right shrink-0">
                {idx === 0 ? 'Where' : (
                  <select value={cond.logic} onChange={e => update(cond.id, { logic: e.target.value as 'AND' | 'OR' })}
                    className="text-xs font-semibold text-orange-600 bg-transparent border-none focus:outline-none cursor-pointer">
                    <option value="AND">And</option>
                    <option value="OR">Or</option>
                  </select>
                )}
              </span>

              <select value={cond.colKey}
                onChange={e => { const nc = columns.find(c => c.key === e.target.value); update(cond.id, { colKey: e.target.value, operator: defaultOp(nc?.type), value: '' }); }}
                className={sel}>
                {searchable.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>

              <select value={cond.operator} onChange={e => update(cond.id, { operator: e.target.value, value: '' })} className={sel}>
                {ops.map(op => <option key={op.v} value={op.v}>{op.l}</option>)}
              </select>

              {needsValue && (
                col?.type === 'select' || col?.options ? (
                  <div className="flex items-center gap-1 flex-wrap min-w-[160px] rounded-xl border px-2 py-1.5 bg-white">
                    {cond.value && cond.value.split(',').filter(Boolean).map(v => (
                      <span key={v} className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        {v}
                        <button onClick={() => update(cond.id, { value: cond.value.split(',').filter(x => x !== v).join(',') })} className="hover:text-rose-500">×</button>
                      </span>
                    ))}
                    <select value="" onChange={e => {
                      if (!e.target.value) return;
                      const existing = cond.value ? cond.value.split(',').filter(Boolean) : [];
                      if (!existing.includes(e.target.value)) update(cond.id, { value: [...existing, e.target.value].join(',') });
                    }} className="text-xs border-none bg-transparent focus:outline-none cursor-pointer min-w-[80px]">
                      <option value="">+ Add value</option>
                      {uniq.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                ) : col?.type === 'date' ? (
                  <input type="date" value={cond.value} onChange={e => update(cond.id, { value: e.target.value })} className={inp} />
                ) : col?.type === 'number' ? (
                  <input type="number" value={cond.value} onChange={e => update(cond.id, { value: e.target.value })} placeholder="Value" className={`${inp} w-24`} />
                ) : (
                  <input type="text" value={cond.value} onChange={e => update(cond.id, { value: e.target.value })} placeholder="Value…" className={`${inp} min-w-[140px]`} />
                )
              )}

              <button onClick={() => remove(cond.id)} className="text-slate-400 hover:text-rose-500 w-7 h-7 flex items-center justify-center rounded-full hover:bg-rose-50 ml-auto text-lg">×</button>
            </div>
          );
        })}
        <button onClick={addCond} className="text-sm text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1 mt-2">
          + Add new filter
        </button>
      </div>

      {/* Footer */}
      <div className="border-t px-5 py-3">
        <button onClick={onSwitchQuick} className="text-xs text-orange-600 hover:text-orange-700 font-semibold hover:underline">
          Switch to quick filters →
        </button>
      </div>
    </div>
  );
}

// ─── Sort Panel ───────────────────────────────────────────────────────────────

function SortPanel<T extends Record<string, unknown>>({
  columns, sorts, onChange, onClose,
}: { columns: ColDef<T>[]; sorts: SortCond[]; onChange: (s: SortCond[]) => void; onClose: () => void }) {
  const uid = () => Math.random().toString(36).slice(2, 8);
  const sortable = columns.filter(c => c.sortable !== false);
  return (
    <div className="absolute right-0 top-full mt-2 z-50 rounded-2xl border bg-white shadow-2xl p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">Sort</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
      </div>
      <div className="space-y-2">
        {sorts.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-12 text-right">{i === 0 ? 'By' : 'Then'}</span>
            <select value={s.key} onChange={e => onChange(sorts.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
              className="flex-1 rounded-lg border px-2 py-1.5 text-sm focus:outline-none">
              {sortable.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <select value={s.dir} onChange={e => onChange(sorts.map((x, j) => j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x))}
              className="rounded-lg border px-2 py-1.5 text-sm focus:outline-none">
              <option value="asc">A → Z ↑</option>
              <option value="desc">Z → A ↓</option>
            </select>
            <button onClick={() => onChange(sorts.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 shrink-0">×</button>
          </div>
        ))}
      </div>
      {sortable.length > sorts.length && (
        <button onClick={() => onChange([...sorts, { key: sortable[0].key, dir: 'asc' }])}
          className="mt-2 text-sm text-orange-600 hover:text-orange-700 font-semibold hover:underline">+ Add sort</button>
      )}
      {sorts.length > 0 && (
        <button onClick={() => onChange([])} className="mt-1 block text-xs text-slate-400 hover:text-rose-500">Clear all sorts</button>
      )}
    </div>
  );
}

// ─── Group By Panel ───────────────────────────────────────────────────────────

function GroupByPanel<T extends Record<string, unknown>>({
  columns, groupBy, onChange, onClose,
}: { columns: ColDef<T>[]; groupBy: string | null; onChange: (k: string | null) => void; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-full mt-2 z-50 rounded-2xl border bg-white shadow-2xl p-4 w-56">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">Group by</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
      </div>
      <select value={groupBy ?? ''} onChange={e => onChange(e.target.value || null)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400">
        <option value="">No grouping</option>
        {columns.filter(c => c.type === 'select' || c.options).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      {groupBy && <button onClick={() => onChange(null)} className="mt-2 text-xs text-slate-400 hover:text-rose-500">Clear grouping</button>}
    </div>
  );
}

// ─── Column Panel ─────────────────────────────────────────────────────────────

function ColPanel<T extends Record<string, unknown>>({
  columns, hidden, frozen, onToggleHide, onToggleFreeze, onClose,
}: {
  columns: ColDef<T>[];
  hidden: Set<string>;
  frozen: Set<string>;
  onToggleHide: (k: string) => void;
  onToggleFreeze: (k: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-2 z-50 rounded-2xl border bg-white shadow-2xl p-4 w-64">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">Columns</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
      </div>
      <div className="text-xs text-slate-400 mb-2 font-medium">Show / Freeze columns</div>
      {columns.filter(c => c.hideable !== false).map(col => (
        <div key={col.key} className="flex items-center justify-between py-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none flex-1">
            <input type="checkbox" checked={!hidden.has(col.key)} onChange={() => onToggleHide(col.key)} className="rounded accent-orange-600" />
            <span className={hidden.has(col.key) ? 'line-through text-slate-400' : ''}>{col.label}</span>
          </label>
          {col.freezable !== false && (
            <button onClick={() => onToggleFreeze(col.key)} title="Freeze"
              className={`text-xs px-2 py-0.5 rounded-lg border transition-colors ${frozen.has(col.key) ? 'bg-orange-100 text-orange-700 border-orange-200' : 'text-slate-400 border-transparent hover:border-slate-200 hover:text-orange-600'}`}>
              📌
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main DataTable ───────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown>>({
  id, columns: rawColumns, data, onAdd, addLabel = 'Add New',
  defaultSort, defaultSortDir = 'asc', auditEnabled = true,
  fitToContent = false,
}: DataTableProps<T>) {
  // Merge audit cols
  const columns = useMemo(() => {
    if (!auditEnabled) return rawColumns;
    const auditKeys = new Set(AUDIT_COLS.map(c => c.key));
    const userCols = rawColumns.filter(c => !auditKeys.has(c.key));
    return [...userCols, ...AUDIT_COLS] as ColDef<T>[];
  }, [rawColumns, auditEnabled]);

  // State
  const [globalQ, setGlobalQ] = useState('');
  const [filterMode, setFilterMode] = useState<'quick' | 'advanced'>('quick');
  const [showFilter, setShowFilter] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showGroupBy, setShowGroupBy] = useState(false);
  const [showColPanel, setShowColPanel] = useState(false);
  const [quickFilters, setQuickFilters] = useState<Record<string, string[]>>({});
  const [advancedConds, setAdvancedConds] = useState<FilterCond[]>([]);
  const [sorts, setSorts] = useState<SortCond[]>(defaultSort ? [{ key: defaultSort, dir: defaultSortDir }] : []);
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set([...AUDIT_COLS.map(c => c.key)]));
  const [frozenCols, setFrozenCols] = useState<Set<string>>(new Set());
  const [historyRow, setHistoryRow] = useState<{ label: string } | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);

  // Persist prefs
  useEffect(() => {
    try {
      const s = localStorage.getItem(`dt-${id}`);
      if (s) { const p = JSON.parse(s); if (p.hidden) setHiddenCols(new Set(p.hidden)); if (p.frozen) setFrozenCols(new Set(p.frozen)); if (p.ps) setPageSize(p.ps); }
    } catch {}
  }, [id]);
  useEffect(() => {
    try { localStorage.setItem(`dt-${id}`, JSON.stringify({ hidden: Array.from(hiddenCols), frozen: Array.from(frozenCols), ps: pageSize })); } catch {}
  }, [id, hiddenCols, frozenCols, pageSize]);

  // Close panels on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSort(false);
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) setShowGroupBy(false);
      if (colRef.current && !colRef.current.contains(e.target as Node)) setShowColPanel(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const getVal = (col: ColDef<T>, row: T) => String(col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key] ?? '');

  // Filtering
  const filtered = useMemo(() => {
    let rows = [...data];
    if (globalQ.trim()) {
      const q = globalQ.toLowerCase();
      rows = rows.filter(row => columns.some(col => getVal(col, row).toLowerCase().includes(q)));
    }
    Object.entries(quickFilters).forEach(([key, vals]) => {
      if (!vals.length) return;
      const col = columns.find(c => c.key === key);
      rows = rows.filter(row => vals.includes(getVal(col!, row)));
    });
    if (advancedConds.length > 0) {
      rows = rows.filter(row => {
        const results = advancedConds.map(c => matchCond(row, columns.find(x => x.key === c.colKey), c.operator, c.value));
        // split by AND/OR
        if (advancedConds.every(c => c.logic === 'AND' || c === advancedConds[0])) return results.every(Boolean);
        return results.some(Boolean);
      });
    }
    if (sorts.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const s of sorts) {
          const col = columns.find(c => c.key === s.key);
          const av = col ? getVal(col, a) : '';
          const bv = col ? getVal(col, b) : '';
          const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
          if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, globalQ, quickFilters, advancedConds, sorts]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const start = (curPage - 1) * pageSize;

  // Group by logic
  const groupedData = useMemo(() => {
    if (!groupBy) return null;
    const col = columns.find(c => c.key === groupBy);
    const groups: { key: string; rows: T[] }[] = [];
    const map = new Map<string, T[]>();
    filtered.forEach(row => {
      const k = getVal(col!, row) || '(empty)';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    });
    map.forEach((rows, key) => groups.push({ key, rows }));
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, groupBy, columns]);

  const pageRows = groupBy ? null : filtered.slice(start, start + pageSize);

  const visibleCols = columns.filter(c => !hiddenCols.has(c.key));
  const orderedCols = [...visibleCols.filter(c => frozenCols.has(c.key)), ...visibleCols.filter(c => !frozenCols.has(c.key))];

  // History col
  const allCols: ColDef<T>[] = [
    ...orderedCols,
    {
      key: '__history', label: '', sortable: false, searchable: false, hideable: false, freezable: false,
      width: '40px',
      render: (row) => (
        <button onClick={() => setHistoryRow({ label: String((row as Record<string, unknown>).name ?? (row as Record<string, unknown>).id ?? 'Record') })}
          title="View change history"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors text-base">
          🕓
        </button>
      ),
    },
  ];

  const frozenLeft = (key: string): number | undefined => {
    if (!frozenCols.has(key)) return undefined;
    let offset = 0;
    for (const col of orderedCols) {
      if (col.key === key) break;
      if (frozenCols.has(col.key)) offset += 160;
    }
    return offset;
  };

  const toggleQF = (colKey: string, val: string) => {
    setQuickFilters(prev => {
      const cur = prev[colKey] ?? [];
      return { ...prev, [colKey]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] };
    });
    setPage(1);
  };
  const clearFilters = () => { setQuickFilters({}); setAdvancedConds([]); setPage(1); };

  const filterCount = Object.values(quickFilters).flat().length + advancedConds.length;

  const renderRows = (rows: T[]) => rows.map((row, i) => (
    <tr key={i} className="border-t border-slate-100 hover:bg-orange-50/40 transition-colors group">
      {allCols.map(col => {
        const left = frozenLeft(col.key);
        const frozen = left !== undefined;
        return (
          <td key={col.key}
            className={`px-4 py-3 text-sm text-slate-700 ${frozen ? 'sticky z-10 bg-white group-hover:bg-orange-50/40 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]' : ''}`}
            style={{ left: frozen ? left : undefined }}>
            {col.render ? col.render(row, i) : String((row as Record<string, unknown>)[col.key] ?? '')}
          </td>
        );
      })}
    </tr>
  ));

  // Group accent stripes — kept brand-warm primary, then muted neutrals so
  // grouped tables still read as a single design system.
  const groupColors = ['border-l-orange-500', 'border-l-amber-500', 'border-l-emerald-500', 'border-l-sky-500', 'border-l-slate-400'];

  return (
    <>
      {historyRow && <HistoryDrawer rowLabel={historyRow.label} onClose={() => setHistoryRow(null)} />}

      <div className="space-y-2">
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 flex-wrap bg-white rounded-2xl border border-slate-200 px-4 py-2.5 shadow-soft">
          {onAdd && (
            <button onClick={onAdd}
              className="rounded-xl bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 px-4 py-2 text-sm font-semibold text-white transition-all shadow-brand active:translate-y-[1px] flex items-center gap-1.5">
              <span className="text-base leading-none">+</span> {addLabel}
            </button>
          )}

          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input type="text" placeholder="Search…" value={globalQ}
              onChange={e => { setGlobalQ(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-slate-200 pl-7 pr-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-shadow" />
          </div>

          <div className="h-5 w-px bg-slate-200 hidden md:block" />

          {/* Filter */}
          <div className="relative" ref={filterRef}>
            <button onClick={() => setShowFilter(s => !s)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium border transition-colors ${showFilter || filterCount > 0 ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-slate-200 hover:bg-orange-50/60 hover:border-orange-200 hover:text-orange-700 text-slate-600'}`}>
              <span>⊳</span> Filter
              {filterCount > 0 && <span className="min-w-[18px] h-[18px] rounded-full bg-orange-600 text-white text-[10px] font-bold flex items-center justify-center px-1">{filterCount}</span>}
              <span className="text-[10px] opacity-60">▾</span>
            </button>
            {showFilter && filterMode === 'quick' && (
              <QuickFilterPanel<T>
                columns={columns} data={data} activeFilters={quickFilters} filtered={filtered}
                onToggle={toggleQF} onClear={clearFilters}
                onSwitchAdvanced={() => setFilterMode('advanced')}
              />
            )}
            {showFilter && filterMode === 'advanced' && (
              <AdvancedFilterPanel<T>
                columns={columns} conditions={advancedConds} data={data} filtered={filtered}
                onChangeConditions={c => { setAdvancedConds(c); setPage(1); }}
                onClear={clearFilters}
                onSwitchQuick={() => setFilterMode('quick')}
              />
            )}
          </div>

          {/* Sort */}
          <div className="relative" ref={sortRef}>
            <button onClick={() => setShowSort(s => !s)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium border transition-colors ${sorts.length > 0 ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-slate-200 hover:bg-orange-50/60 hover:border-orange-200 hover:text-orange-700 text-slate-600'}`}>
              <span>↕</span> Sort {sorts.length > 0 && <span className="text-xs opacity-70">({sorts.length})</span>}
            </button>
            {showSort && <SortPanel<T> columns={columns} sorts={sorts} onChange={setSorts} onClose={() => setShowSort(false)} />}
          </div>

          {/* Group by */}
          <div className="relative" ref={groupRef}>
            <button onClick={() => setShowGroupBy(s => !s)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium border transition-colors ${groupBy ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-slate-200 hover:bg-orange-50/60 hover:border-orange-200 hover:text-orange-700 text-slate-600'}`}>
              <span>⊞</span> Group by {groupBy && <span className="text-xs opacity-70">({columns.find(c => c.key === groupBy)?.label})</span>}
            </button>
            {showGroupBy && <GroupByPanel<T> columns={columns} groupBy={groupBy} onChange={k => { setGroupBy(k); setShowGroupBy(false); }} onClose={() => setShowGroupBy(false)} />}
          </div>

          {/* Columns */}
          <div className="relative" ref={colRef}>
            <button onClick={() => setShowColPanel(s => !s)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium border transition-colors ${showColPanel ? 'bg-slate-100 border-slate-400 text-slate-800' : 'border-slate-200 hover:bg-orange-50/60 hover:border-orange-200 hover:text-orange-700 text-slate-600'}`}>
              <span>☰</span> <span className="hidden sm:inline">Columns</span>
            </button>
            {showColPanel && <ColPanel<T> columns={columns} hidden={hiddenCols} frozen={frozenCols} onToggleHide={k => setHiddenCols(p => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s; })} onToggleFreeze={k => setFrozenCols(p => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s; })} onClose={() => setShowColPanel(false)} />}
          </div>

          {/* Record count */}
          <div className="ml-auto text-xs text-slate-500 font-medium whitespace-nowrap">
            {filtered.length === 0 ? '0 records' : groupBy ? `${filtered.length} record${filtered.length !== 1 ? 's' : ''}` : `${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length}`}
          </div>
        </div>

        {/* ── Active filter pills ── */}
        {(filterCount > 0) && (
          <div className="flex items-center gap-1.5 flex-wrap px-1">
            {Object.entries(quickFilters).flatMap(([k, vals]) => {
              const col = columns.find(c => c.key === k);
              return vals.map(v => (
                <span key={`${k}-${v}`} className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-xs text-orange-700">
                  <strong>{col?.label}</strong> is <span className="font-medium">{v}</span>
                  <button onClick={() => toggleQF(k, v)} className="hover:text-rose-500 font-bold ml-0.5">×</button>
                </span>
              ));
            })}
            {advancedConds.map(c => {
              const col = columns.find(x => x.key === c.colKey);
              return (
                <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs text-amber-700">
                  <strong>{col?.label}</strong> {c.operator.replace(/_/g, ' ')} {c.value && <span className="font-medium">{c.value}</span>}
                  <button onClick={() => { setAdvancedConds(advancedConds.filter(x => x.id !== c.id)); setPage(1); }} className="hover:text-rose-500 font-bold ml-0.5">×</button>
                </span>
              );
            })}
            <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-rose-500 ml-1 font-medium">Clear all</button>
          </div>
        )}

        {/* ── Table ── */}
        <div
          className={`rounded-2xl border border-slate-200 bg-white shadow-soft ${fitToContent ? 'overflow-x-auto' : 'overflow-auto'}`}
          style={fitToContent ? undefined : { maxHeight: '65vh' }}
        >
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-b from-slate-50 to-slate-100/70 text-left sticky top-0 z-20 border-b border-slate-200">
              <tr>
                {allCols.map(col => {
                  if (col.key === '__history') return <th key="__history" className="px-2 py-3 w-10 bg-slate-50" />;
                  const left = frozenLeft(col.key);
                  const frozen = left !== undefined;
                  const isSorted = sorts.find(s => s.key === col.key);
                  return (
                    <th key={col.key}
                      className={`px-4 py-3 whitespace-nowrap select-none text-[11px] font-bold uppercase tracking-wider text-slate-600 ${frozen ? 'sticky z-30 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}`}
                      style={{ left: frozen ? left : undefined, width: col.width }}>
                      {col.sortable !== false ? (
                        <button onClick={() => {
                          const existing = sorts.find(s => s.key === col.key);
                          if (existing) setSorts(sorts.map(s => s.key === col.key ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s));
                          else setSorts([{ key: col.key, dir: 'asc' }, ...sorts.slice(0, 2)]);
                        }} className="flex items-center gap-1.5 hover:text-orange-700 transition-colors group">
                          {col.label}
                          <span className={`text-[10px] transition-opacity ${isSorted ? 'opacity-100 text-orange-600' : 'opacity-30 group-hover:opacity-70'}`}>
                            {isSorted ? (isSorted.dir === 'asc' ? '▲' : '▼') : '⇅'}
                          </span>
                        </button>
                      ) : col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groupedData ? (
                groupedData.map((group, gi) => (
                  <>
                    <tr key={`grp-${group.key}`} className={`border-t border-l-4 ${groupColors[gi % groupColors.length]} bg-slate-50`}>
                      <td colSpan={allCols.length} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-700">{group.key}</span>
                          <span className="text-xs text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5 font-semibold">{group.rows.length}</span>
                        </div>
                      </td>
                    </tr>
                    {renderRows(group.rows)}
                  </>
                ))
              ) : pageRows?.length ? renderRows(pageRows) : (
                <tr>
                  <td colSpan={allCols.length} className="px-4 py-14 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-50 text-orange-500 mb-3 ring-4 ring-orange-50/60 text-2xl">🔍</div>
                    <div className="font-semibold text-slate-700">No records found</div>
                    <div className="text-xs text-slate-500 mt-0.5">Try adjusting your filters or search query.</div>
                    {filterCount > 0 && <button onClick={clearFilters} className="mt-3 text-orange-600 hover:text-orange-700 hover:underline text-xs font-semibold">Clear all filters</button>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination (not shown when grouped) ── */}
        {!groupBy && (
          <div className="flex items-center justify-between gap-3 flex-wrap text-sm px-1">
            <div className="flex items-center gap-2 text-slate-500 text-xs">
              Rows per page:
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400">
                {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              {([['«', () => setPage(1)], ['‹', () => setPage(p => Math.max(1, p - 1))]] as const).map(([l, a]) => (
                <button key={l} onClick={a} disabled={curPage === 1} className="rounded-lg border border-slate-200 bg-white w-7 h-7 text-xs text-slate-600 disabled:opacity-40 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 transition-colors">{l}</button>
              ))}
              <span className="px-3 py-1 text-slate-700 text-xs font-semibold">{curPage} <span className="text-slate-400">/</span> {totalPages}</span>
              {([['›', () => setPage(p => Math.min(totalPages, p + 1))], ['»', () => setPage(totalPages)]] as const).map(([l, a]) => (
                <button key={l} onClick={a} disabled={curPage === totalPages} className="rounded-lg border border-slate-200 bg-white w-7 h-7 text-xs text-slate-600 disabled:opacity-40 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 transition-colors">{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
