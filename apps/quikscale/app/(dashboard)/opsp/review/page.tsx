"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  getFiscalYear,
  getFiscalQuarter,
  fiscalYearLabel,
} from "@/lib/utils/fiscal";
// Map achieved% to traffic-light bg color (same thresholds as KPI)
function achievedPctColor(pct: number): string {
  if (pct >= 120) return "bg-blue-600";
  if (pct >= 100) return "bg-green-600";
  if (pct >= 80)  return "bg-yellow-500";
  return "bg-red-600";
}
import {
  TableSkeleton,
  EmptyState,
  Button,
  Select,
  DataTable,
  type DataTableColumn,
} from "@quikit/ui";
import { Clock, FileText, X, RotateCcw, AlertTriangle } from "lucide-react";

/* ═══════════════════════════════════════════════
   Checkbox hook (shared for primary + secondary)
   ═══════════════════════════════════════════════ */

function useRowSelection() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (idx: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  const toggleAll = (allIdxs: number[]) =>
    setSelected((prev) =>
      prev.size === allIdxs.length ? new Set() : new Set(allIdxs),
    );
  const clear = () => setSelected(new Set());
  return { selected, toggle, toggleAll, clear };
}

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

type Horizon = "quarter" | "yearly" | "3to5year";
type ViewMode = "primary" | "secondary";

interface PeriodData {
  target: number | null;
  achieved: number | null;
  gap: number | null;
  achievedPct: number | null;
  comment: string | null;
  autoPopulated?: boolean;
}

interface ReviewRow {
  rowIndex: number;
  category: string;
  projected: string;
  periods: Record<string, PeriodData>;
}

interface SecondaryRow {
  desc: string;
  owner: string;
  ownerName: string;
  status: string | null;
  comment: string;
}

interface ReviewData {
  opspId: string | null;
  opspStatus: string | null;
  targetYears: number;
  rows: ReviewRow[];
  secondaryRows: SecondaryRow[];
  year: number;
  quarter: string;
  horizon: string;
  fiscalYearStart: number;
}

interface TableRow {
  rowIndex: number;
  category: string;
  periodKey: string;
  periodLabel: string;
  target: number | null;
  achieved: number | null;
  gap: number | null;
  achievedPct: number | null;
  comment: string | null;
  isCumulative: boolean;
  isFirstInGroup: boolean;
  groupSize: number;
  autoPopulated?: boolean;
}

interface SecondaryTableRow {
  index: number;
  desc: string;
  owner: string;
  ownerName: string;
  status: string;
  comment: string;
}

/* ═══════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════ */

const HORIZON_TABS: { key: Horizon; label: string }[] = [
  { key: "quarter", label: "Quarter" },
  { key: "yearly", label: "Yearly" },
  { key: "3to5year", label: "3 to 5 Years" },
];

