'use client';

import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, X as XIcon, RotateCcw, Undo2, Clock, History, FilePlus, FileEdit,
  Send, AlertCircle, Hourglass, MoreHorizontal, Search, Filter,
  LayoutGrid, Columns, ChevronDown, ChevronUp, ChevronsUpDown,
} from 'lucide-react';
import { formatDate } from '@/lib/format/datetime';

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
  /** Header text alignment. Defaults to left. Use "right" for
   *  right-aligned action columns so the header sits above its icons. */
  align?: 'left' | 'center' | 'right';
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
  /**
   * Entity type to fetch real change-history for via /api/history. When
   * set, clicking the per-row history icon opens a drawer populated with
   * merged audit log + approval history events instead of the local
   * mock. Used on pages that have audit/approval coverage (PO, RFQ,
   * Indent, GRN, Issue, Transfer, etc.).
   */
  historyEntityType?: string;
  /**
   * Resolver from row → entity id used by the history fetch. Defaults
   * to `row.id` cast to string — override only when the table's primary
   * key lives under a different field.
   */
  getHistoryEntityId?: (row: T) => string;
  /**
   * Per-page subtitle override for the Approval Timeline drawer header.
   * Default resolution walks a document-number priority list before
   * falling back to row name / code. Override when the page needs a
   * different label (e.g. Stock Reconciliation prefers `reconNo`).
   */
  getHistoryRowLabel?: (row: T) => string;
  /** Headline shown when the table has no data at all (no filters applied). */
  emptyTitle?: string;
  /** Sub-line under {@link emptyTitle}. */
  emptyHint?: string;
  /** When true, show a centered loading spinner instead of rows / empty state. */
  loading?: boolean;
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

// Priority list for resolving a row → drawer subtitle. Document numbers
// win over names/codes; raw `id` is the last-resort fallback so the
// drawer never silently shows a CUID when a friendly identifier exists.
// `grnNumber` is placed before `poNumber` because GRN rows carry both
// and the local doc number should take precedence over the source PO.
const HISTORY_LABEL_FIELDS = [
  'prNumber', 'mrNumber',
  'indentNumber', 'rfqNumber',
  'grnNumber', 'poNumber',
  'reconciliationNumber', 'reconNumber', 'reconNo',
  'issueNumber', 'transferNumber', 'returnNumber', 'gatePassNumber',
  'woNumber', 'estimationNumber', 'dprNumber',
  'invoiceNumber', 'billNumber', 'paymentNumber', 'receiptNumber',
  'name', 'fullName', 'displayName',
  'code', 'projectCode',
];

