"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search, ChevronDown, Calendar,
  Plus, X, Pencil, Trash2, MoreVertical, Filter,
  CalendarDays,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface QuarterRow {
  id:                 string;
  fiscalYear:         number;
  quarter:            string;
  startDate:          string;
  endDate:            string;
  createdAt:          string;
  updatedAt:          string;
  createdBy:          string;
  createdByName:      string;
  createdByInitials:  string;
}

/* ─── Constants ──────────────────────────────────────────────────────────────── */
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const QUARTER_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Q1: { bg: "bg-accent-50",   text: "text-accent-700",   dot: "bg-accent-500"   },
  Q2: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  Q3: { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-500"  },
  Q4: { bg: "bg-green-50",  text: "text-green-700",  dot: "bg-green-500"  },
};

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return "—"; }
}

function toInputDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch { return ""; }
}

function getCurrentQuarterAndWeek(rows: QuarterRow[]): { quarter: string; week: number } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const r of rows) {
    const s = new Date(r.startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(r.endDate);   e.setHours(23, 59, 59, 999);
    if (today >= s && today <= e) {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const week   = Math.min(13, Math.max(1, Math.floor((today.getTime() - s.getTime()) / weekMs) + 1));
      return { quarter: r.quarter, week };
    }
  }
  return null;
}

/* ─── QuarterBadge ────────────────────────────────────────────────────────────── */
function QuarterBadge({ quarter }: { quarter: string }) {
  const c = QUARTER_COLORS[quarter] ?? QUARTER_COLORS.Q1;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {quarter}
    </span>
  );
}