const HORIZON_LABELS: Record<Horizon, { primaryTitle: string; secondaryTitle: string; primary: string; secondary: string }> = {
  quarter:    { primaryTitle: "Actions (QTR)", secondaryTitle: "Rocks (QTR)", primary: "Actions", secondary: "Rocks" },
  yearly:     { primaryTitle: "Goals (1 Year)", secondaryTitle: "Key Initiatives (QTR)", primary: "Goals", secondary: "Key Initiatives" },
  "3to5year": { primaryTitle: "Targets (3-5 Yr)", secondaryTitle: "Key Thrusts (QTR)", primary: "Targets", secondary: "Key Thrusts" },
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

import {
  STATUS_SELECT_OPTIONS,
  statusCellBg,
  statusLabel as getStatusLabel,
} from "@/lib/constants/status";

const CURRENT_YEAR = new Date().getFullYear();
const FISCAL_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

/* ═══════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════ */

function getPeriodLabels(
  horizon: Horizon,
  fiscalYearStart: number,
  quarter: string,
  year: number,
  targetYears: number,
): { key: string; label: string }[] {
  if (horizon === "quarter") {
    const qNum = parseInt(quarter.replace("Q", "")) - 1;
    const start = ((fiscalYearStart - 1) + qNum * 3) % 12;
    return [
      { key: "m1", label: MONTH_NAMES[start] },
      { key: "m2", label: MONTH_NAMES[(start + 1) % 12] },
      { key: "m3", label: MONTH_NAMES[(start + 2) % 12] },
    ];
  }
  if (horizon === "yearly") {
    return [
      { key: "q1", label: "Quarter 1" },
      { key: "q2", label: "Quarter 2" },
      { key: "q3", label: "Quarter 3" },
      { key: "q4", label: "Quarter 4" },
    ];
  }
  return Array.from({ length: targetYears }, (_, i) => ({
    key: `y${i + 1}`,
    label: String(year + i),
  }));
}

function computeMetrics(target: number | null, achieved: number | null) {
  if (target == null || achieved == null) return { gap: null, achievedPct: null };
  const rawGap = parseFloat((target - achieved).toFixed(4));
  // Gap can't be negative — if overachieved, gap is 0
  const gap = rawGap < 0 ? 0 : rawGap;
  const achievedPct = target > 0 ? parseFloat(((achieved / target) * 100).toFixed(1)) : 0;
  return { gap, achievedPct };
}

function buildTableRows(rows: ReviewRow[], periodLabels: { key: string; label: string }[]): TableRow[] {
  const result: TableRow[] = [];
  for (const row of rows) {
    if (!row.category.trim()) continue;
    const groupSize = periodLabels.length + 1;
    let cumT = 0, cumA = 0, hasA = false;
    periodLabels.forEach((pl, idx) => {
      const pd = row.periods[pl.key] ?? { target: null, achieved: null, gap: null, achievedPct: null, comment: null };
      // For auto-populated periods, use the API-provided gap/achievedPct (from source cumulative)
      const metrics = pd.autoPopulated && pd.gap != null && pd.achievedPct != null
        ? { gap: pd.gap, achievedPct: pd.achievedPct }
        : computeMetrics(pd.target, pd.achieved);
      if (pd.target != null) cumT += pd.target;
      if (pd.achieved != null) { cumA += pd.achieved; hasA = true; }
      result.push({ rowIndex: row.rowIndex, category: row.category, periodKey: pl.key, periodLabel: pl.label, target: pd.target, achieved: pd.achieved, gap: metrics.gap, achievedPct: metrics.achievedPct, comment: pd.comment, isCumulative: false, isFirstInGroup: idx === 0, groupSize, autoPopulated: pd.autoPopulated });
    });
    const cum = computeMetrics(cumT, hasA ? cumA : null);
    // Cumulative row is auto-populated if ANY child period was auto-populated
    const cumAutoPopulated = periodLabels.some((pl) => row.periods[pl.key]?.autoPopulated);
    result.push({ rowIndex: row.rowIndex, category: row.category, periodKey: "cumulative", periodLabel: "Cumulative", target: cumT || null, achieved: hasA ? cumA : null, gap: cum.gap, achievedPct: cum.achievedPct, isCumulative: true, comment: null, isFirstInGroup: false, groupSize, autoPopulated: cumAutoPopulated });
  }
  return result;
}

/* ═══════════════════════════════════════════════
   Logs Popover
   ═══════════════════════════════════════════════ */

function LogsPopover({ opspId, horizon, rowIndex, onClose }: { opspId: string; horizon: Horizon; rowIndex: number; onClose: () => void }) {
  const [logs, setLogs] = useState<{ id: string; action: string; reason: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    fetch(`/api/opsp/review/logs?opspId=${opspId}&horizon=${horizon}&rowIndex=${rowIndex}`)
      .then((r) => r.json())
      .then((j) => { if (ok && j.success) setLogs(j.data); })
      .catch(() => {})
      .finally(() => { if (ok) setLoading(false); });
    return () => { ok = false; };
  }, [opspId, horizon, rowIndex]);

  return (
    <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg w-72 max-h-60 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Audit History</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
      </div>
      {loading ? (
        <div className="px-3 py-4 text-xs text-gray-400 text-center">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="px-3 py-4 text-xs text-gray-400 text-center">No changes recorded yet</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {logs.map((l) => (
            <div key={l.id} className="px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-gray-600">{l.action}</span>
                <span className="text-[10px] text-gray-400">{new Date(l.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              {l.reason && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{l.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════ */

export default function OPSPReviewPage() {
  const [year, setYear] = useState(getFiscalYear);
  const [quarter, setQuarter] = useState<string>(getFiscalQuarter);
  const [horizon, setHorizon] = useState<Horizon>("quarter");
  const [viewMode, setViewMode] = useState<ViewMode>("primary");
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [logsRowIndex, setLogsRowIndex] = useState<number | null>(null);

  // Row selection
  const primarySel = useRowSelection();
  const secondarySel = useRowSelection();

  // Year/Quarter picker
  const [showYearPicker, setShowYearPicker] = useState(false);
  const yearRef = useRef<HTMLDivElement>(null);

  // Primary modal
  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [primaryIdx, setPrimaryIdx] = useState(0);
  const [primaryCategory, setPrimaryCategory] = useState("");
  const [primaryEdits, setPrimaryEdits] = useState<Record<string, { target: number | null; achieved: number | null; comment: string }>>({});
  const [primaryActiveTab, setPrimaryActiveTab] = useState("");

  // Secondary modal
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [secondaryIdx, setSecondaryIdx] = useState(0);
  const [secondaryDesc, setSecondaryDesc] = useState("");
  const [secondaryOwner, setSecondaryOwner] = useState("");
  const [secondaryStatus, setSecondaryStatus] = useState("");
  const [secondaryComment, setSecondaryComment] = useState("");

  // Secondary local edits
  const [secondaryEdits, setSecondaryEdits] = useState<Record<number, { status: string; comment: string }>>({});

  // Close year picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (yearRef.current && !yearRef.current.contains(e.target as Node)) setShowYearPicker(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Load data ── */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/opsp/review?year=${year}&quarter=${quarter}&horizon=${horizon}`);
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Failed to load data"); return; }
      setData(json.data);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [year, quarter, horizon]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setSecondaryEdits({}); }, [data, horizon]);

  // Re-fetch when tab regains focus (e.g. user finalized OPSP on another page)
  useEffect(() => {
    function onFocus() { loadData(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadData]);

  /* ── Derived data ── */
  const periodLabels = useMemo(() => {
    if (!data) return [];
    return getPeriodLabels(horizon, data.fiscalYearStart, data.quarter, data.year, data.targetYears ?? 5);
  }, [data, horizon]);

  const tableRows = useMemo(() => {
    if (!data?.rows) return [];
    return buildTableRows(data.rows, periodLabels);
  }, [data, periodLabels]);

  const filteredRows = useMemo(() => {
    if (!search) return tableRows;
    const q = search.toLowerCase();
    const matched = new Set(tableRows.filter((r) => r.category.toLowerCase().includes(q)).map((r) => r.rowIndex));
    return tableRows.filter((r) => matched.has(r.rowIndex));
  }, [tableRows, search]);

  const secondaryTableRows: SecondaryTableRow[] = useMemo(() => {
    if (!data?.secondaryRows) return [];
    return data.secondaryRows.filter((r) => r.desc.trim()).map((r, i) => ({
      index: i, desc: r.desc, owner: r.owner, ownerName: r.ownerName,
      status: secondaryEdits[i]?.status ?? r.status ?? "",
      comment: secondaryEdits[i]?.comment ?? r.comment ?? "",
    }));
  }, [data, secondaryEdits]);

  const filteredSecondary = useMemo(() => {
    if (!search) return secondaryTableRows;
    const q = search.toLowerCase();
    return secondaryTableRows.filter((r) => r.desc.toLowerCase().includes(q) || r.ownerName.toLowerCase().includes(q));
  }, [secondaryTableRows, search]);

  const itemCount = viewMode === "primary"
    ? (data?.rows?.filter((r) => r.category.trim()).length ?? 0)
    : secondaryTableRows.length;

  const labels = HORIZON_LABELS[horizon];
  const isFinalized = data?.opspStatus === "finalized";
  const hasOPSP = !!data?.opspId;
  const tableTitle = viewMode === "primary"
    ? `${labels.primaryTitle} – ${quarter} - ${year}`
    : `${labels.secondaryTitle} – ${quarter} - ${year}`;

  /* ── Open primary modal ── */
  function openPrimaryModal(rowIndex: number) {
    const row = data?.rows.find((r) => r.rowIndex === rowIndex);
    if (!row) return;
    const edits: typeof primaryEdits = {};
    for (const pl of periodLabels) {
      const pd = row.periods[pl.key];
      edits[pl.key] = { target: pd?.target ?? null, achieved: pd?.achieved ?? null, comment: pd?.comment ?? "" };
    }
    setPrimaryIdx(rowIndex);
    setPrimaryCategory(row.category);
    setPrimaryEdits(edits);
    setPrimaryActiveTab(periodLabels[0]?.key ?? "");
    setPrimaryOpen(true);
  }

  /** Check if a period tab's achieved value is auto-populated from child horizon */
  const isTabAutoPopulated = useMemo(() => {
    if (!data?.rows) return false;
    const row = data.rows.find((r) => r.rowIndex === primaryIdx);
    if (!row) return false;
    return row.periods[primaryActiveTab]?.autoPopulated === true;
  }, [data, primaryIdx, primaryActiveTab]);

  /* ── Open secondary modal ── */
  function openSecondaryModal(index: number) {
    const row = secondaryTableRows[index];
    if (!row) return;
    setSecondaryIdx(index);
    setSecondaryDesc(row.desc);
    setSecondaryOwner(row.ownerName);
    setSecondaryStatus(row.status);
    setSecondaryComment(row.comment);
    setSecondaryOpen(true);
  }

  /* ── Save primary ── */
  async function handlePrimarySave() {
    if (!data?.opspId) return;
    setSaving(true);
    try {
      const row = data.rows.find((r) => r.rowIndex === primaryIdx);
      const entries = Object.entries(primaryEdits)
        .filter(([period]) => {
          // Skip auto-populated periods — their achieved values are derived, not user-entered
          return !row?.periods[period]?.autoPopulated;
        })
        .map(([period, vals]) => ({
          period, targetValue: vals.target, achievedValue: vals.achieved, comment: vals.comment || null,
        }));
      const res = await fetch("/api/opsp/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year, quarter, horizon, rowIndex: primaryIdx, category: primaryCategory, entries }),
      });
      const json = await res.json();
      if (!json.success) { alert(json.error ?? "Save failed"); return; }
      setPrimaryOpen(false);
      await loadData();
    } catch { alert("Network error"); }
    finally { setSaving(false); }
  }

  /* ── Save secondary ── */
  async function handleSecondarySave() {
    if (!data?.opspId) return;
    setSaving(true);
    try {
      const row = secondaryTableRows[secondaryIdx];
      const res = await fetch("/api/opsp/review/secondary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          year, quarter, horizon,
          rowIndex: secondaryIdx,
          category: row?.desc ?? "",
          status: secondaryStatus || null,
          comment: secondaryComment || null,
        }),
      });
      const json = await res.json();
      if (!json.success) { alert(json.error ?? "Save failed"); return; }
      setSecondaryEdits((prev) => ({ ...prev, [secondaryIdx]: { status: secondaryStatus, comment: secondaryComment } }));
      setSecondaryOpen(false);
      await loadData();
    } catch { alert("Network error"); }
    finally { setSaving(false); }
  }

  /* ── Primary modal field update ── */
  function updatePrimaryField(field: "achieved" | "comment", value: string) {
    setPrimaryEdits((prev) => ({
      ...prev,
      [primaryActiveTab]: {
        ...prev[primaryActiveTab],
        [field]: field === "achieved" ? (value === "" ? null : parseFloat(value) || 0) : value,
      },
    }));
  }

  const tabData = primaryEdits[primaryActiveTab] ?? { target: null, achieved: null, comment: "" };
  const { gap, achievedPct } = computeMetrics(tabData.target, tabData.achieved);

  /* ── Column definitions ── */

  // Unique category indices for primary checkbox "select all"
  const primaryCategoryIdxs = useMemo(
    () => [...new Set(filteredRows.map((r) => r.rowIndex))],
    [filteredRows],
  );

  const primaryColumns: DataTableColumn<TableRow>[] = useMemo(() => [
    {
      key: "_cb",
      label: (
        <input
          type="checkbox"
          checked={primarySel.selected.size === primaryCategoryIdxs.length && primaryCategoryIdxs.length > 0}
          onChange={() => primarySel.toggleAll(primaryCategoryIdxs)}
          className="rounded border-gray-300 text-blue-600 cursor-pointer"
        />
      ),
      width: 40,
      align: "center",
      render: (row) =>
        row.isFirstInGroup ? (
          <input
            type="checkbox"
            checked={primarySel.selected.has(row.rowIndex)}
            onChange={() => primarySel.toggle(row.rowIndex)}
            className="rounded border-gray-300 text-blue-600 cursor-pointer"
          />
        ) : null,
    },
    {
      key: "_log",
      label: "",
      width: 40,
      align: "center",
      render: (row) =>
        row.isFirstInGroup ? (
          <div className="relative">
            <button
              onClick={() => setLogsRowIndex(logsRowIndex === row.rowIndex ? null : row.rowIndex)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
              title="View audit history"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
            {logsRowIndex === row.rowIndex && data?.opspId && (
              <LogsPopover
                opspId={data.opspId}
                horizon={horizon}
                rowIndex={row.rowIndex}
                onClose={() => setLogsRowIndex(null)}
              />
            )}
          </div>
        ) : null,
    },
    {
      key: "_id",
      label: "#",
      width: 44,
      align: "center",
      render: (row) =>
        row.isFirstInGroup ? (
          <button
            onClick={() => openPrimaryModal(row.rowIndex)}
            className="text-gray-900 hover:underline font-medium"
          >
            {row.rowIndex + 1}
          </button>
        ) : null,
    },
    {
      key: "category",
      label: "Category",
      width: 200,
      render: (row) =>
        row.isFirstInGroup ? (
          <span className="font-medium text-gray-800 truncate block">{row.category}</span>
        ) : null,
    },
    {
      key: "period",
      label: "Period",
      width: 120,
      render: (row) => (
        <span className={cn("text-gray-600", row.isCumulative && "font-semibold text-gray-800")}>
          {row.periodLabel}
        </span>
      ),
    },
    {
      key: "target",
      label: "Target (CR)",
      width: 100,
      align: "right",
      render: (row) => (
        <span className="text-gray-700">{row.target != null ? row.target.toLocaleString() : "—"}</span>
      ),
    },
    {
      key: "achieved",
      label: "Achieved",
      width: 100,
      align: "right",
      render: (row) => (
        <span className="text-gray-700">{row.achieved != null ? row.achieved.toLocaleString() : "—"}</span>
      ),
    },
    {
      key: "gap",
      label: "Gap",
      width: 90,
      align: "right",
      render: (row) => (
        <span className="text-gray-700">{row.gap != null ? row.gap.toLocaleString() : "—"}</span>
      ),
    },
    {
      key: "achievedPct",
      label: "Achieved %",
      width: 100,
      align: "center",
      thClassName: "whitespace-nowrap",
      tdClassName: (row) => {
        if (row.achievedPct == null) return "";
        const color = achievedPctColor(row.achievedPct);
        return `${color} text-white font-semibold`;
      },
      render: (row) => (
        <span>{row.achievedPct != null ? `${row.achievedPct}%` : "—"}</span>
      ),
    },
    {
      key: "comment",
      label: "Comments",
      render: (row) => (
        <span className="text-gray-500 truncate block">{row.comment || "—"}</span>
      ),
    },
  ], [primarySel.selected, primaryCategoryIdxs, logsRowIndex, data?.opspId, horizon]);

  const secondaryIdxs = useMemo(
    () => filteredSecondary.map((r) => r.index),
    [filteredSecondary],
  );

  const secondaryColumns: DataTableColumn<SecondaryTableRow>[] = useMemo(() => [
    {
      key: "_cb",
      label: (
        <input
          type="checkbox"
          checked={secondarySel.selected.size === secondaryIdxs.length && secondaryIdxs.length > 0}
          onChange={() => secondarySel.toggleAll(secondaryIdxs)}
          className="rounded border-gray-300 text-blue-600 cursor-pointer"
        />
      ),
      width: 40,
      align: "center",
      render: (row) => (
        <input
          type="checkbox"
          checked={secondarySel.selected.has(row.index)}
          onChange={() => secondarySel.toggle(row.index)}
          className="rounded border-gray-300 text-blue-600 cursor-pointer"
        />
      ),
    },
    {
      key: "_log",
      label: "",
      width: 40,
      align: "center",
      render: (row) => (
        <div className="relative">
          <button
            onClick={() => setLogsRowIndex(logsRowIndex === row.index + 1000 ? null : row.index + 1000)}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
            title="View audit history"
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
          {logsRowIndex === row.index + 1000 && data?.opspId && (
            <LogsPopover
              opspId={data.opspId}
              horizon={horizon}
              rowIndex={row.index}
              onClose={() => setLogsRowIndex(null)}
            />
          )}
        </div>
      ),
    },
    {
      key: "_id",
      label: "#",
      width: 44,
      align: "center",
      render: (row) => (
        <button
          onClick={() => openSecondaryModal(row.index)}
          className="text-gray-900 hover:underline font-medium"
        >
          {row.index + 1}
        </button>
      ),
    },
    {
      key: "desc",
      label: "Description",
      width: 280,
      render: (row) => (
        <span className="text-gray-800 truncate block">{row.desc}</span>
      ),
    },
    {
      key: "who",
      label: "Who",
      width: 150,
      render: (row) => (
        <span className="text-gray-600 truncate block">{row.ownerName || "—"}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 130,
      align: "center",
      tdClassName: (row) => statusCellBg(row.status),
      render: (row) => (
        <span className={cn("text-xs font-medium", !row.status && "text-gray-400")}>
          {row.status ? getStatusLabel(row.status) : ""}
        </span>
      ),
    },
    {
      key: "comment",
      label: "Comments",
      render: (row) => (
        <span className="text-gray-500 truncate block">{row.comment || "—"}</span>
      ),
    },
  ], [secondarySel.selected, secondaryIdxs, logsRowIndex, data?.opspId, horizon]);

  /* ═══════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════ */

  return (
    <div className="flex flex-col h-full">
      {/* ── Page Header (matches Priority/WWW/KPI) ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">OPSP Review</h1>
          {!loading && hasOPSP && isFinalized && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Primary/Secondary toggle */}
          <button
            onClick={() => setViewMode("primary")}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
              viewMode === "primary" ? "bg-accent-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            )}
          >
            {labels.primary}
          </button>
          <button
            onClick={() => setViewMode("secondary")}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
              viewMode === "secondary" ? "bg-accent-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            )}
          >
            {labels.secondary}
          </button>

          {/* Submit (disabled placeholder) */}
          <Button size="sm" disabled className="opacity-50 cursor-not-allowed" title="Coming soon">
            Submit
          </Button>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400 w-44"
            />
          </div>

          {/* Year / Quarter picker (same as Priority/KPI) */}
          <div className="relative" ref={yearRef}>
            <button
              onClick={() => setShowYearPicker((o) => !o)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors",
                showYearPicker ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600",
              )}
            >
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {fiscalYearLabel(year)} · {quarter}
              <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showYearPicker && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Fiscal Year</p>
                  <div className="grid grid-cols-1 gap-1">
                    {FISCAL_YEARS.map((y) => (
                      <button key={y} onClick={() => setYear(y)}
                        className={cn("text-xs px-3 py-1.5 rounded-lg text-left transition-colors", year === y ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700")}>
                        {fiscalYearLabel(y)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quarter</p>
                  <div className="grid grid-cols-4 gap-1">
                    {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => (
                      <button key={q} onClick={() => { setQuarter(q); setShowYearPicker(false); }}
                        className={cn("text-xs px-2 py-1.5 rounded-lg transition-colors", quarter === q ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700 border border-gray-200")}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Horizon Pills ── */}
      <div className="px-6 pt-3 pb-2 bg-white border-b border-gray-100">
        <div className="flex gap-2">
          {HORIZON_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setHorizon(tab.key)}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-full border transition-colors",
                horizon === tab.key
                  ? "bg-accent-600 text-white border-accent-600"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content Area ── */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={10} cols={7} />
        ) : error ? (
          <div className="flex items-center justify-center h-full text-sm text-red-500">
            <div className="flex flex-col items-center gap-3">
              <p>{error}</p>
              <Button size="sm" variant="secondary" onClick={loadData}>
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            </div>
          </div>
        ) : !hasOPSP ? (
          /* ── No OPSP found ── */
          <EmptyState
            icon={FileText}
            message={`No OPSP found for ${fiscalYearLabel(year)} · ${quarter}. Create one in Insert OPSP Data first.`}
          />
        ) : !isFinalized ? (
          /* ── OPSP exists but not finalized — prompt user ── */
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-amber-50">
              <AlertTriangle className="h-7 w-7 text-amber-500" />
            </div>
            <div className="text-center max-w-sm">
              <p className="text-sm font-semibold text-gray-800">OPSP Not Finalized</p>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                Your OPSP for {fiscalYearLabel(year)} · {quarter} is still in <span className="font-medium text-gray-700">draft</span> status.
                Please finalize your OPSP in <span className="font-medium text-gray-700">Insert OPSP Data</span> to start reviewing.
              </p>
            </div>
            <a
              href="/opsp"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md hover:bg-gray-700 transition-colors"
            >
              Go to Insert OPSP Data
            </a>
          </div>
        ) : (
          /* ── Table content ── */
          <div className="h-full overflow-auto">
            {/* Table title bar */}
            <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700 text-center">{tableTitle}</p>
            </div>

            {viewMode === "primary" ? (
              /* ── PRIMARY TABLE ── */
              filteredRows.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  message={search ? `No results matching "${search}"` : `No ${labels.primary.toLowerCase()} data in this OPSP`}
                />
              ) : (
                <DataTable<TableRow>
                  columns={primaryColumns}
                  data={filteredRows}
                  rowKey={(row) => `${row.rowIndex}-${row.periodKey}`}
                  rowClassName={(row) => row.isCumulative ? "bg-gray-50/70" : ""}
                  emptyMessage={`No ${labels.primary.toLowerCase()} data`}
                />
              )
            ) : (
              /* ── SECONDARY TABLE ── */
              filteredSecondary.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  message={search ? `No results matching "${search}"` : `No ${labels.secondary.toLowerCase()} data in this OPSP`}
                />
              ) : (
                <DataTable<SecondaryTableRow>
                  columns={secondaryColumns}
                  data={filteredSecondary}
                  rowKey={(row) => String(row.index)}
                  emptyMessage={`No ${labels.secondary.toLowerCase()} data`}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* ── Primary Panel (right slide-in, same as KPI LogModal) ── */}
      {primaryOpen && (
        <div className="fixed inset-0 z-[200] flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPrimaryOpen(false)} />
          <div className="relative ml-auto h-full w-[520px] bg-white shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className="text-sm font-semibold text-gray-800">{horizon === "quarter" ? "Review Action" : horizon === "yearly" ? "Review Goals" : "Review Targets"}</h2>
                <span className="text-[11px] text-gray-500 mt-0.5">{primaryCategory}</span>
              </div>
              <button onClick={() => setPrimaryOpen(false)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Period tabs */}
            <div className="flex border-b border-gray-200 px-6 flex-shrink-0">
              {periodLabels.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPrimaryActiveTab(p.key)}
                  className={cn(
                    "px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
                    primaryActiveTab === p.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Target (CR)</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">{tabData.target ?? "—"}</div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Achieved{isTabAutoPopulated && <span className="ml-1 text-accent-500 normal-case font-normal">(auto-populated from quarterly review)</span>}
                </label>
                {isTabAutoPopulated ? (
                  <div className="px-3 py-2 bg-accent-50 border border-accent-200 rounded-lg text-xs text-gray-700 font-medium">{tabData.achieved ?? "—"}</div>
                ) : (
                  <input type="number" step="any" value={tabData.achieved ?? ""} onChange={(e) => updatePrimaryField("achieved", e.target.value)} placeholder="Enter value" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent-400 focus:border-transparent" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Gap</label>
                  <div className={cn("px-3 py-2 border rounded-lg text-xs", isTabAutoPopulated ? "bg-accent-50 border-accent-200 text-gray-700 font-medium" : "bg-gray-50 border-gray-200 text-gray-500")}>{gap != null ? gap.toFixed(2) : "—"}</div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Achieved %</label>
                  <div className={cn("px-3 py-2 border rounded-lg text-xs", isTabAutoPopulated ? "bg-accent-50 border-accent-200 text-gray-700 font-medium" : "bg-gray-50 border-gray-200 text-gray-500")}>{achievedPct != null ? `${achievedPct}%` : "—"}</div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Comments</label>
                <textarea value={tabData.comment ?? ""} onChange={(e) => updatePrimaryField("comment", e.target.value)} placeholder="Enter comment" rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent-400 focus:border-transparent resize-none" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={() => setPrimaryOpen(false)}>Cancel</Button>
              <Button size="sm" loading={saving} onClick={handlePrimarySave}>Save Changes</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Secondary Panel (right slide-in, same as KPI LogModal) ── */}
      {secondaryOpen && (
        <div className="fixed inset-0 z-[200] flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSecondaryOpen(false)} />
          <div className="relative ml-auto h-full w-[520px] bg-white shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className="text-sm font-semibold text-gray-800">{horizon === "quarter" ? "Review Rocks" : horizon === "yearly" ? "Review Key Initiatives" : "Review Key Thrusts"}</h2>
              </div>
              <button onClick={() => setSecondaryOpen(false)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Company Quarterly Priority</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">{secondaryDesc || "—"}</div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Who</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">{secondaryOwner || "—"}</div>
              </div>
              <Select
                label="Status"
                value={secondaryStatus}
                onChange={(e) => setSecondaryStatus(e.target.value)}
                options={STATUS_SELECT_OPTIONS}
                placeholder="Select status"
              />
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Comments</label>
                <textarea value={secondaryComment} onChange={(e) => setSecondaryComment(e.target.value)} placeholder="Enter comment" rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent-400 focus:border-transparent resize-none" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={() => setSecondaryOpen(false)}>Cancel</Button>
              <Button size="sm" loading={saving} onClick={handleSecondarySave}>Save Changes</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