function historyRowLabel(row: unknown): string {
  const r = row as Record<string, unknown>;
  for (const key of HISTORY_LABEL_FIELDS) {
    const v = r[key];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return String(r.id ?? 'Record');
}

interface HistoryChange { field: string; from?: string | null; to?: string | null }
interface HistoryEvent {
  id: string;
  at: string;
  byId: string;
  byName: string;
  kind: 'create' | 'update' | 'delete' | 'submit' | 'approve' | 'reject' | 'return' | 'reverse' | 'status_change' | 'pending' | 'other';
  label: string;
  stepOrder?: number;
  changes?: HistoryChange[];
  comments?: string | null;
}

interface KindTheme {
  dot: string;        // bg colour of the dot
  ring: string;       // ring colour around the dot (the outer halo)
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;  // text colour inside the dot
}

const KIND_THEME: Record<HistoryEvent['kind'], KindTheme> = {
  create:        { dot: 'bg-emerald-500', ring: 'ring-emerald-100', icon: FilePlus,    iconColor: 'text-white' },
  update:        { dot: 'bg-orange-500',  ring: 'ring-orange-100',  icon: FileEdit,    iconColor: 'text-white' },
  delete:        { dot: 'bg-rose-500',    ring: 'ring-rose-100',    icon: XIcon,       iconColor: 'text-white' },
  submit:        { dot: 'bg-sky-500',     ring: 'ring-sky-100',     icon: Send,        iconColor: 'text-white' },
  approve:       { dot: 'bg-emerald-500', ring: 'ring-emerald-100', icon: Check,       iconColor: 'text-white' },
  reject:        { dot: 'bg-rose-500',    ring: 'ring-rose-100',    icon: XIcon,       iconColor: 'text-white' },
  return:        { dot: 'bg-amber-500',   ring: 'ring-amber-100',   icon: Undo2,       iconColor: 'text-white' },
  reverse:       { dot: 'bg-orange-400',  ring: 'ring-orange-100',  icon: RotateCcw,   iconColor: 'text-white' },
  status_change: { dot: 'bg-orange-500',  ring: 'ring-orange-100',  icon: AlertCircle, iconColor: 'text-white' },
  pending:       { dot: 'bg-white',       ring: 'ring-slate-200',   icon: Hourglass,   iconColor: 'text-slate-400' },
  other:         { dot: 'bg-slate-400',   ring: 'ring-slate-100',   icon: MoreHorizontal, iconColor: 'text-white' },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const diffSec = Math.round((Date.now() - d) / 1000);
  if (diffSec < 0) return formatDateTime(iso);
  if (diffSec < 45) return 'just now';
  if (diffSec < 90) return '1 min ago';
  const min = Math.round(diffSec / 60);
  if (min < 45) return `${min} min ago`;
  if (min < 90) return '1 hr ago';
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 14) return `${day} d ago`;
  return formatDateTime(iso);
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_PALETTE = ['bg-orange-100 text-orange-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];

function avatarClass(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function HistoryDrawer({
  rowLabel, onClose, entityType, entityId,
}: {
  rowLabel: string;
  onClose: () => void;
  entityType?: string;
  entityId?: string;
}) {
  const skipFetch = !entityType || !entityId;
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(!skipFetch);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (skipFetch) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ entityType: entityType!, entityId: entityId! }).toString();
    fetch(`/api/history?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json())?.error ?? `HTTP ${r.status}`);
        return r.json() as Promise<{ data: HistoryEvent[] }>;
      })
      .then((res) => {
        if (cancelled) return;
        // Chronological order — oldest at top, pending steps at the
        // bottom. Matches the detail-page Approval Timeline style.
        setEvents(res.data ?? []);
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Failed to load history'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [skipFetch, entityType, entityId]);

  // Derived summary used by the header banner.
  // status: latest approval-flow state we can infer from the events.
  // doneSteps / totalSteps: how many approval steps have been acted on
  // vs the full workflow length, when the timeline has a pending tail.
  const summary = useMemo(() => {
    const totalSteps = events.filter((e) => e.kind === 'pending' || ['approve', 'reject', 'return'].includes(e.kind)).length;
    const doneSteps = events.filter((e) => e.kind === 'approve').length;
    const hasWorkflowEvent = events.some((e) =>
      ['submit', 'approve', 'reject', 'return', 'reverse', 'pending'].includes(e.kind),
    );
    let status: 'approved' | 'rejected' | 'returned' | 'in_progress' | 'draft' | 'created' = 'draft';
    let latest: HistoryEvent | undefined;
    for (const e of events) {
      if (e.kind === 'pending') continue;
      latest = e;
    }
    if (events.some((e) => e.kind === 'pending')) status = 'in_progress';
    else if (latest?.kind === 'reject') status = 'rejected';
    else if (latest?.kind === 'return') status = 'returned';
    else if (latest?.kind === 'approve') status = 'approved';
    else if (latest?.kind === 'submit') status = 'in_progress';
    else if (!hasWorkflowEvent && events.length > 0) status = 'created';
    return { status, totalSteps, doneSteps };
  }, [events]);

  const STATUS_BADGE: Record<typeof summary.status, { label: string; cls: string }> = {
    approved:    { label: 'Approved',          cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    rejected:    { label: 'Rejected',          cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
    returned:    { label: 'Returned',          cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
    in_progress: { label: 'Pending approval',  cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
    created:     { label: 'Draft',             cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
    draft:       { label: 'No activity yet',   cls: 'bg-slate-50 text-slate-600 ring-slate-200' },
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end p-4 sm:p-5 md:p-6">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex min-h-0 w-full max-w-[440px] flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-[0_25px_50px_-12px_rgba(15,23,42,0.22)]">
        {/* Header */}
        <div className="shrink-0 border-b border-slate-200 bg-white px-6 pb-4 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm ring-2 ring-orange-100">
                <History className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold leading-tight tracking-tight text-slate-900">Approval Timeline</div>
                <div className="mt-1 max-w-[300px] truncate text-sm text-slate-500">{rowLabel}</div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" aria-label="Close">×</button>
          </div>

          {!loading && !error && events.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_BADGE[summary.status].cls}`}>
                {STATUS_BADGE[summary.status].label}
              </span>
              {summary.totalSteps > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  {summary.doneSteps} of {summary.totalSteps} step{summary.totalSteps === 1 ? '' : 's'} done
                </span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5">
          {loading && (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-slate-100" />
                  <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                    <div className="h-3.5 w-28 rounded-md bg-slate-100" />
                    <div className="h-3 w-44 rounded-md bg-slate-50" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && !loading && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>
          )}
          {!loading && !error && events.length === 0 && (
            <div className="flex flex-col items-center justify-center px-2 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
                <Clock className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-slate-600">No activity yet</p>
              <p className="mt-1 text-xs text-slate-400">Changes will appear here once recorded.</p>
            </div>
          )}
          {!loading && !error && events.length > 0 && (
            <ol className="relative">
              {events.map((h, i) => {
                const theme = KIND_THEME[h.kind] ?? KIND_THEME.other;
                const Icon = theme.icon;
                const isPending = h.kind === 'pending';
                const isLast = i === events.length - 1;
                return (
                  <li key={h.id} className="group flex gap-4">
                    {/* Rail + dot */}
                    <div className="flex shrink-0 flex-col items-center self-stretch">
                      <span
                        className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-sm ring-4 ${theme.dot} ${theme.ring} ${isPending ? 'border border-dashed border-slate-300' : ''}`}
                        title={h.label}
                      >
                        <Icon className={`h-3.5 w-3.5 ${theme.iconColor}`} />
                      </span>
                      {!isLast && (
                        <span className="w-px flex-1 min-h-[1rem] bg-gradient-to-b from-slate-200 to-slate-100" />
                      )}
                    </div>

                    {/* Card */}
                    <div className={`min-w-0 flex-1 pb-6 ${isLast ? 'pb-2' : ''} ${isPending ? 'opacity-90' : ''}`}>
                      <div className={`rounded-2xl border p-4 transition-colors ${
                        isPending
                          ? 'border-dashed border-slate-200 bg-slate-50/50'
                          : 'border-slate-200/90 bg-slate-50 group-hover:border-slate-300 group-hover:bg-slate-100/60'
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-semibold tracking-tight leading-snug ${isPending ? 'text-slate-600' : 'text-slate-900'}`}>
                            {h.label}
                          </p>
                          {isPending ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 shrink-0 mt-0.5">
                              Awaiting
                            </span>
                          ) : (
                            <span
                              className="text-[10px] font-medium text-slate-400 shrink-0 mt-0.5 cursor-default"
                              title={formatDateTime(h.at)}
                            >
                              {formatRelative(h.at)}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex items-center gap-2 min-w-0">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${avatarClass(h.byName || h.byId || '?')}`}>
                            {initials(h.byName || h.byId || '?')}
                          </span>
                          <span className={`text-[11px] truncate ${isPending ? 'italic text-slate-500' : 'font-medium text-slate-600'}`}>
                            {h.byName || 'Unknown'}
                          </span>
                          {!isPending && (
                            <span className="text-[10px] text-slate-300 truncate">
                              · {formatDateTime(h.at)}
                            </span>
                          )}
                        </div>

                        {h.changes && h.changes.length > 0 && (
                          <div className="mt-3 space-y-1 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-[11px]">
                            {h.changes.map((c, j) => (
                              <div key={j}>
                                <span className="font-medium text-slate-700">{c.field}</span>
                                {c.from != null || c.to != null ? (
                                  <>
                                    <span className="text-slate-400"> · </span>
                                    {c.from != null && (
                                      <span className="line-through text-rose-400">{c.from || '—'}</span>
                                    )}
                                    <span className="text-slate-400"> → </span>
                                    <span className="text-emerald-600 font-medium">{c.to ?? '—'}</span>
                                  </>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}

                        {h.comments && (
                          <div className="mt-2 flex gap-1.5">
                            <span className="w-0.5 rounded-full bg-slate-200 shrink-0" />
                            <p className="text-[11px] text-slate-600 leading-relaxed">
                              {h.comments}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar dropdown portal (escapes overflow-hidden ancestors) ─────────────

function ToolbarDropdownPortal({
  open,
  anchorRef,
  panelRef,
  width,
  align = 'right',
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  panelRef: React.Ref<HTMLDivElement>;
  width: number;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const compute = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 8;
      const vw = window.innerWidth;
      const panelWidth = Math.min(width, vw - margin * 2);
      let left = align === 'right' ? rect.right - panelWidth : rect.left;
      left = Math.max(margin, Math.min(left, vw - margin - panelWidth));
      setStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        left,
        width: panelWidth,
        maxWidth: vw - margin * 2,
        zIndex: 1000,
      });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open, anchorRef, width, align]);

  if (!open || !mounted || !style) return null;
  return createPortal(
    <div ref={panelRef} style={style}>
      {children}
    </div>,
    document.body,
  );
}

// ─── Quick Filter Panel ───────────────────────────────────────────────────────

function QuickFilterPanel<T extends Record<string, unknown>>({
  columns, data, activeFilters, onToggle, onClear, filtered, onSwitchAdvanced, sorts, onChangeSorts,
}: {
  columns: ColDef<T>[];
  data: T[];
  activeFilters: Record<string, string[]>;
  onToggle: (colKey: string, val: string) => void;
  onClear: () => void;
  filtered: T[];
  onSwitchAdvanced: () => void;
  sorts: SortCond[];
  onChangeSorts: (s: SortCond[]) => void;
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
    <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-sm text-slate-800">Quick filters</span>
          <span className="text-xs text-slate-500">Showing <strong>{filtered.length}</strong> of <strong>{data.length}</strong> items</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={onClear} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 hover:bg-slate-100 rounded-lg">Clear all</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex gap-0 overflow-x-auto max-h-72">
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

      {/* Sort */}
      <div className="border-t px-5 py-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Sort</div>
        <SortControls<T> columns={columns} sorts={sorts} onChange={onChangeSorts} />
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
  columns, conditions, data, filtered, onChangeConditions, onClear, onSwitchQuick, sorts, onChangeSorts,
}: {
  columns: ColDef<T>[];
  conditions: FilterCond[];
  data: T[];
  filtered: T[];
  onChangeConditions: (c: FilterCond[]) => void;
  onClear: () => void;
  onSwitchQuick: () => void;
  sorts: SortCond[];
  onChangeSorts: (s: SortCond[]) => void;
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
    <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-sm text-slate-800">Advanced filters</span>
          {conditions.length > 0 && (
            <span className="text-xs text-slate-500">Showing <strong>{filtered.length}</strong> of <strong>{data.length}</strong> items</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={onClear} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 hover:bg-slate-100 rounded-lg">Clear all</button>
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

      {/* Sort */}
      <div className="border-t px-5 py-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Sort</div>
        <SortControls<T> columns={columns} sorts={sorts} onChange={onChangeSorts} />
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

// ─── Sort Controls ────────────────────────────────────────────────────────────
// Wrapper-less sort UI. Embedded inside the Filter dropdown (the standalone
// toolbar Sort button was retired in favour of a single Filter popover).

function SortControls<T extends Record<string, unknown>>({
  columns, sorts, onChange,
}: { columns: ColDef<T>[]; sorts: SortCond[]; onChange: (s: SortCond[]) => void }) {
  const sortable = columns.filter(c => c.sortable !== false);
  return (
    <div>
      <div className="space-y-2">
        {sorts.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-12 text-right">{i === 0 ? 'By' : 'Then'}</span>
            <select value={s.key} onChange={e => onChange(sorts.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
              className="flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-sm focus:outline-none">
              {sortable.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <select value={s.dir} onChange={e => onChange(sorts.map((x, j) => j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x))}
              className="shrink-0 rounded-lg border px-2 py-1.5 text-sm focus:outline-none">
              <option value="asc">A → Z ↑</option>
              <option value="desc">Z → A ↓</option>
            </select>
            <button onClick={() => onChange(sorts.filter((_, j) => j !== i))} aria-label="Remove sort"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-500">
              <XIcon className="h-4 w-4" />
            </button>
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
    <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-2xl p-4">
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
    <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-2xl p-4">
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
  historyEntityType, getHistoryEntityId, getHistoryRowLabel,
  emptyTitle, emptyHint, loading = false,
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
  const [historyRow, setHistoryRow] = useState<{ label: string; entityId?: string } | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const groupPanelRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const colPanelRef = useRef<HTMLDivElement>(null);

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

  // Close panels on outside click (portal panels live outside anchor refs)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (filterRef.current && !filterRef.current.contains(target) && !filterPanelRef.current?.contains(target)) setShowFilter(false);
      if (groupRef.current && !groupRef.current.contains(target) && !groupPanelRef.current?.contains(target)) setShowGroupBy(false);
      if (colRef.current && !colRef.current.contains(target) && !colPanelRef.current?.contains(target)) setShowColPanel(false);
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

  // History column is only appended when the page wires up an entity
  // type — otherwise the drawer would fetch nothing and show an empty
  // "No activity yet" panel, which reads as a broken button.
  const historyCol: ColDef<T> = {
    key: '__history', label: '', sortable: false, searchable: false, hideable: false, freezable: false,
    width: '48px',
    render: (row) => {
      const r = row as Record<string, unknown>;
      const entityId = getHistoryEntityId ? getHistoryEntityId(row) : String(r.id ?? '');
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setHistoryRow({
              label: getHistoryRowLabel
                ? getHistoryRowLabel(row)
                : historyRowLabel(row),
              entityId: entityId || undefined,
            });
          }}
          title="View change history"
          className="group/btn relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 ring-1 ring-inset ring-orange-200/50 transition-all duration-200 hover:from-orange-100 hover:to-orange-200 hover:text-orange-700 hover:ring-orange-300 hover:shadow-[0_0_0_3px_rgba(251,146,60,0.15)] active:scale-95"
        >
          <span className="absolute inset-0 rounded-lg bg-white/30 opacity-0 transition-opacity group-hover/btn:opacity-100" />
          <History className="relative z-10 h-3.5 w-3.5 transition-transform duration-300 group-hover/btn:-rotate-12" />
        </button>
      );
    },
  };
  const allCols: ColDef<T>[] = historyEntityType
    ? [...orderedCols, historyCol]
    : orderedCols;

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
    <tr
      key={i}
      className="relative border-t border-slate-100 even:bg-slate-50/40 hover:bg-orange-50/60 hover:shadow-[inset_3px_0_0_0_rgb(249,115,22)] transition-all duration-150 group"
    >
      {allCols.map(col => {
        const left = frozenLeft(col.key);
        const frozen = left !== undefined;
        return (
          <td key={col.key}
            className={
              col.key === '__history'
                ? 'w-12 min-w-[48px] max-w-[48px] bg-inherit px-1.5 py-3 align-middle text-center text-sm text-slate-700 group-hover:bg-orange-50/60'
                : `px-4 py-3 text-sm text-slate-700 ${frozen ? 'sticky z-10 bg-white group-hover:bg-orange-50/60 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]' : ''}`
            }
            style={col.key === '__history' ? undefined : { left: frozen ? left : undefined }}>
            {col.render
              ? col.render(row, i)
              : col.type === 'date'
                ? formatDate((row as Record<string, unknown>)[col.key] as string | null | undefined)
                : String((row as Record<string, unknown>)[col.key] ?? '')}
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
      {historyRow && (
        <HistoryDrawer
          rowLabel={historyRow.label}
          entityType={historyEntityType}
          entityId={historyRow.entityId}
          onClose={() => setHistoryRow(null)}
        />
      )}

      <div className="space-y-4">
        {/* ── Toolbar ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="text"
              placeholder="Search…"
              value={globalQ}
              onChange={(e) => {
                setGlobalQ(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 transition-shadow focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
            <div className="relative" ref={filterRef}>
              <button
                type="button"
                onClick={() => setShowFilter((s) => !s)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  showFilter || filterCount > 0
                    ? "border-orange-300 bg-orange-50 text-orange-700"
                    : "border-slate-200 text-slate-600 hover:border-orange-200 hover:bg-orange-50/60 hover:text-orange-700"
                }`}
              >
                <Filter className="h-4 w-4 shrink-0" />
                Filter
                {filterCount > 0 && (
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
                    {filterCount}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </button>
            <ToolbarDropdownPortal open={showFilter && filterMode === 'quick'} anchorRef={filterRef} panelRef={filterPanelRef} width={640} align="right">
              <QuickFilterPanel<T>
                columns={columns} data={data} activeFilters={quickFilters} filtered={filtered}
                onToggle={toggleQF} onClear={clearFilters}
                onSwitchAdvanced={() => setFilterMode('advanced')}
                sorts={sorts} onChangeSorts={setSorts}
              />
            </ToolbarDropdownPortal>
            <ToolbarDropdownPortal open={showFilter && filterMode === 'advanced'} anchorRef={filterRef} panelRef={filterPanelRef} width={580} align="right">
              <AdvancedFilterPanel<T>
                columns={columns} conditions={advancedConds} data={data} filtered={filtered}
                onChangeConditions={c => { setAdvancedConds(c); setPage(1); }}
                onClear={clearFilters}
                onSwitchQuick={() => setFilterMode('quick')}
                sorts={sorts} onChangeSorts={setSorts}
              />
            </ToolbarDropdownPortal>
          </div>

          {/* Group by — temporarily hidden (logic retained below)
          <div className="relative" ref={groupRef}>
            <button
              type="button"
              onClick={() => setShowGroupBy((s) => !s)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                groupBy
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-slate-200 text-slate-600 hover:border-orange-200 hover:bg-orange-50/60 hover:text-orange-700"
              }`}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              Group by{" "}
              {groupBy && (
                <span className="text-xs opacity-70">({columns.find((c) => c.key === groupBy)?.label})</span>
              )}
            </button>
            <ToolbarDropdownPortal open={showGroupBy} anchorRef={groupRef} panelRef={groupPanelRef} width={224} align="right">
              <GroupByPanel<T> columns={columns} groupBy={groupBy} onChange={k => { setGroupBy(k); setShowGroupBy(false); }} onClose={() => setShowGroupBy(false)} />
            </ToolbarDropdownPortal>
          </div>
          */}

          <div className="relative" ref={colRef}>
            <button
              type="button"
              onClick={() => setShowColPanel((s) => !s)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                showColPanel
                  ? "border-slate-400 bg-slate-100 text-slate-800"
                  : "border-slate-200 text-slate-600 hover:border-orange-200 hover:bg-orange-50/60 hover:text-orange-700"
              }`}
            >
              <Columns className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Columns</span>
            </button>
            <ToolbarDropdownPortal open={showColPanel} anchorRef={colRef} panelRef={colPanelRef} width={256} align="right">
              <ColPanel<T> columns={columns} hidden={hiddenCols} frozen={frozenCols} onToggleHide={k => setHiddenCols(p => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s; })} onToggleFreeze={k => setFrozenCols(p => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s; })} onClose={() => setShowColPanel(false)} />
            </ToolbarDropdownPortal>
          </div>

            {onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#FFAF55] to-[#ea580c] px-4 py-2 text-sm font-semibold text-white shadow-brand transition-all hover:from-[#f5a245] hover:to-[#c2410c] active:translate-y-[1px]"
              >
                <span className="text-base leading-none">+</span> {addLabel}
              </button>
            )}
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
          className={`min-h-[200px] rounded-2xl ring-1 ring-slate-200 bg-white shadow-[0_4px_24px_-12px_rgba(15,23,42,0.12)] ${fitToContent ? 'overflow-x-auto' : 'overflow-auto'}`}
          style={fitToContent ? undefined : { maxHeight: '65vh' }}
        >
          <table className="min-w-full text-sm border-separate border-spacing-0">
            <thead className="text-left sticky top-0 z-20">
              <tr>
                {allCols.map(col => {
                  if (col.key === '__history') return <th key="__history" className="w-12 min-w-[48px] max-w-[48px] border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 px-1.5 py-3.5 text-center" />;
                  const left = frozenLeft(col.key);
                  const frozen = left !== undefined;
                  const isSorted = sorts.find(s => s.key === col.key);
                  const alignCls = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '';
                  const btnAlignCls = col.align === 'right' ? 'ml-auto' : col.align === 'center' ? 'mx-auto' : '';
                  return (
                    <th key={col.key}
                      className={`px-4 py-3 whitespace-nowrap select-none text-xs font-semibold text-slate-700 bg-gradient-to-b from-slate-50 to-slate-100 border-b border-slate-200 shadow-[inset_0_-1px_0_rgba(15,23,42,0.04)] ${alignCls} ${isSorted ? 'shadow-[inset_0_-2px_0_0_rgb(249,115,22)]' : ''} ${frozen ? 'sticky z-30 bg-gradient-to-b from-slate-50 to-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}`}
                      style={{ left: frozen ? left : undefined, width: col.width }}>
                      {col.sortable !== false ? (
                        <button onClick={() => {
                          const existing = sorts.find(s => s.key === col.key);
                          if (existing) setSorts(sorts.map(s => s.key === col.key ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s));
                          else setSorts([{ key: col.key, dir: 'asc' }, ...sorts.slice(0, 2)]);
                        }} className={`flex items-center gap-1.5 transition-colors group ${btnAlignCls} ${isSorted ? 'text-orange-700' : 'hover:text-orange-700'}`}>
                          {col.label}
                          <span className={`inline-flex items-center justify-center w-4 h-4 rounded transition-all ${isSorted ? 'opacity-100 text-orange-600 bg-orange-100' : 'opacity-30 group-hover:opacity-70 text-slate-400'}`}>
                            {isSorted
                              ? (isSorted.dir === 'asc' ? <ChevronUp className="h-3 w-3" strokeWidth={2.5} /> : <ChevronDown className="h-3 w-3" strokeWidth={2.5} />)
                              : <ChevronsUpDown className="h-3 w-3" strokeWidth={2} />}
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
              ) : loading ? (
                <tr>
                  <td colSpan={allCols.length} className="px-4 py-24 text-center bg-gradient-to-b from-white to-slate-50/40">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-8 h-8 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin mb-3" />
                      <div className="text-sm font-medium text-slate-500">Loading…</div>
                    </div>
                  </td>
                </tr>
              ) : pageRows?.length ? renderRows(pageRows) : (
                <tr>
                  <td colSpan={allCols.length} className="px-4 py-20 text-center bg-gradient-to-b from-white to-slate-50/40">
                    {data.length === 0 && filterCount === 0 && !globalQ ? (
                      <div className="flex flex-col items-center">
                        <div className="relative inline-flex items-center justify-center w-10 h-10 mb-4">
                          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-100 via-amber-100 to-orange-50 blur-xl opacity-70" />
                          <div className="relative inline-flex items-center justify-center w-10 h-10 rounded-3xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200/60 ring-[6px] ring-orange-50">
                            <FilePlus className="w-3 h-3" strokeWidth={1.8} />
                          </div>
                        </div>
                        <div className="text-base font-bold text-slate-800 tracking-tight">
                          {emptyTitle ?? `Nothing here yet`}
                        </div>
                        <div className="text-xs text-slate-500 mt-1.5 max-w-sm leading-relaxed">
                          {emptyHint ??
                            (onAdd
                              ? `You haven't added any records yet. Click below to get started.`
                              : `Records will appear here once they're created.`)}
                        </div>
                        {onAdd && (
                          <button
                            onClick={onAdd}
                            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 px-4 py-2 text-sm font-semibold text-white shadow-brand active:translate-y-[1px] transition-all"
                          >
                            <span className="text-base leading-none">+</span> {addLabel}
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 text-orange-600 mb-3 ring-8 ring-orange-50/40 text-2xl shadow-sm">🔍</div>
                        <div className="font-semibold text-slate-800">No matching records</div>
                        <div className="text-xs text-slate-500 mt-1">Try adjusting your filters or search query.</div>
                        {(filterCount > 0 || globalQ) && (
                          <button
                            onClick={() => {
                              if (filterCount > 0) clearFilters();
                              if (globalQ) setGlobalQ('');
                            }}
                            className="mt-3 inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          >
                            Clear {filterCount > 0 && globalQ ? 'filters & search' : filterCount > 0 ? 'all filters' : 'search'}
                          </button>
                        )}
                      </>
                    )}
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
              <span className="font-medium">Rows per page:</span>
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 hover:border-slate-300 transition-colors">
                {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">
                Showing <strong className="text-slate-700">{filtered.length === 0 ? 0 : start + 1}–{Math.min(start + pageSize, filtered.length)}</strong> of <strong className="text-slate-700">{filtered.length}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1 bg-white rounded-xl ring-1 ring-slate-200 p-1 shadow-sm">
              {([['«', () => setPage(1)], ['‹', () => setPage(p => Math.max(1, p - 1))]] as const).map(([l, a]) => (
                <button key={l} onClick={a} disabled={curPage === 1} className="rounded-lg w-7 h-7 text-xs text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 hover:text-orange-700 transition-colors flex items-center justify-center">{l}</button>
              ))}
              <span className="px-3 h-7 inline-flex items-center text-xs font-bold rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm">
                {curPage} <span className="opacity-60 mx-1">/</span> {totalPages}
              </span>
              {([['›', () => setPage(p => Math.min(totalPages, p + 1))], ['»', () => setPage(totalPages)]] as const).map(([l, a]) => (
                <button key={l} onClick={a} disabled={curPage === totalPages} className="rounded-lg w-7 h-7 text-xs text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-50 hover:text-orange-700 transition-colors flex items-center justify-center">{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