/* ─── Edit Panel ─────────────────────────────────────────────────────────────── */
function EditPanel({
  open, onClose, onSaved, row,
}: {
  open:    boolean;
  onClose: () => void;
  onSaved: (rows: QuarterRow[]) => void;
  row:     QuarterRow | null;
}) {
  const [startDate, setStartDate] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  useEffect(() => {
    if (open && row) {
      setStartDate(toInputDate(row.startDate));
      setError("");
    }
  }, [open, row]);

  async function handleSubmit() {
    if (!startDate) { setError("Start date is required."); return; }

    setSaving(true); setError("");
    try {
      const res  = await fetch(`/api/org/quarters/${row!.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ startDate }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "Failed to save"); return; }
      onSaved(json.data);
      onClose();
    } finally { setSaving(false); }
  }

  if (!open || !row) return null;

  const isQ1 = row.quarter === "Q1";

  // Live-calculate Q1 end date (91 days from start) and FY end
  const parsedStart = startDate ? new Date(startDate) : null;
  const q1EndPreview = parsedStart
    ? new Date(new Date(startDate).setDate(parsedStart.getDate() + 90)) // 91 days = start + 90
    : null;
  const fyEndPreview = parsedStart
    ? new Date(new Date(startDate).setFullYear(parsedStart.getFullYear() + 1, parsedStart.getMonth(), parsedStart.getDate() - 1))
    : null;
  const computedEnd = q1EndPreview ? fmtDate(q1EndPreview.toISOString()) : fmtDate(row.endDate);

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[420px] bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <QuarterBadge quarter={row.quarter} />
              <span className="text-xs text-gray-400">FY {row.fiscalYear}-{String(row.fiscalYear + 1).slice(-2)}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Change Q1 start date — all quarters will recalculate automatically</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">
              Start Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setError(""); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
          </div>

          {/* End date read-only — live calculated */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">End Date</label>
            <div className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50">
              {computedEnd}
              <span className="text-[10px] ml-2 text-gray-300">(auto-calculated)</span>
            </div>
          </div>

          {/* Live quarter preview */}
          {parsedStart && fyEndPreview && (() => {
            const days = [91, 91, 91];
            const names = ["Q1", "Q2", "Q3", "Q4"];
            const preview: { name: string; start: Date; end: Date; days: number }[] = [];
            let cursor = new Date(parsedStart.getTime());
            for (let i = 0; i < 4; i++) {
              const qStart = new Date(cursor.getTime());
              const qEnd = i === 3
                ? fyEndPreview
                : new Date(new Date(cursor.getTime()).setDate(cursor.getDate() + 90));
              const qDays = Math.round((qEnd.getTime() - qStart.getTime()) / 86400000) + 1;
              preview.push({ name: names[i], start: qStart, end: qEnd, days: qDays });
              if (i < 3) cursor = new Date(new Date(qEnd.getTime()).setDate(qEnd.getDate() + 1));
            }
            return (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Quarter Preview</p>
                {preview.map(q => {
                  const c = QUARTER_COLORS[q.name] ?? QUARTER_COLORS.Q1;
                  return (
                    <div key={q.name} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg ${c.bg}`}>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${c.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />{q.name}
                      </span>
                      <span className="text-[11px] text-gray-600 flex-1">
                        {fmtDate(q.start.toISOString())} → {fmtDate(q.end.toISOString())}
                      </span>
                      <span className="text-[10px] text-gray-500 font-medium">{q.days}d</span>
                    </div>
                  );
                })}
                <p className="text-[10px] text-gray-400 mt-1">
                  FY ends: {fmtDate(fyEndPreview.toISOString())} &middot; {Math.round((fyEndPreview.getTime() - parsedStart.getTime()) / 86400000) + 1} total days
                </p>
              </div>
            );
          })()}

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & Recalculate"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Confirm Delete ─────────────────────────────────────────────────────────── */
function ConfirmDelete({
  open, quarter, onConfirm, onCancel,
}: { open: boolean; quarter: string; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
        <h3 className="text-sm font-bold text-gray-900 mb-2">Delete {quarter}?</h3>
        <p className="text-xs text-gray-500 mb-5">
          This quarter setting will be permanently removed. This action cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Generate Modal ─────────────────────────────────────────────────────────── */
function GenerateModal({
  open, onClose, onGenerated, existingYears, futureYearAvailable,
}: {
  open:          boolean;
  onClose:       () => void;
  onGenerated:   (rows: QuarterRow[]) => void;
  existingYears: number[];
  futureYearAvailable: number | null;
}) {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const [startDate, setStartDate] = useState("");

  // Calculate the next available FY
  const currentFY = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  let nextFY = currentFY;
  while (existingYears.includes(nextFY)) nextFY++;

  // If the next available FY is in the future and no futureYearAvailable, block creation
  const isFutureFY = nextFY > currentFY;
  const isBlocked = isFutureFY && futureYearAvailable === null;

  // Default start date: day 1 of the next FY year (April 1 for typical Indian FY)
  const defaultStart = `${nextFY}-04-01`;

  useEffect(() => {
    if (open) { setError(""); setStartDate(defaultStart); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Derive FY year from the picked start date
  const parsedStart = startDate ? new Date(startDate) : null;
  const derivedFY = parsedStart ? parsedStart.getFullYear() : nextFY;

  // Calculate FY end and quarter date previews
  const fyEndPreview = parsedStart
    ? new Date(new Date(startDate).setFullYear(parsedStart.getFullYear() + 1, parsedStart.getMonth(), parsedStart.getDate() - 1))
    : null;
  const totalDaysPreview = parsedStart && fyEndPreview
    ? Math.round((fyEndPreview.getTime() - parsedStart.getTime()) / 86400000) + 1
    : 365;
  const isLeapPreview = totalDaysPreview === 366;
  const q4DaysPreview = isLeapPreview ? 93 : 92;

  // Generate quarter date ranges for preview
  const quarterPreviews = parsedStart ? (() => {
    const days = [91, 91, 91, q4DaysPreview];
    const names = ["Q1", "Q2", "Q3", "Q4"];
    const result: { name: string; start: Date; end: Date; days: number }[] = [];
    let cursor = new Date(parsedStart.getTime());
    for (let i = 0; i < 4; i++) {
      const qStart = new Date(cursor.getTime());
      const qEnd = new Date(cursor.getTime());
      qEnd.setDate(qEnd.getDate() + days[i] - 1);
      result.push({ name: names[i], start: qStart, end: qEnd, days: days[i] });
      cursor = new Date(qEnd.getTime());
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  })() : [];

  const fyLabel = `FY ${derivedFY}-${String(derivedFY + 1).slice(-2)}`;

  async function handleGenerate() {
    if (!startDate) { setError("Please select a start date."); return; }
    if (existingYears.includes(derivedFY)) { setError(`FY ${derivedFY}-${String(derivedFY + 1).slice(-2)} already exists.`); return; }

    setSaving(true); setError("");
    try {
      const res = await fetch("/api/org/quarters", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fiscalYear: derivedFY, startDate }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "Failed to generate"); return; }
      onGenerated(json.data);
      onClose();
    } finally { setSaving(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-96">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Initialize Quarters</h3>

        {isBlocked ? (
          <>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 my-4">
              <p className="text-xs font-medium text-amber-800 mb-1">All quarters are up to date</p>
              <p className="text-[11px] text-amber-600">
                Current FY quarters already exist. To create next year&apos;s quarters, enable &quot;Future Quarters&quot; in Settings &gt; Configurations.
              </p>
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
            </div>
          </>
        ) : (
        <>
        <p className="text-xs text-gray-500 mb-4">
          Set the financial year start date. Quarters will be generated using day-count distribution.
        </p>

        {/* Date picker */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-600 block mb-1.5">FY Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setError(""); }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>

        {/* Preview */}
        {startDate && quarterPreviews.length > 0 && (
          <div className="mb-4 space-y-2">
            {/* FY summary header */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
              <div>
                <p className="text-xs font-bold text-gray-800">{fyLabel}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {fmtDate(startDate)} → {fyEndPreview ? fmtDate(fyEndPreview.toISOString()) : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-gray-700">{totalDaysPreview} days</p>
                {isLeapPreview && <p className="text-[10px] text-amber-600 font-medium">Leap year</p>}
              </div>
            </div>

            {/* Quarter breakdown */}
            {quarterPreviews.map((q) => {
              const colors = QUARTER_COLORS[q.name] ?? QUARTER_COLORS.Q1;
              return (
                <div key={q.name} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${colors.bg} border-opacity-50`} style={{ borderColor: "transparent" }}>
                  <div className="flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${colors.bg} ${colors.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                      {q.name}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-gray-700">
                      {fmtDate(q.start.toISOString())} → {fmtDate(q.end.toISOString())}
                    </p>
                  </div>
                  <p className="text-[10px] text-gray-500 font-medium flex-shrink-0">{q.days} days</p>
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleGenerate}
            disabled={saving || !startDate}
            className="px-4 py-2 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg disabled:opacity-50"
          >
            {saving ? "Generating…" : "Generate Quarters"}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function QuarterSettingsPage() {
  const [rows,          setRows]          = useState<QuarterRow[]>([]);
  const [allYears,      setAllYears]      = useState<number[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [filterQ,       setFilterQ]       = useState("");
  const [filterOpen,    setFilterOpen]    = useState(false);
  const [yearOpen,      setYearOpen]      = useState(false);
  const [moreOpen,      setMoreOpen]      = useState(false);
  const [selectedYear,  setSelectedYear]  = useState<number | null>(null);
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());
  const [editRow,       setEditRow]       = useState<QuarterRow | null>(null);
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [deleteRow,     setDeleteRow]     = useState<QuarterRow | null>(null);
  const [generateOpen,  setGenerateOpen]  = useState(false);
  const [futureYearAvailable, setFutureYearAvailable] = useState<number | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);
  const yearRef   = useRef<HTMLDivElement>(null);
  const moreRef   = useRef<HTMLDivElement>(null);

  // Default fiscal year = current
  const defaultFY = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  const fetchRows = useCallback(async (year?: number) => {
    setLoading(true);
    try {
      const url  = `/api/org/quarters${year !== undefined ? `?year=${year}` : ""}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setRows(json.data);
        setAllYears(json.availableYears ?? []);
        setFutureYearAvailable(json.futureYearAvailable ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: show current FY if it exists, else all
  useEffect(() => {
    (async () => {
      const res  = await fetch("/api/org/quarters");
      const json = await res.json();
      if (json.success) {
        const years: number[] = json.availableYears ?? [];
        setAllYears(years);
        setFutureYearAvailable(json.futureYearAvailable ?? null);
        const fy = years.includes(defaultFY) ? defaultFY : (years[0] ?? defaultFY);
        setSelectedYear(fy);
        const filtered = (json.data as QuarterRow[]).filter(r => r.fiscalYear === fy);
        setRows(filtered);
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
      if (yearRef.current   && !yearRef.current.contains(e.target as Node))   setYearOpen(false);
      if (moreRef.current   && !moreRef.current.contains(e.target as Node))   setMoreOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleYearChange(y: number) {
    setSelectedYear(y);
    setYearOpen(false);
    setSelectedIds(new Set());
    fetchRows(y);
  }

  const filtered = useMemo(() => rows.filter(r => {
    if (filterQ && r.quarter !== filterQ) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.quarter.toLowerCase().includes(q) || fmtDate(r.startDate).includes(q) || fmtDate(r.endDate).includes(q);
    }
    return true;
  }), [rows, search, filterQ]);

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelectedIds(selectedIds.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(r => r.id)));
  }

  function handleSaved(updated: QuarterRow[]) {
    setRows(updated);
  }

  function handleGenerated(newRows: QuarterRow[]) {
    if (newRows.length > 0) {
      const fy = newRows[0].fiscalYear;
      setSelectedYear(fy);
      setAllYears(prev => [...new Set([...prev, fy])].sort((a, b) => b - a));
      fetchRows(fy);
    }
  }

  async function handleDelete(row: QuarterRow) {
    const res  = await fetch(`/api/org/quarters/${row.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) setRows(prev => prev.filter(r => r.id !== row.id));
    setDeleteRow(null);
  }

  async function handleBulkDelete() {
    await Promise.all([...selectedIds].map(id => fetch(`/api/org/quarters/${id}`, { method: "DELETE" })));
    setRows(prev => prev.filter(r => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
  }

  const currentQW  = getCurrentQuarterAndWeek(rows);
  const fyLabel    = selectedYear ? `FY ${selectedYear}-${String(selectedYear + 1).slice(-2)}` : "—";
  const activeFilters = (filterQ ? 1 : 0);

  /* ── Table view ── */
  const TableView = () => (
    <div className="flex-1 overflow-auto">
      <table className="border-separate border-spacing-0 text-xs" style={{ minWidth: 600, width: "100%" }}>
        <thead className="sticky top-0 z-30">
          <tr>
            <th className="sticky z-[35] bg-accent-50 border-b border-r border-gray-200 px-2 py-2 w-10">
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={toggleAll}
                className="rounded border-gray-300 text-accent-600 cursor-pointer"
              />
            </th>
            <th className="text-left text-xs font-semibold text-gray-500 bg-accent-50 border-b border-r border-gray-200 px-3 py-2 w-14">ID</th>
            <th className="text-left text-xs font-semibold text-gray-500 bg-accent-50 border-b border-r border-gray-200 px-3 py-2">Quarter</th>
            <th className="text-left text-xs font-semibold text-gray-500 bg-accent-50 border-b border-r border-gray-200 px-3 py-2">Start Date</th>
            <th className="text-left text-xs font-semibold text-gray-500 bg-accent-50 border-b border-r border-gray-200 px-3 py-2">End Date</th>
            <th className="bg-accent-50 border-b border-r border-gray-200 px-3 py-2 w-20" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="text-center py-16 text-xs text-gray-400">Loading…</td></tr>
          ) : filtered.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-16">
                <div className="flex flex-col items-center gap-2">
                  <CalendarDays className="h-8 w-8 text-gray-200" />
                  <p className="text-sm text-gray-400 font-medium">No quarters found</p>
                  <p className="text-xs text-gray-400">Click <span className="font-semibold">Initialize Quarters</span> to generate.</p>
                </div>
              </td>
            </tr>
          ) : filtered.map((row, idx) => {
            const isQ1 = row.quarter === "Q1";
            return (
            <tr
              key={row.id}
              className={`group transition-colors ${isQ1 ? "hover:bg-accent-50/30 cursor-pointer" : ""} ${selectedIds.has(row.id) ? "bg-accent-50/60" : ""}`}
              onClick={() => { if (isQ1) { setEditRow(row); setPanelOpen(true); } }}
            >
              <td className="px-2 py-2 border-b border-r border-gray-100" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.id)}
                  onChange={() => toggleSelect(row.id)}
                  className="rounded border-gray-300 text-accent-600 cursor-pointer"
                />
              </td>
              <td className="px-3 py-2 border-b border-r border-gray-100 text-xs font-semibold text-accent-600">{idx + 1}</td>
              <td className="px-3 py-2 border-b border-r border-gray-100"><QuarterBadge quarter={row.quarter} /></td>
              <td className="px-3 py-2 border-b border-r border-gray-100 text-xs text-gray-700">{fmtDate(row.startDate)}</td>
              <td className="px-3 py-2 border-b border-r border-gray-100 text-xs text-gray-700">{fmtDate(row.endDate)}</td>
              <td className="px-3 py-2 border-b border-r border-gray-100" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isQ1 && (
                  <button
                    onClick={() => { setEditRow(row); setPanelOpen(true); }}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-accent-600 hover:bg-accent-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  )}
                  <button
                    onClick={() => setDeleteRow(row)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          );})}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ── Page header ── */}
      <div className="px-6 pt-6 pb-4 bg-white border-b border-gray-200 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Quarter Settings</h1>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium border border-gray-200">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </span>
          {currentQW && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-50 text-accent-600 text-xs font-medium border border-accent-200">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500 inline-block" />
              Quarter: {currentQW.quarter} • Week {currentQW.week}
            </span>
          )}
        </div>
      </div>

      {/* ── Controls bar ── */}
      <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-2 flex-shrink-0 flex-wrap">
        {/* Bulk delete */}
        {selectedIds.size > 0 && (
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedIds.size})
          </button>
        )}

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 w-44"
          />
        </div>

        {/* Filter */}
        <div ref={filterRef} className="relative">
          <button
            onClick={() => setFilterOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg ${activeFilters > 0 ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            <Filter className="h-3.5 w-3.5" />
            {activeFilters > 0 && <span className="bg-accent-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{activeFilters}</span>}
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-44">
              <p className="text-xs font-semibold text-gray-700 mb-2">Quarter</p>
              <div className="space-y-1">
                <button onClick={() => setFilterQ("")}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${!filterQ ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                  All
                </button>
                {QUARTERS.map(q => (
                  <button key={q} onClick={() => { setFilterQ(q); setFilterOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${filterQ === q ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Year picker */}
        <div ref={yearRef} className="relative">
          <button
            onClick={() => setYearOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs border border-gray-300 bg-white rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
          >
            <Calendar className="h-3.5 w-3.5 text-accent-500" />
            {fyLabel}
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
          {yearOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44">
              {allYears.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No years yet.</p>
              ) : allYears.map(y => (
                <button key={y} onClick={() => handleYearChange(y)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 ${selectedYear === y ? "text-accent-600 font-semibold bg-accent-50" : "text-gray-700"}`}>
                  FY {y}-{String(y + 1).slice(-2)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* More menu */}
        <div ref={moreRef} className="relative">
          <button onClick={() => setMoreOpen(o => !o)}
            className="h-8 w-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
            <MoreVertical className="h-4 w-4" />
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-48">
              <button
                onClick={() => { setGenerateOpen(true); setMoreOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
              >
                <Plus className="h-3.5 w-3.5 text-accent-500" /> Initialize Quarters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <TableView />

      {/* ── Edit Panel ── */}
      <EditPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onSaved={handleSaved}
        row={editRow}
      />

      {/* ── Confirm Delete ── */}
      <ConfirmDelete
        open={!!deleteRow}
        quarter={deleteRow?.quarter ?? ""}
        onConfirm={() => deleteRow && handleDelete(deleteRow)}
        onCancel={() => setDeleteRow(null)}
      />

      {/* ── Generate Modal ── */}
      <GenerateModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={handleGenerated}
        existingYears={allYears}
        futureYearAvailable={futureYearAvailable}
      />
    </div>
  );
}
