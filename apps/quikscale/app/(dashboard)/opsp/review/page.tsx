"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  getFiscalYear,
  getFiscalQuarter,
  fiscalYearLabel,
  QUARTER_STARTS,
} from "@/lib/utils/fiscal";
import { achievedPctColor, formatReviewValue, showOpspReviewOwnerColumn } from "./helpers";
import { reviewRowVisible } from "./reviewRows";
import { ReviewPeriodPicker } from "./ReviewPeriodPicker";
import { CATEGORY_TYPE_LABELS, type CategoryType } from "@/lib/utils/breakdownCalc";
import { CriticalReviewSection } from "./CriticalReviewSection";

type TopTab = "review" | "critical";
import {
  TableSkeleton,
  EmptyState,
  Button,
  Select,
  DataTable,
  type DataTableColumn,
} from "@quikit/ui";
import { Clock, FileText, X, RotateCcw, AlertTriangle, History } from "lucide-react";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { resolveReviewAccess } from "./lib/reviewAccess";
import { AuditLogDrawer } from "@/components/logs/audit-log-drawer";
import { OPSPHistoryDrawer } from "../components/OPSPHistoryDrawer";
import { OPSP_FIELD_LABELS } from "@/lib/utils/auditLog";
import { useSession } from "next-auth/react";
import { useOpspAck } from "@/lib/hooks/useOpspAck";
import { editedRowIndices, editsSince, latestEdit, REVIEW_PRIMARY_ARRAY, type EditLogLike } from "@/lib/utils/opspEditHighlight";

/** Top-level OPSP fields whose post-finalize edits are relevant to the Review
 *  (same allow-list the Review history drawer uses). */
const REVIEW_EDIT_FIELDS = ["targetRows", "goalRows", "actionsQtr", "rocks", "keyInitiatives", "keyThrusts"];

/* ═══════════════════════════════════════════════
   Checkbox hook (shared for primary + secondary)
   ═══════════════════════════════════════════════ */

/**
 * Row-selection hook — returns a memoized object so consumers can include
 * the whole hook return value in `useMemo`/`useCallback` deps without
 * busting them on every render. Method refs are stable (useCallback with
 * empty deps + functional setState).
 */
function useRowSelection() {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback((allIdxs: number[]) => {
    setSelected((prev) =>
      prev.size === allIdxs.length ? new Set() : new Set(allIdxs),
    );
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo(
    () => ({ selected, toggle, toggleAll, clear }),
    [selected, toggle, toggleAll, clear],
  );
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
  /** Achieved value from the same period one year ago — null when no prior
   *  data was found AND no manual entry exists. */
  lastYearAchieved: number | null;
  /** Where `lastYearAchieved` came from. `"auto"` disables the drawer's
   *  Last-Year-Same-Period field; `"manual"` + `"none"` keep it editable. */
  lastYearSamePeriodSource: "auto" | "manual" | "none";
}

interface ReviewRow {
  rowIndex: number;
  category: string;
  /** Raw DB value: "Cumulative" | "CumulativeTillEnd" | "Standalone". */
  categoryType: string;
  /** Raw DB value: "Number" | "Currency" | "Percentage". Drives whether the
   *  Target/Achieved/Gap/LastYearSamePeriod cells get a currency prefix. */
  dataType: string;
  /** CategoryMaster.currency (e.g. "USD", "INR"). Null for non-Currency rows. */
  currency: string | null;
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
  /** Raw DB value: "Cumulative" | "CumulativeTillEnd" | "Standalone". */
  categoryType: string;
  /** Raw DB value: "Number" | "Currency" | "Percentage". */
  dataType: string;
  /** CategoryMaster.currency (e.g. "USD", "INR"). Null for non-Currency rows. */
  currency: string | null;
  periodKey: string;
  periodLabel: string;
  target: number | null;
  achieved: number | null;
  gap: number | null;
  achievedPct: number | null;
  comment: string | null;
  /** True for the footer row of each category group (Cumulative / Exit / Average). */
  isCumulative: boolean;
  isFirstInGroup: boolean;
  groupSize: number;
  autoPopulated?: boolean;
  /** Achieved value from the same period one year ago — null when no prior
   *  data was found AND no manual entry exists. */
  lastYearAchieved: number | null;
  /** Year-over-year growth as a percentage:
   *  ((achieved − lastYearAchieved) / lastYearAchieved) × 100.
   *  Null when achieved is null OR lastYearAchieved is null/0. */
  yearGrowth: number | null;
  /** Drives the drawer's disabled state for the Last Year Same Period field. */
  lastYearSamePeriodSource: "auto" | "manual" | "none";
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

/* ═══════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════ */

function getPeriodLabels(
  horizon: Horizon,
  _fiscalYearStart: number,
  quarter: string,
  year: number,
  targetYears: number,
): { key: string; label: string }[] {
  if (horizon === "quarter") {
    // Use the same April-based QUARTER_STARTS map the rest of quikscale uses,
    // so review months stay consistent with the OPSP create page and KPI/WWW.
    // (The DB tenant.fiscalYearStart is ignored here — it defaulted to 1 for
    // legacy rows and would otherwise show Jan/Feb/Mar for Q1.)
    const [startMonth] = QUARTER_STARTS[quarter] ?? [3, 1];
    return [
      { key: "m1", label: MONTH_NAMES[startMonth % 12] },
      { key: "m2", label: MONTH_NAMES[(startMonth + 1) % 12] },
      { key: "m3", label: MONTH_NAMES[(startMonth + 2) % 12] },
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

/** Friendly footer-row label per categoryType. */
function footerLabelFor(categoryType: string): string {
  if (categoryType === "CumulativeTillEnd") return "Exit Number";
  if (categoryType === "Standalone") return "Average";
  return "Cumulative";
}

/** Σ of all targets / achieveds. Used by plain Cumulative. */
function calculateCumulativeTotal(
  periods: { target: number | null; achieved: number | null }[],
): { target: number; achieved: number; hasAchieved: boolean } {
  const filled = periods.filter((p) => p.achieved != null);
  const sumT = periods.reduce((s, p) => s + (p.target ?? 0), 0);
  const sumA = filled.reduce((s, p) => s + (p.achieved ?? 0), 0);
  return { target: sumT, achieved: sumA, hasAchieved: filled.length > 0 };
}

/**
 * For `CumulativeTillEnd`, each per-period value is ALREADY a running
 * cumulative total — e.g. m1=3 / m2=6 / m3=9 means "by end of M3 we expect 9",
 * not "we expect 3+6+9 = 18". Summing would double-count, so the Exit value
 * is the last period's target and the latest filled achieved (falling back
 * to earlier periods if the final one hasn't been reported yet).
 */
function calculateCumulativeTillEndExit(
  periods: { target: number | null; achieved: number | null }[],
): { target: number; achieved: number; hasAchieved: boolean } {
  if (periods.length === 0) return { target: 0, achieved: 0, hasAchieved: false };
  const target = periods[periods.length - 1]?.target ?? 0;
  let achieved = 0;
  let hasAchieved = false;
  for (let i = periods.length - 1; i >= 0; i--) {
    if (periods[i].achieved != null) {
      achieved = periods[i].achieved!;
      hasAchieved = true;
      break;
    }
  }
  return { target, achieved, hasAchieved };
}

/** (Σ target) / N and (Σ achieved) / N — fixed denominator = period count. */
function calculateStandaloneAverage(
  periods: { target: number | null; achieved: number | null }[],
): { target: number; achieved: number; hasAchieved: boolean } {
  const filled = periods.filter((p) => p.achieved != null);
  const n = periods.length || 1;
  const sumT = periods.reduce((s, p) => s + (p.target ?? 0), 0);
  const sumA = filled.reduce((s, p) => s + (p.achieved ?? 0), 0);
  return { target: sumT / n, achieved: sumA / n, hasAchieved: filled.length > 0 };
}

/**
 * Aggregate a list of (target, achieved) pairs into a single value per the
 * row's categoryType. Mirrors the API helper of the same name so the client
 * computes the same footer locally.
 *
 *   Cumulative         → SUM
 *   CumulativeTillEnd  → LAST-FILLED (per-period values already running totals)
 *   Standalone         → AVERAGE (fixed denominator = period count)
 *
 * The chain Quarter → Yearly → 3-5yr applies the matching aggregation at
 * each step, so a Standalone category averages across months → quarters →
 * years, and a CumulativeTillEnd category takes the last-filled value at
 * each step (so the Q1 Exit is m3, the Yearly cell is the last filled
 * quarter, and the 3-5yr cell is the last filled year).
 */
function aggregateByType(
  categoryType: string,
  periods: { target: number | null; achieved: number | null }[],
): { target: number; achieved: number; hasAchieved: boolean } {
  if (categoryType === "Standalone") return calculateStandaloneAverage(periods);
  if (categoryType === "CumulativeTillEnd") return calculateCumulativeTillEndExit(periods);
  return calculateCumulativeTotal(periods);
}

/**
 * Build table rows from the per-category period data.
 *
 *   - Quarter horizon → one row per (category, period) + one footer row
 *     (Cumulative / Exit / Average) per category. 3 month rows + footer = 4
 *     rows per category. The footer is where the user sees the per-type
 *     aggregation (sum / last / average).
 *   - Yearly + 3-5yr horizons → just ONE row per category. The Q1..Q4 (or
 *     y1..yN) breakdown is hidden because Achieved on those views is purely
 *     derived from the lower horizon (Quarter → Yearly → 3-5yr cascade), so
 *     the period sub-rows added no editable info. Target / Achieved / Gap /
 *     Achieved % / Last Year / Year Growth use the same type-aware
 *     aggregation the footer would have used.
 */
function buildTableRows(
  rows: ReviewRow[],
  periodLabels: { key: string; label: string }[],
  horizon: Horizon,
): TableRow[] {
  const result: TableRow[] = [];
  const collapse = horizon === "yearly" || horizon === "3to5year";

  for (const row of rows) {
    if (!reviewRowVisible(row)) continue;

    // Build the (target, achieved) pairs in period order — both horizons use
    // them to compute the aggregate, the Quarter horizon also emits one
    // result row per pair.
    const periodPairs: { target: number | null; achieved: number | null }[] = [];
    if (!collapse) {
      const groupSize = periodLabels.length + 1;
      periodLabels.forEach((pl, idx) => {
        const pd = row.periods[pl.key] ?? {
          target: null,
          achieved: null,
          gap: null,
          achievedPct: null,
          comment: null,
          lastYearAchieved: null,
          lastYearSamePeriodSource: "none" as const,
        };
        const metrics = pd.autoPopulated && pd.gap != null && pd.achievedPct != null
          ? { gap: pd.gap, achievedPct: pd.achievedPct }
          : computeMetrics(pd.target, pd.achieved);
        periodPairs.push({ target: pd.target, achieved: pd.achieved });
        const lastYr = pd.lastYearAchieved;
        const growth = computeYearGrowth(pd.achieved, lastYr);
        result.push({
          rowIndex: row.rowIndex,
          category: row.category,
          categoryType: row.categoryType,
          dataType: row.dataType,
          currency: row.currency,
          periodKey: pl.key,
          periodLabel: pl.label,
          target: pd.target,
          achieved: pd.achieved,
          gap: metrics.gap,
          achievedPct: metrics.achievedPct,
          comment: pd.comment,
          isCumulative: false,
          isFirstInGroup: idx === 0,
          groupSize,
          autoPopulated: pd.autoPopulated,
          lastYearAchieved: lastYr,
          yearGrowth: growth,
          lastYearSamePeriodSource: pd.lastYearSamePeriodSource,
        });
      });
    } else {
      // Collapsed: still need the period pairs to compute the aggregate, just
      // don't emit them as visible rows.
      periodLabels.forEach((pl) => {
        const pd = row.periods[pl.key];
        periodPairs.push({ target: pd?.target ?? null, achieved: pd?.achieved ?? null });
      });
    }

    // Aggregate per categoryType — drives the (collapsed) single row in
    // Yearly/3-5yr, and the footer row in Quarter.
    const agg = aggregateByType(row.categoryType, periodPairs);
    const footerMetrics = computeMetrics(agg.target || null, agg.hasAchieved ? agg.achieved : null);
    const lastYearAggSrc = periodLabels.map((pl) => ({
      target: row.periods[pl.key]?.target ?? null,
      achieved: row.periods[pl.key]?.lastYearAchieved ?? null,
    }));
    const lastYearAgg = aggregateByType(row.categoryType, lastYearAggSrc);
    const aggLastYear = lastYearAgg.hasAchieved ? lastYearAgg.achieved : null;
    const aggGrowth = agg.hasAchieved
      ? computeYearGrowth(agg.achieved, aggLastYear)
      : null;
    const aggAutoPopulated = periodLabels.some((pl) => row.periods[pl.key]?.autoPopulated);

    result.push({
      rowIndex: row.rowIndex,
      category: row.category,
      categoryType: row.categoryType,
      dataType: row.dataType,
      currency: row.currency,
      periodKey: "cumulative",
      periodLabel: footerLabelFor(row.categoryType),
      target: agg.target || null,
      achieved: agg.hasAchieved ? agg.achieved : null,
      gap: footerMetrics.gap,
      achievedPct: footerMetrics.achievedPct,
      // On Yearly/3-5yr the collapsed row IS the first (and only) row, so it
      // must own the Category Name + Category Type cells. On Quarter the
      // footer sits below the period rows so those cells stay blank.
      isCumulative: true,
      comment: null,
      isFirstInGroup: collapse,
      groupSize: collapse ? 1 : periodLabels.length + 1,
      autoPopulated: aggAutoPopulated,
      lastYearAchieved: aggLastYear,
      yearGrowth: aggGrowth,
      // Footer aggregates don't have a single per-period source — the drawer
      // never opens against the footer row. "none" is a safe placeholder.
      lastYearSamePeriodSource: "none",
    });
  }
  return result;
}

/**
 * Year-over-year growth as a percentage.
 *
 *   growth% = ((achieved − lastYear) / lastYear) × 100
 *
 * Returns null when growth isn't computable:
 *   - `achieved` is null (nothing to compare)
 *   - `lastYear` is null OR 0 (no meaningful baseline — would divide by zero
 *     or imply an "infinite" growth that the UI can't render usefully)
 */
function computeYearGrowth(
  achieved: number | null,
  lastYear: number | null,
): number | null {
  if (achieved == null) return null;
  if (lastYear == null || lastYear === 0) return null;
  return ((achieved - lastYear) / lastYear) * 100;
}

/* ═══════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════ */

export default function OPSPReviewPage() {
  const { canUpdate: canUpdateReview } = useResourcePermissions("OPSP.Review");
  const { canUpdate: canUpdateCritical } = useResourcePermissions("OPSP.Review.Critical");
  // Permission-driven access: full (OPSP.Review/admin), critical-only (just
  // Critical Review), or none. Drives tab/scope visibility + the picker.
  const myPerms = useMyPermissions();
  const access = resolveReviewAccess({
    isAdmin: myPerms.isAdmin,
    hasReview: myPerms.has("OPSP.Review", "view"),
    hasCritical: myPerms.has("OPSP.Review.Critical", "view"),
    canEditUser: myPerms.has("OPSP.EditUser", "update"),
  });
  const accessReady = !myPerms.loading;
  const [year, setYear] = useState(getFiscalYear);
  const [quarter, setQuarter] = useState<string>(getFiscalQuarter);
  const [horizon, setHorizon] = useState<Horizon>("quarter");
  const [viewMode, setViewMode] = useState<ViewMode>("primary");
  // Top-level Review / Critical Review tab.
  const [topTab, setTopTab] = useState<TopTab>("review");
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  // Audit-log drawer context. `kind` discriminates which entity/scope we're
  // viewing so the drawer can build the right title + reason filter:
  //   - "primary":   OPSP Review primary rows (horizon|rowIndex=…)
  //   - "secondary": OPSP Review secondary rows
  //   - "critical":  OPSP Critical # Review rows (module:cardType)
  type LogsContext =
    | { kind: "primary"; rowIndex: number; horizon: Horizon; category: string }
    | { kind: "secondary"; rowIndex: number; horizon: Horizon; category: string }
    | { kind: "critical"; moduleKey: string; cardType: string; category: string };
  const [logsContext, setLogsContext] = useState<LogsContext | null>(null);

  // Row selection
  const primarySel = useRowSelection();
  const secondarySel = useRowSelection();

  // OPSP edit-after-finalize history (read-only) — same drawer as the editor.
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);

  /* ── Post-finalize "what changed" highlight ──
     Fetch the edit-log, highlight the Review rows whose source field changed
     after finalize, and let the reviewer acknowledge via the History drawer
     footer. Scoped (per user/device) separately from the OPSP Form. */
  const { data: sessionData } = useSession();
  const reviewUserId = (sessionData?.user as { id?: string } | undefined)?.id ?? "anon";
  const [editLog, setEditLog] = useState<EditLogLike[]>([]);
  // `no-store`: the edit-log is live — never serve a stale cached copy, or a
  // second round of post-finalize edits won't re-surface the highlight.
  const loadEditLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/opsp/edit-log?year=${year}&quarter=${quarter}`, { cache: "no-store" });
      const j = await res.json();
      if (j?.success) setEditLog(j.data as EditLogLike[]);
    } catch {
      /* transient — keep the previous list */
    }
  }, [year, quarter]);
  // Refresh on mount, period change, and drawer open/close (drawer edits add entries).
  useEffect(() => { void loadEditLog(); }, [loadEditLog, editHistoryOpen]);
  // Only Review-relevant fields drive the highlight/ack (matches the drawer's allow-list).
  const reviewEditLog = useMemo(
    () => editLog.filter((e) => REVIEW_EDIT_FIELDS.includes(e.field.split(".")[0])),
    [editLog],
  );
  // Acknowledgement tracks the latest of ALL edits (so any new edit re-surfaces),
  // but the highlight + banner are scoped to edits made SINCE the last ack — so a
  // new round only lights up the categories changed in that round, not every
  // category ever touched after finalize.
  const latestAll = useMemo(() => latestEdit(reviewEditLog), [reviewEditLog]);
  const { unacknowledged: changesUnacked, acknowledge: ackChanges, ackedTs } = useOpspAck(
    reviewUserId, year, quarter, "review", latestAll?.ts ?? 0,
  );
  const newEditLog = useMemo(() => editsSince(reviewEditLog, ackedTs), [reviewEditLog, ackedTs]);
  const latestChange = useMemo(() => latestEdit(newEditLog), [newEditLog]);
  // Primary rows map directly to source-array indices (rowIndex = source index).
  // Secondary rows are re-indexed after filtering empties, so we don't highlight
  // them here — those edits still surface in the History drawer.
  const editedPrimarySet = useMemo(
    () => editedRowIndices(newEditLog, REVIEW_PRIMARY_ARRAY[horizon] ?? ""),
    [newEditLog, horizon],
  );
  const showRowHighlight = changesUnacked && newEditLog.length > 0;

  // Primary modal
  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [primaryIdx, setPrimaryIdx] = useState(0);
  const [primaryCategory, setPrimaryCategory] = useState("");
  const [primaryEdits, setPrimaryEdits] = useState<Record<string, { target: number | null; achieved: number | null; lastYearSamePeriod: number | null; comment: string }>>({});
  const [primaryActiveTab, setPrimaryActiveTab] = useState("");

  // Secondary modal
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [secondaryIdx, setSecondaryIdx] = useState(0);
  const [secondaryDesc, setSecondaryDesc] = useState("");
  const [secondaryStatus, setSecondaryStatus] = useState("");
  const [secondaryComment, setSecondaryComment] = useState("");

  // Secondary local edits
  const [secondaryEdits, setSecondaryEdits] = useState<Record<number, { status: string; comment: string }>>({});

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

  // Only fetch primary/secondary review data while on the Review tab.
  // The Critical Review tab owns its own fetch in <CriticalReviewSection>.
  useEffect(() => { if (topTab === "review") loadData(); }, [loadData, topTab]);
  useEffect(() => { setSecondaryEdits({}); }, [data, horizon]);

  // Re-fetch when tab regains focus (e.g. user finalized or made more edits on
  // another page/tab). Refresh BOTH the review values AND the edit-log so a new
  // round of post-finalize edits re-surfaces the row highlight here.
  useEffect(() => {
    function onFocus() { if (topTab === "review") { loadData(); void loadEditLog(); } }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadData, loadEditLog, topTab]);

  /* ── Derived data ── */
  const periodLabels = useMemo(() => {
    if (!data) return [];
    return getPeriodLabels(horizon, data.fiscalYearStart, data.quarter, data.year, data.targetYears ?? 5);
  }, [data, horizon]);

  const tableRows = useMemo(() => {
    if (!data?.rows) return [];
    return buildTableRows(data.rows, periodLabels, horizon);
  }, [data, periodLabels, horizon]);

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
    ? (data?.rows?.filter(reviewRowVisible).length ?? 0)
    : secondaryTableRows.length;

  const labels = HORIZON_LABELS[horizon];
  const isFinalized = data?.opspStatus === "finalized";
  const isReviewed = data?.opspStatus === "reviewed";
  // "Committed" = OPSP is locked and reviewable. A "reviewed" OPSP is a
  // STRONGER lock than "finalized" (it implies the review was submitted),
  // so the table must still render when status is "reviewed" — otherwise
  // clicking Submit would flip the OPSP into a state where the page wrongly
  // shows the "OPSP Not Finalized" warning.
  const isCommitted = isFinalized || isReviewed;
  const hasOPSP = !!data?.opspId;

  /* ── Submit gate (Quarter horizon only) ──
     Enable when every Action row has an achieved value across every period,
     and every Rocks row has a status filled. The achieved/status edits live
     in primaryEdits/secondaryEdits — fall back to data on first load. */
  const allActionsAchieved = useMemo(() => {
    if (horizon !== "quarter") return false;
    if (!data?.rows?.length) return false;
    for (const row of data.rows) {
      if (!row.category.trim()) continue;
      for (const pl of periodLabels) {
        const pd = row.periods[pl.key];
        if (!pd || pd.achieved == null) return false;
      }
    }
    return true;
  }, [data, horizon, periodLabels]);

  const allRocksStatusFilled = useMemo(() => {
    if (horizon !== "quarter") return false;
    if (!secondaryTableRows.length) return false;
    return secondaryTableRows.every((r) => r.status && r.status.trim() !== "");
  }, [secondaryTableRows, horizon]);

  const canSubmit = canUpdateReview && horizon === "quarter" && isFinalized && !isReviewed && allActionsAchieved && allRocksStatusFilled;
  const [submittingReview, setSubmittingReview] = useState(false);

  const handleSubmitReview = useCallback(async () => {
    if (!canSubmit || submittingReview) return;
    setSubmittingReview(true);
    try {
      const r = await fetch("/api/opsp/review/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, quarter }),
      });
      const j = await r.json();
      if (j.success) {
        setData((prev) => (prev ? { ...prev, opspStatus: "reviewed" } : prev));
        window.dispatchEvent(new Event("opsp-review-submitted"));
      }
    } finally {
      setSubmittingReview(false);
    }
  }, [canSubmit, submittingReview, year, quarter]);

  const tableTitle = viewMode === "primary"
    ? `${labels.primaryTitle} – ${quarter} - ${year}`
    : `${labels.secondaryTitle} – ${quarter} - ${year}`;

  /* ── Open primary modal ── wrapped in useCallback so the columns useMemo
     below can include it in deps without re-creating columns every render. */
  const openPrimaryModal = useCallback((rowIndex: number) => {
    const row = data?.rows.find((r) => r.rowIndex === rowIndex);
    if (!row) return;
    const edits: typeof primaryEdits = {};
    for (const pl of periodLabels) {
      const pd = row.periods[pl.key];
      // For "auto" source the lastYearAchieved comes from the prior-year
      // entry and isn't editable — we leave the local state at null so the
      // payload never tries to overwrite it. For "manual" we pre-fill the
      // existing entry; for "none" we start empty so the user can enter one.
      const initialLyp =
        pd?.lastYearSamePeriodSource === "manual" ? (pd.lastYearAchieved ?? null) : null;
      edits[pl.key] = {
        target: pd?.target ?? null,
        achieved: pd?.achieved ?? null,
        lastYearSamePeriod: initialLyp,
        comment: pd?.comment ?? "",
      };
    }
    setPrimaryIdx(rowIndex);
    setPrimaryCategory(row.category);
    setPrimaryEdits(edits);
    setPrimaryActiveTab(periodLabels[0]?.key ?? "");
    setPrimaryOpen(true);
  // setPrimaryX setters are stable (useState); only data + periodLabels are reactive.
  }, [data, periodLabels]);

  /** Check if a period tab's achieved value is auto-populated from child horizon */
  const isTabAutoPopulated = useMemo(() => {
    if (!data?.rows) return false;
    const row = data.rows.find((r) => r.rowIndex === primaryIdx);
    if (!row) return false;
    return row.periods[primaryActiveTab]?.autoPopulated === true;
  }, [data, primaryIdx, primaryActiveTab]);

  /* ── Open secondary modal ── same useCallback rationale as primary. */
  const openSecondaryModal = useCallback((index: number) => {
    const row = secondaryTableRows[index];
    if (!row) return;
    setSecondaryIdx(index);
    setSecondaryDesc(row.desc);
    setSecondaryStatus(row.status);
    setSecondaryComment(row.comment);
    setSecondaryOpen(true);
  }, [secondaryTableRows]);

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
        .map(([period, vals]) => {
          // Only persist `lastYearSamePeriod` when the source isn't "auto"
          // — auto means the value comes from the prior-year entry and the
          // drawer disables the input. Sending it would shadow the auto
          // value if the source disappeared later.
          const source = row?.periods[period]?.lastYearSamePeriodSource ?? "none";
          const includeLyp = source !== "auto";
          return {
            period,
            targetValue: vals.target,
            achievedValue: vals.achieved,
            ...(includeLyp ? { lastYearSamePeriod: vals.lastYearSamePeriod } : {}),
            comment: vals.comment || null,
          };
        });
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

  /* ── Primary modal field update ──
     For numeric fields (`achieved`, `lastYearSamePeriod`) preserve the
     distinction between "" → null (cleared) and "0" → 0 (explicit zero).
     The earlier `parseFloat(v) || 0` collapsed 0 to 0 *and* swallowed NaN
     to 0 — fine, but it also meant invalid input silently became 0.
     Switching to a `Number()` + finite check makes the 0/null intent clear. */
  function updatePrimaryField(
    field: "achieved" | "lastYearSamePeriod" | "comment",
    value: string,
  ) {
    setPrimaryEdits((prev) => ({
      ...prev,
      [primaryActiveTab]: {
        ...prev[primaryActiveTab],
        [field]:
          field === "comment"
            ? value
            : value === ""
              ? null
              : Number.isFinite(Number(value))
                ? Number(value)
                : prev[primaryActiveTab]?.[field] ?? null,
      },
    }));
  }

  const tabData = primaryEdits[primaryActiveTab] ?? {
    target: null,
    achieved: null,
    lastYearSamePeriod: null,
    comment: "",
  };
  const { gap, achievedPct } = computeMetrics(tabData.target, tabData.achieved);
  // Drawer's numeric cells need the row's dataType / currency so currency
  // categories show "$1,000,000" instead of bare "1000000".
  const primaryRow = data?.rows.find((r) => r.rowIndex === primaryIdx);
  const primaryDataType = primaryRow?.dataType;
  const primaryCurrency = primaryRow?.currency ?? null;

  /* ── Column definitions ── */

  // Unique category indices for primary checkbox "select all"
  const primaryCategoryIdxs = useMemo(
    () => [...new Set(filteredRows.map((r) => r.rowIndex))],
    [filteredRows],
  );

  const primaryColumns: DataTableColumn<TableRow>[] = useMemo(() => {
    const cols: DataTableColumn<TableRow>[] = [
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
          <button
            onClick={() =>
              setLogsContext({
                kind: "primary",
                rowIndex: row.rowIndex,
                horizon,
                category: row.category,
              })
            }
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
            title="View audit history"
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
        ) : null,
    },
    {
      key: "_id",
      label: "#",
      width: 44,
      align: "center",
      render: (row) => {
        if (!row.isFirstInGroup) return null;
        // Read-only as plain text when: Yearly/3-5yr (Achieved is derived from
        // the lower horizon) OR the user lacks OPSP.Review:update. Only an
        // update-holder editing the Quarter source gets the edit button.
        if (horizon !== "quarter" || !canUpdateReview) {
          return <span className="text-gray-700 font-medium">{row.rowIndex + 1}</span>;
        }
        return (
          <button
            onClick={() => openPrimaryModal(row.rowIndex)}
            className="text-gray-900 hover:underline font-medium"
          >
            {row.rowIndex + 1}
          </button>
        );
      },
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
      key: "categoryType",
      label: "Category Type",
      width: 130,
      thClassName: "whitespace-nowrap",
      // Render the friendly label ("Cumulative Till Exit") instead of the raw
      // DB key ("CumulativeTillEnd"). Falls back to the raw value if a future
      // categoryType is added without a label entry.
      render: (row) =>
        row.isFirstInGroup ? (
          <span className="font-medium text-gray-800 truncate block">
            {CATEGORY_TYPE_LABELS[row.categoryType as CategoryType] ?? row.categoryType}
          </span>
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
      label: "Target",
      width: 100,
      align: "right",
      render: (row) => (
        <span className="text-gray-700">{formatReviewValue(row.target, row.dataType, row.currency)}</span>
      ),
    },
    {
      key: "achieved",
      label: "Achieved",
      width: 100,
      align: "right",
      render: (row) => (
        <span className="text-gray-700">{formatReviewValue(row.achieved, row.dataType, row.currency)}</span>
      ),
    },
    {
      key: "gap",
      label: "Gap",
      width: 90,
      align: "right",
      render: (row) => (
        <span className="text-gray-700">{formatReviewValue(row.gap, row.dataType, row.currency)}</span>
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
      width: 220,
      render: (row) => (
        // Two visible lines max; if the comment is longer, the cell scrolls
        // vertically instead of expanding the row or being cut off.
        <div
          className="text-gray-500 whitespace-normal break-words leading-snug max-h-[2.5em] overflow-y-auto pr-1"
          title={row.comment || undefined}
        >
          {row.comment || "—"}
        </div>
      ),
    },
    {
      key: "lastYearAchieved",
      label: "Last Year Same Period",
      width: 140,
      align: "right",
      thClassName: "whitespace-nowrap",
      render: (row) => (
        <span className={cn("text-gray-700", row.lastYearAchieved == null && "text-gray-400")}>
          {formatReviewValue(row.lastYearAchieved, row.dataType, row.currency)}
        </span>
      ),
    },
    {
      key: "yearGrowth",
      label: "Year Growth",
      width: 110,
      align: "right",
      thClassName: "whitespace-nowrap",
      render: (row) => {
        if (row.yearGrowth == null) return <span className="text-gray-400">—</span>;
        const g = row.yearGrowth;
        const sign = g > 0 ? "+" : g < 0 ? "−" : "";
        const cls = g > 0 ? "text-green-600" : g < 0 ? "text-red-600" : "text-gray-500";
        // Round to 1 decimal place — keeps the cell narrow and readable.
        const display = `${sign}${Math.abs(g).toFixed(1)}%`;
        return <span className={cn("font-medium", cls)}>{display}</span>;
      },
    },
    ];
    // Hide the Period column on Yearly / 3-5yr — each category has only one
    // row in those views, so the column adds no info (and the categoryType
    // label "Cumulative / Exit / Average" already lives in the Cat Type column).
    return horizon === "quarter" ? cols : cols.filter((c) => c.key !== "period");
  }, [primarySel, primaryCategoryIdxs, horizon, openPrimaryModal, canUpdateReview]);

  const secondaryIdxs = useMemo(
    () => filteredSecondary.map((r) => r.index),
    [filteredSecondary],
  );

  const secondaryColumns: DataTableColumn<SecondaryTableRow>[] = useMemo(() => {
    const cols: DataTableColumn<SecondaryTableRow>[] = [
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
        <button
          onClick={() =>
            setLogsContext({
              kind: "secondary",
              rowIndex: row.index,
              horizon,
              category: row.desc,
            })
          }
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
          title="View audit history"
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
      ),
    },
    {
      key: "_id",
      label: "#",
      width: 44,
      align: "center",
      render: (row) =>
        canUpdateReview ? (
          <button
            onClick={() => openSecondaryModal(row.index)}
            className="text-gray-900 hover:underline font-medium"
          >
            {row.index + 1}
          </button>
        ) : (
          <span className="text-gray-700 font-medium">{row.index + 1}</span>
        ),
    },
    {
      // Owner ("Who") — resolved server-side into `ownerName`. Hidden for the
      // 3–5yr (Key Thrusts) horizon by the filter below, matching the Create page.
      key: "who",
      label: "Who",
      width: 160,
      align: "left",
      render: (row) => (
        <span className={cn("truncate block text-gray-700", !row.ownerName && "text-gray-400")}>
          {row.ownerName || "—"}
        </span>
      ),
    },
    {
      key: "desc",
      label: "Description",
      width: 280,
      align: "left",
      render: (row) => (
        <span className="text-gray-800 truncate block">{row.desc}</span>
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
      width: 220,
      render: (row) => (
        // Two visible lines max; if the comment is longer, the cell scrolls
        // vertically instead of expanding the row or being cut off.
        <div
          className="text-gray-500 whitespace-normal break-words leading-snug max-h-[2.5em] overflow-y-auto pr-1"
          title={row.comment || undefined}
        >
          {row.comment || "—"}
        </div>
      ),
    },
    ];
    // 3-5yr (Key Thrusts) — owner column intentionally hidden per spec; the
    // capability rows on this horizon don't carry per-row ownership.
    return showOpspReviewOwnerColumn(horizon) ? cols : cols.filter((c) => c.key !== "who");
  }, [secondarySel, secondaryIdxs, horizon, openSecondaryModal, canUpdateReview]);

  /* ═══════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════ */

  const selfName = (sessionData?.user as { name?: string } | undefined)?.name ?? "Me";

  // ── Critical-Review-only audience (e.g. a default member): a focused page
  //    showing only their own Individual Critical # & Balanced Critical #.
  //    No Review tab, no Year/Quarter scopes, no user-picker. ──
  if (accessReady && access.mode === "critical-only") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">Critical Review</h1>
          <ReviewPeriodPicker
            year={year}
            quarter={quarter}
            onChange={(y, q) => { setYear(y); setQuarter(q); }}
          />
        </div>
        <div className="flex-1 overflow-hidden min-h-0">
          <CriticalReviewSection
            year={year}
            quarter={quarter}
            allowedModules={["people"]}
            canPickUser={false}
            canEdit={canUpdateCritical}
            selfId={reviewUserId}
            selfName={selfName}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Page Header (matches Priority/WWW/KPI) ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">OPSP Review</h1>
          {!loading && hasOPSP && isCommitted && topTab === "review" && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Primary/Secondary toggle + Submit + Search are Review-tab-only. */}
          {topTab === "review" && (<>
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

          {/* Submit — gated on RBAC `update`, all Achieved + all Rock statuses filled (quarter horizon).
              Hidden entirely when the role doesn't grant update. */}
          {canUpdateReview && (
            <Button
              size="sm"
              disabled={!canSubmit || submittingReview}
              onClick={handleSubmitReview}
              className={!canSubmit && !isReviewed ? "opacity-50 cursor-not-allowed" : ""}
              title={
                isReviewed
                  ? "Review already submitted"
                  : horizon !== "quarter"
                    ? "Submit available on Quarter view"
                    : !isFinalized
                      ? "Finalize the OPSP first"
                      : !allActionsAchieved
                        ? "Fill every Achieved value in Actions"
                        : !allRocksStatusFilled
                          ? "Set status on every Rock"
                          : "Submit review"
              }
            >
              {isReviewed ? "Submitted" : submittingReview ? "Submitting…" : "Submit"}
            </Button>
          )}

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
          </>)}

          {/* OPSP edit history — opens the same drawer as the editor, scoped to
              the selected period (read-only here). */}
          <button
            onClick={() => setEditHistoryOpen(true)}
            className="flex items-center justify-center p-1.5 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50"
            title="OPSP edit history"
          >
            <History className="h-4 w-4" />
          </button>

          {/* Year / Quarter picker — shared component (also used in the
              critical-only mode above). */}
          <ReviewPeriodPicker
            year={year}
            quarter={quarter}
            onChange={(y, q) => { setYear(y); setQuarter(q); }}
          />
        </div>
      </div>

      {/* ── Top-level tab strip: Review / Critical Review ── */}
      <div className="px-6 pt-3 pb-2 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex gap-2">
          {([
            { key: "review",   label: "Review" },
            { key: "critical", label: "Critical # Review" },
          ] as { key: TopTab; label: string }[])
            .filter((tab) => (tab.key === "critical" ? access.showCriticalTab : access.showReviewTab))
            .map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTopTab(tab.key)}
              className={cn(
                "px-4 py-1.5 text-xs font-semibold rounded-md transition-colors",
                topTab === tab.key
                  ? "bg-accent-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Horizon Pills — Review tab only ── */}
      {topTab === "review" && (
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
      )}

      {/* ── Critical Review branch — completely independent of the
            Review tab's content area. Owns its own data fetch + sub-tabs. ── */}
      {topTab === "critical" && (
        <div className="flex-1 overflow-hidden min-h-0">
          <CriticalReviewSection
            year={year}
            quarter={quarter}
            allowedModules={access.allowedCriticalModules}
            canPickUser={access.canPickUser}
            canEdit={canUpdateCritical}
            selfId={reviewUserId}
            selfName={selfName}
          />
        </div>
      )}

      {/* ── Content Area (Review tab only) — `min-h-0` so flex-1 shrinks to viewport
          and inner scroller gets bounded height (required for vertical scroll). ── */}
      {topTab === "review" && (
      <div className="flex-1 overflow-hidden min-h-0">
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
        ) : !isCommitted ? (
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

            {/* Post-finalize change notice — shown until the reviewer acknowledges
                via the History drawer footer. Highlighted rows changed after finalize. */}
            {showRowHighlight && (
              <div className="px-6 py-2 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between gap-2">
                <span className="text-xs text-amber-700">
                  Highlighted rows were edited after finalize
                  {latestChange?.actorName ? ` by ${latestChange.actorName}` : ""} — open History to review.
                </span>
                <button
                  onClick={() => setEditHistoryOpen(true)}
                  className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800"
                >
                  <History className="h-3.5 w-3.5" /> History
                </button>
              </div>
            )}

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
                  rowClassName={(row) => {
                    if (showRowHighlight && editedPrimarySet.has(row.rowIndex)) return "bg-amber-50";
                    return row.isCumulative ? "bg-gray-50/70" : "";
                  }}
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
      )}

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
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Target</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">{formatReviewValue(tabData.target, primaryDataType, primaryCurrency)}</div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Achieved{isTabAutoPopulated && <span className="ml-1 text-accent-500 normal-case font-normal">(auto-populated from quarterly review)</span>}
                </label>
                {isTabAutoPopulated ? (
                  <div className="px-3 py-2 bg-accent-50 border border-accent-200 rounded-lg text-xs text-gray-700 font-medium">{formatReviewValue(tabData.achieved, primaryDataType, primaryCurrency)}</div>
                ) : (
                  <input type="number" step="any" value={tabData.achieved ?? ""} onChange={(e) => updatePrimaryField("achieved", e.target.value)} placeholder="Enter value" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent-400 focus:border-transparent" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Gap</label>
                  <div className={cn("px-3 py-2 border rounded-lg text-xs", isTabAutoPopulated ? "bg-accent-50 border-accent-200 text-gray-700 font-medium" : "bg-gray-50 border-gray-200 text-gray-500")}>{formatReviewValue(gap, primaryDataType, primaryCurrency)}</div>
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
              {/* Last Year Same Period — disabled when the prior-year OPSP
                  Review supplies the value (source = "auto"). Otherwise the
                  user can enter / clear it manually and the value persists on
                  OPSPReviewEntry.lastYearSamePeriod. */}
              {(() => {
                const row = data?.rows.find((r) => r.rowIndex === primaryIdx);
                const periodData = row?.periods[primaryActiveTab];
                const source = periodData?.lastYearSamePeriodSource ?? "none";
                const isAuto = source === "auto";
                const autoValue = isAuto ? periodData?.lastYearAchieved ?? null : null;
                const displayValue = isAuto
                  ? (autoValue != null ? autoValue : "")
                  : (tabData.lastYearSamePeriod ?? "");
                return (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      Last Year Same Period
                      {isAuto && (
                        <span className="ml-1 text-accent-500 normal-case font-normal">
                          (auto-filled from prior-year review)
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={displayValue}
                      onChange={(e) => updatePrimaryField("lastYearSamePeriod", e.target.value)}
                      placeholder={isAuto ? "—" : "Enter value"}
                      disabled={isAuto}
                      className={cn(
                        "w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent-400 focus:border-transparent",
                        isAuto
                          ? "bg-accent-50 border-accent-200 text-gray-700 font-medium cursor-not-allowed"
                          : "border-gray-200",
                      )}
                    />
                  </div>
                );
              })()}
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

      {/* Global audit-log drawer — shared by Primary, Secondary, and
          Critical # Review rows. The reason filter (`extra`) matches the
          structured tag in the AuditLog.reason field written by the OPSP
          POST endpoints (see opsp/review/*.ts). */}
      {data?.opspId && logsContext && (() => {
        let title = "Audit History";
        let subtitle = "";
        let extra = "";
        if (logsContext.kind === "primary") {
          title = `Audit History — Row ${logsContext.rowIndex + 1}`;
          subtitle = `${logsContext.category} · ${HORIZON_LABELS[logsContext.horizon].primaryTitle}`;
          extra = `(${logsContext.horizon}|rowIndex=${logsContext.rowIndex})`;
        } else if (logsContext.kind === "secondary") {
          title = `Audit History — Row ${logsContext.rowIndex + 1}`;
          subtitle = `${logsContext.category} · ${HORIZON_LABELS[logsContext.horizon].secondaryTitle}`;
          extra = `OPSP Secondary (${logsContext.horizon}|rowIndex=${logsContext.rowIndex})`;
        } else {
          title = `Audit History — ${logsContext.cardType}`;
          subtitle = `${logsContext.category} · ${logsContext.moduleKey}`;
          extra = `OPSP Critical (${logsContext.moduleKey}:${logsContext.cardType})`;
        }
        return (
          <AuditLogDrawer
            open
            onClose={() => setLogsContext(null)}
            title={title}
            subtitle={subtitle}
            entityType="Review"
            entityId={data.opspId}
            extraQuery={extra}
            fieldLabels={OPSP_FIELD_LABELS}
          />
        );
      })()}

      {/* OPSP edit-after-finalize history (read-only), scoped to the fields that
          appear in OPSP Review (Targets/Goals/Actions + Rocks/Key Initiatives/
          Key Thrusts) — People/Objectives/etc. edits are hidden here. */}
      <OPSPHistoryDrawer
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        year={year}
        quarter={quarter}
        fields={REVIEW_EDIT_FIELDS}
        ackFooter={
          reviewEditLog.length > 0
            ? { acknowledged: !changesUnacked, onAcknowledge: ackChanges, actorName: latestChange?.actorName }
            : undefined
        }
      />
    </div>
  );
}
