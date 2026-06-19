"use client";

/**
 * OPSP expand-row modals — extracted from `page.tsx` in R6.
 *
 * These modals let the user edit rows that don't fit inline in the main
 * OPSP grid (Targets = 3-5 year projections, Goals = quarterly plan,
 * Rocks = quarterly priorities). Each modal owns no state of its own —
 * they are controlled components driven by parent form state.
 *
 * Exports:
 *   - `TargetsModal`  — 5-year targets with fiscal-year column labels
 *   - `GoalsModal`    — 1-year goals broken down Q1-Q4
 *   - `ActionsModal`  — quarterly actions broken down Month 1-3
 *   - `RocksModal`    — 5-row quarterly priorities with owner picker
 *   - `KeyThrustsModal`     — 3-5 yr key thrusts/capabilities with owner
 *   - `KeyInitiativesModal` — 1 yr key initiatives with owner
 *   - `AccountabilityModal` — KPI accountability + quarterly priorities
 */

import { useEffect, useState } from "react";
import { X, AlertTriangle, Lock, Check, Calendar } from "lucide-react";
import { FInput } from "./RichEditor";
import { CategorySelect, ProjectedInput, parseProjectedValue, combineProjectedValue, getScaleAbbrs, displayCategory, catMetaCache, sanitizeNumericInput } from "./category";
import { OwnerSelect, WithTooltip } from "./pickers";
import { getScales } from "@/lib/utils/currency";
import {
  calculateBreakdown,
  type BreakdownType,
  CATEGORY_TYPE_LABELS,
  type CategoryType,
} from "@/lib/utils/breakdownCalc";
import type { TargetRow, GoalRow, RockRow, ActionRow, ThrustRow, KeyInitiativeRow, KPIAcctRow, QPriorRow } from "../types";

/* ── Scale abbreviation → full label (for multiplier lookup) ── */
const ABBR_TO_LABEL: Record<string, string> = {
  "-": "", K: "Thousand", M: "Million", B: "Billion",
  L: "Lakh", Cr: "Crore",
};

/**
 * Resolve the actual numeric value of a projected field.
 * e.g. "1 L" with INR category → 1 × 100000 = 100000
 * e.g. "5000" with Number category → 5000
 */
export function resolveProjected(categoryName: string, projected: string): number | null {
  const trimmed = (projected ?? "").trim();
  if (!trimmed) return null;

  const meta = catMetaCache.get(categoryName);
  const isCurrency = meta?.dataType === "Currency";
  const currency = meta?.currency ?? "USD";

  if (isCurrency) {
    const { num, scale } = parseProjectedValue(projected, currency);
    const n = parseFloat(num);
    if (isNaN(n)) return null;
    const fullLabel = ABBR_TO_LABEL[scale] ?? scale ?? "";
    const multiplier = getScales(currency).find(s => s.label === fullLabel)?.multiplier ?? 1;
    return n * multiplier;
  }

  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

/**
 * The annual Goal (1 YR) Projected that caps a given ACTIONS (QTR) row's
 * Projected. Matches the Goal by category name — the same name-based lookup
 * the ActionsModal validator uses, so the cap applies regardless of whether
 * the Action and Goal rows sit at the same index. Returns null (no cap) when
 * there's no matching Goal or it has no projected value yet.
 */
export function goalProjectedCap(
  categoryName: string,
  goalRows: GoalRow[],
): number | null {
  if (!categoryName.trim()) return null;
  const goal = goalRows.find(
    (g) => g.category.trim() && g.category === categoryName,
  );
  if (!goal) return null;
  return resolveProjected(goal.category, goal.projected);
}

/**
 * True when `val` (a typed Projected string for `categoryName`) resolves above
 * the annual Goal cap. The shared hard-block predicate for over-goal entry:
 * both the ACTIONS (QTR) modal and the inline ActionsSection reject an edit
 * outright when this returns true, so an over-goal value never enters form
 * state (and therefore never autosaves). Mirrors the `+ 0.01` epsilon the
 * ActionsModal `exceedsGoal` validator uses.
 */
export function exceedsGoalProjected(
  categoryName: string,
  val: string,
  goalRows: GoalRow[],
): boolean {
  const cap = goalProjectedCap(categoryName, goalRows);
  if (cap == null || cap <= 0) return false;
  const resolved = resolveProjected(categoryName, val);
  return resolved != null && resolved > cap + 0.01;
}

/** Format a number with commas for display. */
function fmtNum(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * Bridge the DB-stored `categoryType` (post-rename) to the legacy enum used
 * by `calculateBreakdown`. The helper kept `CumulativeTillExit` to avoid a
 * cascade rename — this is the only allowed conversion site.
 */
export function categoryTypeToBreakdown(categoryType: string | undefined): BreakdownType {
  switch (categoryType) {
    case "CumulativeTillEnd":
      return "CumulativeTillExit";
    case "Standalone":
      return "Standalone";
    case "Cumulative":
    default:
      return "Cumulative";
  }
}

/**
 * Distribute a Projected value across `periodCount` period cells.
 *
 * Default behaviour gates on `breakdownType === "Automatic"`; Manual rows
 * return `null` so the caller (the now-retired modals) writes only the cell
 * the user touched. Pass `{ force: true }` from the main-page Projected
 * inputs and the Targets→Goals→Actions cascade: there's no manual-entry UI
 * for the period cells anymore, so leaving them empty would break
 * finalization for any Manual+Cumulative / Manual+CumulativeTillEnd row.
 *
 * Operates on the displayed (typed-as) numeric value, not the resolved
 * underlying numeric. Currency rows keep their scale suffix.
 *
 * Returns:
 *   - `null`                — when projected is empty / unparseable, or when
 *                             breakdownType is Manual and `force` is false
 *   - `string[]` of length `periodCount` — one value per cell, formatted to
 *                             match the category's display shape
 */
export function breakdownProjected(
  categoryName: string,
  projected: string,
  periodCount: number,
  options?: { force?: boolean },
): string[] | null {
  const trimmed = (projected ?? "").trim();
  if (!trimmed) return null;

  const meta = catMetaCache.get(categoryName);
  if (!meta) return null;

  // Manual rows opt out of auto-fill unless caller forces it.
  // Exception: Standalone categories ALWAYS auto-fill regardless of stored
  // breakdownType — their period cells are dropdowns keyed off Projected
  // (see StandaloneSelect), so a "Manual" breakdownType still needs slices.
  const treatAsAutomatic =
    meta.breakdownType === "Automatic" || meta.categoryType === "Standalone";
  if (!options?.force && !treatAsAutomatic) return null;

  const bridgeType = categoryTypeToBreakdown(meta.categoryType);

  const isCurrency = meta.dataType === "Currency";
  const currency = meta.currency ?? "USD";

  let displayedNum: number;
  let scale = "";
  if (isCurrency) {
    const parsed = parseProjectedValue(projected, currency);
    displayedNum = parseFloat(parsed.num);
    scale = parsed.scale ?? "";
  } else {
    displayedNum = parseFloat(trimmed);
  }
  if (!Number.isFinite(displayedNum) || displayedNum <= 0) return null;

  // For Number we keep integer math; Percentage and Currency use 2-decimal.
  const measurementUnit = isCurrency
    ? "Currency"
    : meta.dataType === "Percentage"
      ? "Percentage"
      : "Number";

  const slices = calculateBreakdown(
    bridgeType,
    displayedNum,
    periodCount,
    { measurementUnit },
  );
  if (!slices) return null;

  // Format each slice back into the cell's storage shape.
  return slices.map((v) => {
    if (v === 0) return "";
    if (isCurrency) {
      return combineProjectedValue(String(v), scale);
    }
    return String(v);
  });
}

/**
 * When the user edits a single period cell on an **Automatic + Cumulative**
 * row, keep the running total equal to Projected by pushing the difference
 * onto the cell(s) AFTER the edited one — a forward cascade, not an even
 * re-split. The immediately-following cell absorbs the whole delta; it only
 * spills onto the next cell (wrapping past the end) when a cell would go
 * negative. Cells the user already set are left untouched, so a sequence like
 * "M1 = 40, then M2 = 5" leaves M3 to take the remainder (→ 35) instead of
 * snapping every other cell to an equal share.
 *
 * Examples (Projected = 30, starting 10 / 10 / 10):
 *   - edit M1 → 5      ⇒  5 / 15 / 10   (M2 absorbs the +5, M3 untouched)
 *   - then edit M2 → 4 ⇒  5 / 4 / 21    (M3 absorbs the +11)
 *
 * Rebalance only applies when:
 *   - `breakdownType === "Automatic"` (Manual rows leave cells alone)
 *   - `categoryType === "Cumulative"` (Standalone/TillEnd have different semantics)
 *
 * The edited value is clamped to [0, Projected] so the total can never exceed
 * Projected. Operates on the displayed numeric value (same as
 * `breakdownProjected`) so currency rows preserve the Projected's scale.
 *
 * Returns a new `string[]` of length `values.length`, OR `null` when no
 * rebalance applies (then the caller should write only the edited cell).
 */
export function redistributeOnCellEdit(opts: {
  categoryName: string;
  projected: string;
  values: string[];
  edited: number;
  newVal: string;
}): string[] | null {
  const meta = catMetaCache.get(opts.categoryName);
  if (!meta) return null;
  if (meta.breakdownType !== "Automatic") return null;
  if (meta.categoryType !== "Cumulative") return null;

  const trimmedProj = (opts.projected ?? "").trim();
  if (!trimmedProj) return null;

  const isCurrency = meta.dataType === "Currency";
  const currency = meta.currency ?? "USD";

  // Parse Projected → displayed numeric + scale
  let projDisplayed: number;
  let scale = "";
  if (isCurrency) {
    const p = parseProjectedValue(opts.projected, currency);
    projDisplayed = parseFloat(p.num);
    scale = p.scale ?? "";
  } else {
    projDisplayed = parseFloat(trimmedProj);
  }
  if (!Number.isFinite(projDisplayed) || projDisplayed <= 0) return null;

  // Parse the edited value (same scale convention as Projected)
  let editedDisplayed: number;
  const editedTrim = (opts.newVal ?? "").trim();
  if (editedTrim === "") {
    editedDisplayed = 0;
  } else if (isCurrency) {
    const p = parseProjectedValue(opts.newVal, currency);
    editedDisplayed = parseFloat(p.num);
  } else {
    editedDisplayed = parseFloat(editedTrim);
  }
  if (!Number.isFinite(editedDisplayed)) editedDisplayed = 0;

  const isWhole = meta.dataType === "Number";
  const formatVal = (v: number): string => {
    if (v === 0) return "";
    if (isCurrency) {
      const numStr = isWhole ? String(Math.round(v)) : (Math.round(v * 100) / 100).toString();
      return combineProjectedValue(numStr, scale);
    }
    return isWhole ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
  };

  const round2 = (v: number): number => (isWhole ? Math.round(v) : Math.round(v * 100) / 100);

  // Parse every current cell to its displayed numeric (same scale convention
  // as Projected) so the cascade reasons over numbers, not strings.
  const parseCell = (s: string): number => {
    const t = (s ?? "").trim();
    if (t === "") return 0;
    const raw = isCurrency ? parseProjectedValue(s, currency).num : t;
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num : 0;
  };

  const nums = opts.values.map(parseCell);
  const len = nums.length;
  if (len === 0) return [...opts.values];

  // Clamp the edited cell into [0, Projected] up front — a single cell can
  // never carry more than the whole Projected.
  nums[opts.edited] = round2(Math.min(Math.max(editedDisplayed, 0), projDisplayed));

  // Forward cascade: bring the total back to Projected by absorbing the delta
  // into the next cell, spilling onto subsequent cells (wrapping past the end)
  // only when a cell would go negative. Cells the user already set keep their
  // values whenever the immediate neighbour can absorb the change alone.
  let delta = round2(projDisplayed - nums.reduce((a, b) => a + b, 0));
  for (let step = 1; step < len && Math.abs(delta) > 0.001; step++) {
    const j = (opts.edited + step) % len;
    const next = round2(nums[j] + delta);
    if (next < 0) {
      // This cell can't absorb the full (negative) delta — zero it and carry
      // the unabsorbed remainder onto the next cell in the cascade.
      delta = round2(delta + nums[j]);
      nums[j] = 0;
    } else {
      nums[j] = next;
      delta = 0;
    }
  }
  // Any residual delta means the edited value alone exceeded what the other
  // cells could give back — claw it off the edited cell so the total still
  // equals Projected (never exceeds it).
  if (Math.abs(delta) > 0.001) {
    nums[opts.edited] = round2(Math.max(0, nums[opts.edited] + delta));
  }

  return nums.map((v) => formatVal(v));
}

/**
 * Compute "is this row balanced?" using the two-axis matrix:
 *
 *   | breakdownType | categoryType        | mode | check                       |
 *   |---------------|---------------------|------|-----------------------------|
 *   | Automatic     | (any)               | auto | always balanced (calc owns) |
 *   | Manual        | Cumulative          | sum  | Σ cells === Projected       |
 *   | Manual        | CumulativeTillEnd   | last | last cell === Projected     |
 *   | Manual        | Standalone          | each | always balanced (dropdown)  |
 *
 * Returns:
 *   - effective: the value to compare against `projected` (sum / last / first
 *                depending on mode) — used by ValidationBar to render progress
 *   - isBalanced / isOver: traffic-light states for the row
 *   - mode: which comparison was used; "auto" and "each" suppress ValidationBar
 */
function computeRowBalance(
  categoryName: string,
  values: number[],
  projected: number,
): { effective: number; isBalanced: boolean; isOver: boolean; mode: "sum" | "last" | "each" | "auto" } {
  const meta = catMetaCache.get(categoryName);
  // Default to Automatic + Cumulative when meta is missing — same fallback as
  // breakdownProjected. Auto rows are always balanced from the validator's
  // perspective (the calculator keeps the row in sync).
  const breakdownType = meta?.breakdownType ?? "Automatic";
  const categoryType = meta?.categoryType ?? "Cumulative";

  if (breakdownType === "Automatic") {
    const sum = values.reduce((a, b) => a + b, 0);
    return { effective: sum, isBalanced: true, isOver: false, mode: "auto" };
  }

  // Manual rows — branch by categoryType.
  if (categoryType === "Standalone") {
    const firstNonZero = values.find(v => v > 0) ?? 0;
    return { effective: firstNonZero, isBalanced: true, isOver: false, mode: "each" };
  }

  if (categoryType === "CumulativeTillEnd") {
    const last = values[values.length - 1] ?? 0;
    return {
      effective: last,
      isBalanced: Math.abs(last - projected) < 0.01,
      isOver: last > projected + 0.01,
      mode: "last",
    };
  }

  // Manual + Cumulative → sum check.
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    effective: sum,
    isBalanced: Math.abs(sum - projected) < 0.01,
    isOver: sum > projected + 0.01,
    mode: "sum",
  };
}

/**
 * Format a resolved absolute number back into a human-readable scaled string.
 * Uses the category's currency scales to pick the best abbreviation.
 * e.g. 300000 with INR → "3 L", 5000000 → "50 L", 42 with Number → "42"
 */
function fmtScaled(absVal: number, categoryName: string): string {
  const meta = catMetaCache.get(categoryName);
  if (!meta || meta.dataType !== "Currency") return fmtNum(absVal);

  const currency = meta.currency ?? "USD";
  const symbol = meta.symbol ?? "";
  const scales = getScales(currency);

  // Find the largest scale that divides cleanly (or with ≤2 decimals)
  for (let i = scales.length - 1; i >= 0; i--) {
    const s = scales[i];
    if (s.multiplier <= 1) continue;
    const divided = absVal / s.multiplier;
    if (divided >= 1 && Number.isFinite(divided)) {
      const abbr = ABBR_TO_LABEL[s.label] !== undefined
        ? Object.entries(ABBR_TO_LABEL).find(([, v]) => v === s.label)?.[0] ?? s.label
        : s.label;
      // Reverse lookup: label → abbreviation
      const abbrMap: Record<string, string> = {
        Thousand: "K", Million: "M", Billion: "B", Lakh: "L", Crore: "Cr",
      };
      const short = abbrMap[s.label] ?? s.label;
      const numStr = divided % 1 === 0 ? String(divided) : divided.toFixed(2).replace(/\.?0+$/, "");
      return `${symbol}${numStr} ${short}`;
    }
  }
  return `${symbol}${fmtNum(absVal)}`;
}

/**
 * Compact inline validation bar — replaces verbose multi-state alerts.
 *
 * States:
 *   - No period values → nothing rendered
 *   - Sum < Projected  → blue progress text + thin bar
 *   - Sum = Projected  → green "✓ Balanced"
 *   - Sum > Projected  → red "Exceeded by X"
 */
function ValidationBar({ effective, projected, categoryName, mode }: {
  effective: number;
  projected: number;
  categoryName: string;
  mode: "sum" | "last" | "each" | "auto";
}) {
  // Auto + each modes are always balanced by construction — no need to render
  // the progress bar (the row passes validation regardless of cell values).
  if (mode === "auto" || mode === "each") return null;
  if (projected <= 0 || effective === 0) return null;

  const pct = Math.min((effective / projected) * 100, 100);
  const isMatched = Math.abs(effective - projected) < 0.01;
  const isOver = effective > projected + 0.01;

  if (isMatched) {
    return (
      <div className="flex items-center gap-1 pl-1 pt-0.5 pb-0.5">
        <Check className="h-3 w-3 text-green-600" />
        <span className="text-[10px] text-green-600 font-medium">Balanced</span>
      </div>
    );
  }

  if (isOver) {
    const overAmt = effective - projected;
    return (
      <div className="flex items-center gap-1 pl-1 pt-0.5 pb-0.5">
        <AlertTriangle className="h-3 w-3 text-red-500" />
        <span className="text-[10px] text-red-600 font-medium">
          Exceeded by {fmtScaled(overAmt, categoryName)}
        </span>
      </div>
    );
  }

  // Under — show progress. Label tells the user what's being measured.
  // mode is narrowed to "sum" | "last" here (auto/each early-returned above).
  const progressLabel = mode === "last" ? "End year" : "Filled";
  return (
    <div className="pl-1 pt-0.5 pb-0.5 space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-blue-600 font-medium">
          {progressLabel}: {fmtScaled(effective, categoryName)} / {fmtScaled(projected, categoryName)}
        </span>
        <span className="text-[10px] text-gray-400">{Math.round(pct)}%</span>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Cell renderer for Standalone rows (any breakdownType).
 *
 * Standalone semantics say every period cell holds the Projected value
 * (rendered as-is, preserving currency scale suffix). The cell is a
 * 2-option dropdown — `[Projected, 0]` — with Projected pre-selected by
 * default. An empty cell with a non-empty Projected auto-persists the
 * Projected value so the visible default and the stored state match.
 *
 * Picks resolve to either the projected string or "0" — no parsing or
 * rebalance — and the parent stores them as-is.
 */
function StandaloneSelect({
  value,
  projected,
  onChange,
  disabled,
}: {
  value: string;
  projected: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const projTrim = (projected ?? "").trim();
  const valTrim = (value ?? "").trim();

  // Auto-default: when no value has been picked yet but Projected is set,
  // persist the Projected value so the dropdown's visible selection matches
  // the form state. Read-only / disabled mode skips this. Re-runs when
  // Projected changes (relevant for legacy data loaded with empty cells).
  useEffect(() => {
    if (!disabled && valTrim === "" && projTrim !== "") {
      onChange(projTrim);
    }
  }, [valTrim, projTrim, disabled, onChange]);

  // The select holds the displayed pick label so React renders the right option.
  // When state is briefly empty (before the effect above runs) we still want
  // Projected to appear selected — fall through to projTrim in that case.
  const selectValue =
    valTrim === "0" ? "0" : projTrim;

  return (
    <div className={`flex items-center border border-gray-200 rounded bg-white overflow-hidden ${disabled ? "opacity-50 pointer-events-none bg-gray-50" : ""}`}>
      <select
        value={selectValue}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 w-0 bg-transparent focus:outline-none text-sm text-gray-700 px-2 py-1.5 cursor-pointer"
      >
        {projTrim && <option value={projTrim}>{projTrim}</option>}
        <option value="0">0</option>
      </select>
    </div>
  );
}

export function TargetsModal({
  open,
  onClose,
  rows,
  onChange,
  targetYears,
  fiscalYear,
  fiscalYearStart,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  rows: TargetRow[];
  onChange: (r: TargetRow[]) => void;
  targetYears: number;
  fiscalYear: number;
  fiscalYearStart: number;
  readOnly?: boolean;
}) {
  if (!open) return null;

  /**
   * Build the fiscal year label for a given offset (0-indexed).
   *   - If fiscalYearStart === 1 (January), FY aligns with the calendar year → "2026", "2027", ...
   *   - Otherwise, FY spans two calendar years → "2026 - 27", "2027 - 28", ...
   */
  function fiscalYearLabelFor(offset: number): string {
    const startCal = fiscalYear + offset;
    if (fiscalYearStart === 1) return String(startCal);
    const endCalTwoDigit = String((startCal + 1) % 100).padStart(2, "0");
    return `${startCal} - ${endCalTwoDigit}`;
  }
  const yearCols = Array.from({ length: targetYears }, (_, i) =>
    fiscalYearLabelFor(i),
  );
  const keys = ["y1", "y2", "y3", "y4", "y5"].slice(0, targetYears) as (keyof TargetRow)[];
  const gridStyle = {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: `2fr 1fr ${keys.map(() => "1fr").join(" ")}`,
  };

  // ── Pre-compute per-row validation for Submit disable check ──
  const rowValidations = rows.map((row) => {
    const meta = catMetaCache.get(row.category);
    const hasCategory = !!row.category.trim();
    const projectedVal = resolveProjected(row.category, row.projected);
    const hasProjected = projectedVal !== null && projectedVal > 0;
    const yearValues = keys.map(k => resolveProjected(row.category, String(row[k] ?? "")) ?? 0);
    const hasAnyYear = yearValues.some(v => v > 0);
    const hasAllYears = keys.every(k => String(row[k] ?? "").trim() !== "");
    const balance = computeRowBalance(row.category, yearValues, projectedVal ?? 0);

    // Error states (driven by breakdownType — sum/last/each/manual)
    const noYearsFilled = hasCategory && !hasAnyYear;
    const isMatched = hasProjected && hasAllYears && balance.isBalanced;
    const isOver = hasProjected && balance.isOver;
    const isUnder = hasProjected && hasAnyYear && !hasAllYears && !balance.isBalanced && !balance.isOver;
    const isMismatch = hasProjected && hasAllYears && !balance.isBalanced;

    const hasError = noYearsFilled || isOver || isUnder || isMismatch;
    // Block submit only when user has started filling AND row isn't balanced.
    // Manual rows are always considered balanced (no enforcement).
    const isUnbalanced = hasProjected && hasAnyYear && !balance.isBalanced;

    return {
      meta, hasCategory, projectedVal, hasProjected,
      yearValues, balance, hasAnyYear, hasAllYears,
      noYearsFilled, isMatched, isOver, isUnder, isMismatch, hasError, isUnbalanced,
    };
  });

  const hasAnyUnbalanced = rowValidations.some(v => v.isUnbalanced);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <p className="text-base font-bold text-gray-900 uppercase tracking-wide">
              TARGETS (3–5 YRS.)
            </p>
            <p className="text-xs text-gray-500">(Where)</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`px-6 pb-6 overflow-y-auto flex-1 ${readOnly ? "opsp-finalized" : ""}`}>
          <div
            style={gridStyle}
            className="text-xs font-medium text-gray-500 pb-2 border-b border-gray-200 mb-2"
          >
            <span>Category</span>
            <span>Projected</span>
            {yearCols.map((y) => (
              <span key={y}>{y}</span>
            ))}
          </div>
          {rows.map((row, i) => {
            const v = rowValidations[i];
            const isCurrency = v.meta?.dataType === "Currency";
            const isPct = v.meta?.dataType === "Percentage";
            const symbol = v.meta?.symbol ?? null;
            const yearPlaceholder = isCurrency ? "Currency" : isPct ? "Percentage" : "Number";

            return (
              <div key={i}>
                <div
                  style={gridStyle}
                  className="items-start py-2 border-b border-gray-100"
                >
                  <CategorySelect
                    value={row.category}
                    excludeNames={rows.map((r, idx) => idx === i ? "" : r.category)}
                    onChange={(val) => {
                      const next = [...rows];
                      next[i] = { ...next[i], category: val, projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" };
                      onChange(next);
                    }}
                  />
                  <div className={!v.hasCategory ? "opacity-50 pointer-events-none" : ""}>
                    <ProjectedInput
                      categoryName={row.category}
                      value={row.projected}
                      onChange={(val) => {
                        const next = [...rows];
                        // Auto-fill year cells based on the category's breakdownType.
                        // Cumulative / Standalone / CumulativeTillExit fill the
                        // year cells; Manual returns null and leaves them alone.
                        const autofill = breakdownProjected(row.category, val, targetYears);
                        const yearPatch: Partial<TargetRow> = {};
                        if (autofill) {
                          keys.forEach((k, idx) => {
                            (yearPatch as Record<string, string>)[k as string] = autofill[idx] ?? "";
                          });
                        }
                        next[i] = { ...next[i], projected: val, ...yearPatch };
                        onChange(next);
                      }}
                    />
                  </div>
                  {keys.map((k) => {
                    const disabled = !v.hasCategory || !v.hasProjected;
                    const currency = v.meta?.currency ?? "USD";
                    const availScales = isCurrency ? getScaleAbbrs(currency) : [];
                    // Standalone always uses the dropdown — breakdownType no
                    // longer gates this (Standalone is treated as Automatic
                    // throughout). See StandaloneSelect + breakdownProjected.
                    const isStandalone = v.meta?.categoryType === "Standalone";
                    if (isStandalone) {
                      return (
                        <StandaloneSelect
                          key={k}
                          value={String(row[k] ?? "")}
                          projected={row.projected}
                          disabled={disabled}
                          onChange={(val) => {
                            const next = [...rows];
                            next[i] = { ...next[i], [k]: val };
                            onChange(next);
                          }}
                        />
                      );
                    }
                    const { num: fieldNum, scale: fieldScale } = isCurrency
                      ? parseProjectedValue(String(row[k] ?? ""), currency)
                      : { num: String(row[k] ?? ""), scale: "" };
                    return (
                      <div key={k} className={`flex items-center border border-gray-200 rounded bg-white focus-within:ring-1 focus-within:ring-accent-400 overflow-hidden ${disabled ? "opacity-50 pointer-events-none bg-gray-50" : ""}`}>
                        {isCurrency && symbol && (
                          <span className="pl-2 text-gray-500 text-xs select-none flex-shrink-0">{symbol}</span>
                        )}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={isCurrency ? fieldNum : String(row[k] ?? "")}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = [...rows];
                            // Strip non-numeric chars so cells like "6.6fgdgf7" can't land in state.
                            const cleaned = sanitizeNumericInput(e.target.value);
                            const val = isCurrency ? combineProjectedValue(cleaned, fieldScale) : cleaned;
                            // Only Automatic+Cumulative rows rebalance; others
                            // write only the edited cell.
                            const editedIdx = keys.indexOf(k);
                            const currentValues = keys.map((kk) => String(row[kk] ?? ""));
                            const rebalanced = redistributeOnCellEdit({
                              categoryName: row.category,
                              projected: row.projected,
                              values: currentValues,
                              edited: editedIdx,
                              newVal: val,
                            });
                            if (rebalanced) {
                              const patch: Partial<TargetRow> = {};
                              keys.forEach((kk, idx) => {
                                (patch as Record<string, string>)[kk as string] = rebalanced[idx];
                              });
                              next[i] = { ...next[i], ...patch };
                            } else {
                              next[i] = { ...next[i], [k]: val };
                            }
                            onChange(next);
                          }}
                          placeholder={yearPlaceholder}
                          className={`flex-1 min-w-0 w-0 bg-transparent focus:outline-none placeholder-gray-400 text-sm text-gray-700 text-right ${
                            isCurrency && symbol ? "px-1 py-1.5" : isPct ? "pl-2 pr-1 py-1.5" : "px-2 py-1.5"
                          }`}
                        />
                        {isCurrency && (
                          <select
                            value={fieldScale || "-"}
                            disabled={disabled}
                            onChange={(e) => {
                              const next = [...rows];
                              next[i] = { ...next[i], [k]: combineProjectedValue(fieldNum, e.target.value) };
                              onChange(next);
                            }}
                            className="w-[40px] flex-shrink-0 px-0.5 py-1.5 text-xs text-gray-600 bg-gray-50 border-l border-gray-200 focus:outline-none cursor-pointer"
                            title="Scale"
                          >
                            {availScales.map((abbr) => (
                              <option key={abbr} value={abbr}>{abbr}</option>
                            ))}
                          </select>
                        )}
                        {isPct && (
                          <span className="pr-2 pl-0.5 text-gray-500 text-sm flex-shrink-0 select-none">%</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Compact validation bar ── */}
                {v.hasProjected && v.hasAnyYear && (
                  <ValidationBar
                    effective={v.balance.effective}
                    projected={v.projectedVal!}
                    categoryName={row.category}
                    mode={v.balance.mode}
                  />
                )}
              </div>
            );
          })}
          <div className="flex items-center justify-end gap-3 mt-5">
            {!readOnly && hasAnyUnbalanced && (
              <span className="text-xs text-red-500 font-medium">Projected breakdown doesn&apos;t match</span>
            )}
            <button
              onClick={onClose}
              disabled={!readOnly && hasAnyUnbalanced}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                !readOnly && hasAnyUnbalanced
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : readOnly
                    ? "bg-gray-600 text-white hover:bg-gray-700"
                    : "bg-accent-600 text-white hover:bg-accent-700"
              }`}
            >
              {readOnly ? "Close" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Read-only pill for inherited category — replaces CategorySelect */
function InheritedCategory({ value, source }: { value: string; source: string }) {
  const label = displayCategory(value) || "—";
  return (
    <div className="w-full flex items-center justify-between border border-gray-200 rounded px-2 py-1.5 bg-gray-50 gap-1 cursor-not-allowed">
      <WithTooltip content={label} className="relative flex-1 min-w-0">
        <span className="block text-sm whitespace-nowrap truncate text-left text-gray-500">
          {label}
        </span>
      </WithTooltip>
      <WithTooltip content={`Locked — set in ${source}`} className="relative flex-shrink-0">
        <Lock className="h-3 w-3 text-gray-400" />
      </WithTooltip>
    </div>
  );
}

/** Read-only display for inherited projected value */
function InheritedProjected({ value, categoryName, source }: { value: string; categoryName: string; source: string }) {
  const meta = catMetaCache.get(categoryName);
  const isCurrency = meta?.dataType === "Currency";
  const isPct = meta?.dataType === "Percentage";
  const symbol = meta?.symbol ?? null;
  return (
    <div className="flex items-center border border-gray-200 rounded bg-gray-50 overflow-hidden cursor-not-allowed">
      {isCurrency && symbol && (
        <span className="w-[15px] flex-shrink-0 text-gray-400 text-xs text-center select-none">{symbol}</span>
      )}
      <WithTooltip content={value || ""} className="relative flex-1 min-w-0 w-0">
        <span className={`block text-sm text-gray-500 truncate ${
          isCurrency ? "px-1 py-1.5" : isPct ? "pl-2 pr-1 py-1.5" : "px-2 py-1.5"
        }`}>
          {value || "—"}
        </span>
      </WithTooltip>
      {isPct && (
        <span className="pr-2 pl-0.5 text-gray-400 text-sm flex-shrink-0 select-none">%</span>
      )}
      <WithTooltip content={`Locked — set in ${source}`} className="relative flex-shrink-0 mr-1.5">
        <Lock className="h-3 w-3 text-gray-400" />
      </WithTooltip>
    </div>
  );
}

export function GoalsModal({
  open,
  onClose,
  rows,
  onChange,
  targetRows,
  readOnly = false,
  nudges,
  onClearNudge,
}: {
  open: boolean;
  onClose: () => void;
  rows: GoalRow[];
  onChange: (r: GoalRow[]) => void;
  targetRows: TargetRow[];
  readOnly?: boolean;
  /** Per-row carry-forward nudges seeded from the previous quarter. */
  nudges?: Array<{
    rowIndex: number;
    period: "q1" | "q2" | "q3" | "q4";
    oldValue: string;
    gap: number;
  }>;
  /** Called after the user types over a nudged cell — drops just that chip. */
  onClearNudge?: (rowIndex: number, period: "q1" | "q2" | "q3" | "q4") => void;
}) {
  if (!open) return null;
  const qCols: (keyof GoalRow)[] = ["q1", "q2", "q3", "q4"];
  const gridCols = "2fr 1fr 1fr 1fr 1fr 1fr";

  // ── Pre-compute per-row validation ──
  const rowValidations = rows.map((row, i) => {
    const meta = catMetaCache.get(row.category);
    const hasCategory = !!row.category.trim();
    const projectedVal = resolveProjected(row.category, row.projected);
    const hasProjected = projectedVal !== null && projectedVal > 0;
    const qValues = qCols.map(k => resolveProjected(row.category, String(row[k] ?? "")) ?? 0);
    const hasAnyQ = qValues.some(v => v > 0);
    const hasAllQ = qCols.every(k => String(row[k] ?? "").trim() !== "");
    const balance = computeRowBalance(row.category, qValues, projectedVal ?? 0);

    // Check if this row is inherited from Targets (rows 0-4 only)
    const t = i < targetRows.length ? targetRows[i] : null;
    const isInherited = !!(t && t.category.trim() && t.projected.trim() && t.y1.trim());

    const noQFilled = hasCategory && !hasAnyQ;
    const isMatched = hasProjected && hasAllQ && balance.isBalanced;
    const isOver = hasProjected && balance.isOver;
    const isUnder = hasProjected && hasAnyQ && !hasAllQ && !balance.isBalanced && !balance.isOver;
    const isMismatch = hasProjected && hasAllQ && !balance.isBalanced;
    const hasError = noQFilled || isOver || isUnder || isMismatch;
    const isUnbalanced = hasProjected && hasAnyQ && !balance.isBalanced;

    return { meta, hasCategory, projectedVal, hasProjected, qValues, balance, hasAnyQ, hasAllQ, noQFilled, isMatched, isOver, isUnder, isMismatch, hasError, isUnbalanced, isInherited };
  });

  const hasAnyUnbalanced = rowValidations.some(v => v.isUnbalanced);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <p className="text-base font-bold text-gray-900 uppercase tracking-wide">
              GOALS (1 YR.)
            </p>
            <p className="text-xs text-gray-500">(What)</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`px-6 pb-6 overflow-y-auto flex-1 ${readOnly ? "opsp-finalized" : ""}`}>
          <div
            style={{ display: "grid", gap: "12px", gridTemplateColumns: gridCols }}
            className="text-xs font-medium text-gray-500 pb-2 border-b border-gray-200 mb-2"
          >
            <span>Category</span>
            <span>Projected</span>
            {["Quarter 1", "Quarter 2", "Quarter 3", "Quarter 4"].map((q) => (
              <span key={q}>{q}</span>
            ))}
          </div>
          {rows.map((row, i) => {
            const v = rowValidations[i];
            const isCurrency = v.meta?.dataType === "Currency";
            const isPct = v.meta?.dataType === "Percentage";
            const symbol = v.meta?.symbol ?? null;
            const qPlaceholder = isCurrency ? "Currency" : isPct ? "Percentage" : "Number";

            return (
              <div key={i}>
                <div
                  style={{ display: "grid", gap: "12px", gridTemplateColumns: gridCols }}
                  className="items-start py-2 border-b border-gray-100"
                >
                  {v.isInherited ? (
                    <InheritedCategory value={row.category} source="Targets" />
                  ) : (
                    <CategorySelect
                      value={row.category}
                      excludeNames={rows.map((r, idx) => idx === i ? "" : r.category)}
                      onChange={(val) => {
                        const next = [...rows];
                        next[i] = { ...next[i], category: val, projected: "", q1: "", q2: "", q3: "", q4: "" };
                        onChange(next);
                      }}
                    />
                  )}
                  {v.isInherited ? (
                    <InheritedProjected value={row.projected} categoryName={row.category} source="Targets" />
                  ) : (
                    <div className={!v.hasCategory ? "opacity-50 pointer-events-none" : ""}>
                      <ProjectedInput
                        categoryName={row.category}
                        value={row.projected}
                        onChange={(val) => {
                          const next = [...rows];
                          // Auto-fill 4 quarter cells based on the category's
                          // breakdownType when Projected is entered.
                          const autofill = breakdownProjected(row.category, val, qCols.length);
                          const qPatch: Partial<GoalRow> = {};
                          if (autofill) {
                            qCols.forEach((k, idx) => {
                              (qPatch as Record<string, string>)[k as string] = autofill[idx] ?? "";
                            });
                          }
                          next[i] = { ...next[i], projected: val, ...qPatch };
                          onChange(next);
                        }}
                      />
                    </div>
                  )}
                  {qCols.map((k) => {
                    const disabled = !v.hasCategory || !v.hasProjected;
                    const currency = v.meta?.currency ?? "USD";
                    const availScales = isCurrency ? getScaleAbbrs(currency) : [];
                    const qKey = k as "q1" | "q2" | "q3" | "q4";
                    const nudge = nudges?.find((n) => n.rowIndex === i && n.period === qKey);
                    // Standalone always uses the dropdown — breakdownType no
                    // longer gates this (Standalone is treated as Automatic
                    // throughout). See StandaloneSelect + breakdownProjected.
                    const isStandalone = v.meta?.categoryType === "Standalone";

                    // Common wrapper — stacks input + nudge chip vertically so
                    // the chip lives under its own cell in the grid.
                    // Chip text shows sign-correct gap + source quarter
                    // (e.g. "+2 from Q1" for under-achievement,
                    // "−5 from Q1" for over-achievement on a Cumulative row).
                    const wrap = (cell: React.ReactNode) => {
                      const prevQLabel: Record<string, string> = { q2: "Q1", q3: "Q2", q4: "Q3" };
                      const prevQ = nudge ? prevQLabel[nudge.period] ?? "" : "";
                      const sign = nudge && nudge.gap > 0 ? "+" : nudge && nudge.gap < 0 ? "−" : "";
                      return (
                        <div key={k} className="flex flex-col gap-0.5 min-w-0">
                          {cell}
                          {nudge && nudge.gap !== 0 && (
                            <span className="text-[10px] text-amber-600 font-medium px-1 leading-tight">
                              {sign}{Math.abs(nudge.gap)} from {prevQ}
                            </span>
                          )}
                        </div>
                      );
                    };

                    if (isStandalone) {
                      return wrap(
                        <StandaloneSelect
                          value={String(row[k] ?? "")}
                          projected={row.projected}
                          disabled={disabled}
                          onChange={(val) => {
                            const next = [...rows];
                            next[i] = { ...next[i], [k]: val };
                            if (nudge) onClearNudge?.(i, qKey);
                            onChange(next);
                          }}
                        />,
                      );
                    }

                    const { num: fieldNum, scale: fieldScale } = isCurrency
                      ? parseProjectedValue(String(row[k] ?? ""), currency)
                      : { num: String(row[k] ?? ""), scale: "" };
                    return wrap(
                      <div className={`flex items-center border border-gray-200 rounded bg-white focus-within:ring-1 focus-within:ring-accent-400 overflow-hidden ${disabled ? "opacity-50 pointer-events-none bg-gray-50" : ""}`}>
                        {isCurrency && symbol && (
                          <span className="pl-2 text-gray-500 text-xs select-none flex-shrink-0">{symbol}</span>
                        )}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={isCurrency ? fieldNum : String(row[k] ?? "")}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = [...rows];
                            // Strip non-numeric chars so cells like "6.6fgdgf7" can't land in state.
                            const cleaned = sanitizeNumericInput(e.target.value);
                            const val = isCurrency ? combineProjectedValue(cleaned, fieldScale) : cleaned;
                            const editedIdx = qCols.indexOf(k);
                            const currentValues = qCols.map((kk) => String(row[kk] ?? ""));
                            const rebalanced = redistributeOnCellEdit({
                              categoryName: row.category,
                              projected: row.projected,
                              values: currentValues,
                              edited: editedIdx,
                              newVal: val,
                            });
                            if (rebalanced) {
                              const patch: Partial<GoalRow> = {};
                              qCols.forEach((kk, idx) => {
                                (patch as Record<string, string>)[kk as string] = rebalanced[idx];
                              });
                              next[i] = { ...next[i], ...patch };
                            } else {
                              next[i] = { ...next[i], [k]: val };
                            }
                            if (nudge) onClearNudge?.(i, qKey);
                            onChange(next);
                          }}
                          placeholder={qPlaceholder}
                          className={`flex-1 min-w-0 w-0 bg-transparent focus:outline-none placeholder-gray-400 text-sm text-gray-700 text-right ${
                            isCurrency && symbol ? "px-1 py-1.5" : isPct ? "pl-2 pr-1 py-1.5" : "px-2 py-1.5"
                          }`}
                        />
                        {isCurrency && (
                          <select
                            value={fieldScale || "-"}
                            disabled={disabled}
                            onChange={(e) => {
                              const next = [...rows];
                              next[i] = { ...next[i], [k]: combineProjectedValue(fieldNum, e.target.value) };
                              onChange(next);
                            }}
                            className="w-[40px] flex-shrink-0 px-0.5 py-1.5 text-xs text-gray-600 bg-gray-50 border-l border-gray-200 focus:outline-none cursor-pointer"
                            title="Scale"
                          >
                            {availScales.map((abbr) => (
                              <option key={abbr} value={abbr}>{abbr}</option>
                            ))}
                          </select>
                        )}
                        {isPct && (
                          <span className="pr-2 pl-0.5 text-gray-500 text-sm flex-shrink-0 select-none">%</span>
                        )}
                      </div>,
                    );
                  })}
                </div>

                {/* ── Compact validation bar ── */}
                {v.hasProjected && v.hasAnyQ && (
                  <ValidationBar
                    effective={v.balance.effective}
                    projected={v.projectedVal!}
                    categoryName={row.category}
                    mode={v.balance.mode}
                  />
                )}
              </div>
            );
          })}
          <div className="flex items-center justify-end gap-3 mt-5">
            {!readOnly && hasAnyUnbalanced && (
              <span className="text-xs text-red-500 font-medium">Projected breakdown doesn&apos;t match</span>
            )}
            <button
              onClick={onClose}
              disabled={!readOnly && hasAnyUnbalanced}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                !readOnly && hasAnyUnbalanced
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : readOnly
                    ? "bg-gray-600 text-white hover:bg-gray-700"
                    : "bg-accent-600 text-white hover:bg-accent-700"
              }`}
            >
              {readOnly ? "Close" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-row validation for the ACTIONS (QTR) grid. Pure — computes the same
 * balance / goal-cap / per-cell / monotonic / exit rules the modal renders,
 * so the logic can be shared between the modal's Submit gate and the OPSP
 * page's edit-after-finalize commit gate. The modal mutates form state live
 * (onChange fires per keystroke), so a finalized edit could otherwise reach
 * OPSP Review even while the modal shows an error and its Submit is disabled.
 * Keep `actionsQtrHasErrors` in lockstep with the Submit-disabled condition
 * in ActionsModal below.
 */
function computeActionsQtrValidations(rows: ActionRow[], goalRows: GoalRow[]) {
  const mCols: (keyof ActionRow)[] = ["m1", "m2", "m3"];
  return rows.map((row) => {
    const meta = catMetaCache.get(row.category);
    const hasCategory = !!row.category.trim();
    const projectedVal = resolveProjected(row.category, row.projected);
    const hasProjected = projectedVal !== null && projectedVal > 0;
    const mValues = mCols.map(k => resolveProjected(row.category, String(row[k] ?? "")) ?? 0);
    const hasAnyM = mValues.some(v => v > 0);
    const hasAllM = mCols.every(k => String(row[k] ?? "").trim() !== "");
    const balance = computeRowBalance(row.category, mValues, projectedVal ?? 0);

    // Resolve the matching Goal (1 YR.) row by CATEGORY NAME, not index.
    // The earlier index-based match silently dropped the "Goal: X" hint
    // whenever the Action and Goal rows weren't filled in the same order
    // (e.g. user fills row 1 of Actions = "product profit" while Goals row 1
    // = "revenue"). Name-match shows the hint regardless of row position.
    const goalForRow = hasCategory
      ? goalRows.find((g) => g.category.trim() && g.category === row.category) ?? null
      : null;
    const goalProjectedVal = goalForRow
      ? resolveProjected(goalForRow.category, goalForRow.projected)
      : null;
    // Validation: a single quarter's Projected must not exceed the annual
    // Goal's Projected. Applies uniformly across categoryTypes —
    // Cumulative, CumulativeTillEnd, AND Standalone. (A nonsensical case
    // like Standalone Q=1000 Cr against Y=90 Cr should be caught even
    // though Standalone's year value is conceptually an average.)
    const categoryType = meta?.categoryType;
    const exceedsGoal =
      hasProjected &&
      goalProjectedVal != null &&
      goalProjectedVal > 0 &&
      projectedVal! > goalProjectedVal + 0.01;

    // ── Per-cell rule (Cumulative + CumulativeTillEnd) ──
    // No individual month value may exceed Projected. Catches both:
    //   - Cumulative   : sum already over, but pinpoints the offending cell
    //   - CumulativeTillEnd: running totals are capped at Projected (exit)
    // Standalone is excluded — its monthly values are independent samples.
    const isAggregatedType = categoryType === "Cumulative" || categoryType === "CumulativeTillEnd";
    const cellsOverProjected = mValues.map(
      (v) => isAggregatedType && hasProjected && v > projectedVal! + 0.01,
    );
    const hasCellOverProjected = cellsOverProjected.some(Boolean);

    // ── Monotonic rule (CumulativeTillEnd only) ──
    // Running totals can't dip — each filled month must be ≥ the previous
    // filled month. Empty/zero cells are skipped, so the user can leave
    // later months blank once an earlier month already reached Projected.
    const monotonicViolations = mValues.map((v, idx) => {
      if (categoryType !== "CumulativeTillEnd") return false;
      if (idx === 0 || v <= 0) return false;
      let prevNonZero: number | null = null;
      for (let j = idx - 1; j >= 0; j--) {
        if (mValues[j] > 0) { prevNonZero = mValues[j]; break; }
      }
      return prevNonZero != null && v < prevNonZero - 0.01;
    });
    const hasMonotonicViolation = monotonicViolations.some(Boolean);

    // CumulativeTillEnd-specific: once an earlier month already equals
    // Projected (exit reached), later months can stay empty. Bypasses the
    // strict "last cell = projected" balance check so m1=25 / m2=blank /
    // m3=blank validates as balanced.
    const earlyExitReached = categoryType === "CumulativeTillEnd"
      && hasProjected
      && mValues.some((v) => Math.abs(v - projectedVal!) < 0.01);

    // ── Exit-not-reached rule (CumulativeTillEnd) ──
    // When the user filled some months but no cell reaches Projected — the
    // running total stops short of the required exit value. Catches the
    // [10, 20, 25] → Projected=30 case: monotonic, none over Projected, but
    // the exit (last filled month = 25) hasn't reached 30. Fires a specific
    // message so the user knows to bump up the last month.
    let lastFilledMonthIndex = -1;
    for (let i = mValues.length - 1; i >= 0; i--) {
      if (mValues[i] > 0) { lastFilledMonthIndex = i; break; }
    }
    const lastFilledValue = lastFilledMonthIndex >= 0 ? mValues[lastFilledMonthIndex] : null;
    const lastBelowProjected =
      categoryType === "CumulativeTillEnd"
      && hasProjected
      && lastFilledValue != null
      && !earlyExitReached
      && lastFilledValue < projectedVal! - 0.01;

    // ── Required-field rules ──
    // A selected category must have BOTH a Projected value and a Month
    // breakdown. Empty "Select Category" rows are skipped (hasCategory=false)
    // so the user can leave optional rows untouched.
    const missingProjected = hasCategory && !hasProjected;
    const missingBreakdown = hasCategory && hasProjected && !hasAnyM;

    const noMFilled = hasCategory && !hasAnyM;
    const isMatched = hasProjected && hasAllM && balance.isBalanced;
    const isOver = hasProjected && balance.isOver;
    const isUnder = hasProjected && hasAnyM && !hasAllM && !balance.isBalanced && !balance.isOver;
    const isMismatch = hasProjected && hasAllM && !balance.isBalanced;
    const hasError = noMFilled || isOver || isUnder || isMismatch || exceedsGoal
      || hasCellOverProjected || hasMonotonicViolation
      || missingProjected || missingBreakdown
      || lastBelowProjected;
    const isUnbalanced = hasProjected && hasAnyM && !balance.isBalanced && !earlyExitReached;

    return {
      meta, hasCategory, projectedVal, hasProjected, mValues, balance,
      hasAnyM, hasAllM, noMFilled, isMatched, isOver, isUnder, isMismatch,
      hasError, isUnbalanced,
      goalForRow, goalProjectedVal, exceedsGoal,
      cellsOverProjected, hasCellOverProjected,
      monotonicViolations, hasMonotonicViolation,
      missingProjected, missingBreakdown,
      lastBelowProjected, lastFilledMonthIndex,
    };
  });
}

/**
 * True when ANY ACTIONS (QTR) row is invalid. Mirrors EXACTLY the modal's
 * Submit-disabled condition (hasAnyUnbalanced || hasAnyExceedsGoal || …).
 * Used by the OPSP page to block an edit-after-finalize commit (and disable
 * the "Change logged" Save) so an invalid row can never reach OPSP Review.
 */
export function actionsQtrHasErrors(rows: ActionRow[], goalRows: GoalRow[]): boolean {
  return computeActionsQtrValidations(rows, goalRows).some(
    (v) =>
      v.isUnbalanced || v.exceedsGoal || v.hasCellOverProjected ||
      v.hasMonotonicViolation || v.missingProjected || v.missingBreakdown ||
      v.lastBelowProjected,
  );
}

/**
 * Per-row ACTIONS (QTR) validation messages — the SAME rules `actionsQtrHasErrors`
 * checks, surfaced as human messages that mirror the modal's error text. Used by
 * the page-level Finalize validation so Finalize blocks (with the same message)
 * whenever the modal would disable Submit — e.g. a CumulativeTillEnd row whose
 * last month is below Projected. Invariant: `actionsQtrErrors(...).length > 0`
 * ⟺ `actionsQtrHasErrors(...)`.
 */
export function actionsQtrErrors(
  rows: ActionRow[],
  goalRows: GoalRow[],
): { rowIndex: number; message: string }[] {
  const out: { rowIndex: number; message: string }[] = [];
  computeActionsQtrValidations(rows, goalRows).forEach((v, i) => {
    const row = rows[i];
    if (v.missingProjected) {
      out.push({ rowIndex: i, message: "Projected value is required." });
    }
    if (v.missingBreakdown) {
      out.push({ rowIndex: i, message: "Monthly breakdown is required." });
    }
    if (v.exceedsGoal) {
      out.push({ rowIndex: i, message: "Projected exceeds the Goal (1 YR)." });
    }
    if (v.hasCellOverProjected) {
      out.push({ rowIndex: i, message: `Month value cannot exceed Projected (${row.projected}).` });
    }
    if (v.hasMonotonicViolation) {
      out.push({ rowIndex: i, message: "Month values must not decrease." });
    }
    if (v.lastBelowProjected && v.lastFilledMonthIndex >= 0) {
      // Matches the modal's per-cell message + the Submit-area hint.
      out.push({
        rowIndex: i,
        message: `Month ${v.lastFilledMonthIndex + 1} value (${v.mValues[v.lastFilledMonthIndex]}) must reach Projected (${row.projected}). Last month must reach Projected.`,
      });
    } else if (v.isUnbalanced) {
      // Generic balance failure (hidden by the modal when the more specific
      // lastBelowProjected message already fired).
      out.push({ rowIndex: i, message: "Monthly values must add up to Projected." });
    }
  });
  return out;
}

export function ActionsModal({
  open,
  onClose,
  rows,
  onChange,
  fiscalYear,
  fiscalQuarter,
  goalRows,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  rows: ActionRow[];
  onChange: (r: ActionRow[]) => void;
  fiscalYear: number | string;
  fiscalQuarter: string;
  goalRows: GoalRow[];
  readOnly?: boolean;
}) {
  // Transient feedback when an over-goal Projected entry is rejected. Keyed by
  // row index + the cap value to show, so the message sits under the row the
  // user just typed in. Cleared on a valid entry (below) and whenever the modal
  // opens/closes so a stale warning doesn't survive a reopen.
  const [capWarning, setCapWarning] = useState<{ row: number; max: string } | null>(null);
  useEffect(() => { setCapWarning(null); }, [open]);
  if (!open) return null;
  const mCols: (keyof ActionRow)[] = ["m1", "m2", "m3"];
  // Columns: Category | Category Type | Projected | M1 | M2 | M3
  const gridCols = "2fr 1fr 1fr 1fr 1fr 1fr";

  // ── Pre-compute per-row validation ──
  // Shared with the OPSP page's edit-after-finalize commit gate via
  // `actionsQtrHasErrors` (defined above) so the two never drift.
  const rowValidations = computeActionsQtrValidations(rows, goalRows);

  const hasAnyUnbalanced = rowValidations.some(v => v.isUnbalanced);
  const hasAnyExceedsGoal = rowValidations.some(v => v.exceedsGoal);
  const hasAnyCellOverProjected = rowValidations.some(v => v.hasCellOverProjected);
  const hasAnyMonotonicViolation = rowValidations.some(v => v.hasMonotonicViolation);
  const hasAnyMissingProjected = rowValidations.some(v => v.missingProjected);
  const hasAnyMissingBreakdown = rowValidations.some(v => v.missingBreakdown);
  const hasAnyLastBelowProjected = rowValidations.some(v => v.lastBelowProjected);
  // Hide the generic "doesn't match" banner when the only reason for unbalance
  // is the more specific lastBelowProjected case — keeps the message focused.
  const hasAnyGenericUnbalance = rowValidations.some(v =>
    v.isUnbalanced && !v.lastBelowProjected
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <p className="text-base font-bold text-gray-900 uppercase tracking-wide">
              ACTIONS (QTR)
            </p>
            <p className="text-xs text-gray-500">(How)</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`px-6 pb-6 overflow-y-auto flex-1 ${readOnly ? "opsp-finalized" : ""}`}>
          {/* Fiscal period label */}
          <div className="mb-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-sm text-gray-600 font-medium">{fiscalYear} {fiscalQuarter}</p>
          </div>

          <div
            style={{ display: "grid", gap: "12px", gridTemplateColumns: gridCols }}
            className="text-xs font-medium text-gray-500 pb-2 border-b border-gray-200 mb-2"
          >
            <span>Category</span>
            <span>Category Type</span>
            <span>Projected</span>
            {["Month 1", "Month 2", "Month 3"].map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
          {rows.map((row, i) => {
            const v = rowValidations[i];
            const isCurrency = v.meta?.dataType === "Currency";
            const isPct = v.meta?.dataType === "Percentage";
            const symbol = v.meta?.symbol ?? null;
            const mPlaceholder = isCurrency ? "Currency" : isPct ? "Percentage" : "Number";

            return (
              <div key={i}>
                <div
                  style={{ display: "grid", gap: "12px", gridTemplateColumns: gridCols }}
                  className="items-start py-2 border-b border-gray-100"
                >
                  {/* Category seeds from the matching Goal (1 YR) row via
                      the Goals → Actions cascade in `hooks/useOPSPForm.ts`,
                      but stays editable here so the user can override per
                      Action row. */}
                  <CategorySelect
                    value={row.category}
                    excludeNames={rows.map((r, idx) => idx === i ? "" : r.category)}
                    onChange={(val) => {
                      const next = [...rows];
                      next[i] = { ...next[i], category: val, projected: "", m1: "", m2: "", m3: "" };
                      onChange(next);
                    }}
                  />
                  {/* Category Type — read-only chip derived from the selected
                      category's `categoryType` metadata (looked up via
                      `catMetaCache`). Empty placeholder when no category has
                      been picked yet. */}
                  <div className="flex items-center">
                    {v.hasCategory && v.meta?.categoryType ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 whitespace-nowrap">
                        {CATEGORY_TYPE_LABELS[v.meta.categoryType as CategoryType] ??
                          v.meta.categoryType}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                  <div className={!v.hasCategory ? "opacity-50 pointer-events-none" : ""}>
                    <ProjectedInput
                      categoryName={row.category}
                      value={row.projected}
                      onChange={(val) => {
                        // Hard cap: a quarter's Projected may never exceed its
                        // annual Goal (1 YR) Projected. Reject the edit outright
                        // when the new value resolves above the goal, so an
                        // over-goal value never enters form state — and therefore
                        // never autosaves (PUT /api/opsp). The red "Exceeds Goal"
                        // hint below stays as a safety net for data that loaded
                        // over-goal (e.g. a goal lowered after the action was set).
                        if (exceedsGoalProjected(row.category, val, goalRows)) {
                          // Surface a message so the rejection isn't silent —
                          // tell the user the max (the Goal 1 YR value) allowed.
                          setCapWarning({
                            row: i,
                            max: v.goalForRow?.projected?.trim() || String(v.goalProjectedVal ?? ""),
                          });
                          return;
                        }
                        // Valid entry — clear any stale cap warning on this row.
                        setCapWarning((w) => (w?.row === i ? null : w));
                        const next = [...rows];
                        // Auto-fill 3 month cells based on the category's
                        // breakdownType when Projected is entered.
                        const autofill = breakdownProjected(row.category, val, mCols.length);
                        const mPatch: Partial<ActionRow> = {};
                        if (autofill) {
                          mCols.forEach((k, idx) => {
                            (mPatch as Record<string, string>)[k as string] = autofill[idx] ?? "";
                          });
                        }
                        next[i] = { ...next[i], projected: val, ...mPatch };
                        onChange(next);
                      }}
                    />
                    {/* Parent Goal (1 YR.) hint — looked up by category name
                        (see rowValidations.goalForRow) so it works regardless
                        of whether the Action row sits at the same index as
                        its matching Goal row. */}
                    {v.goalForRow && v.goalForRow.projected.trim() && (
                      <p
                        className="text-[10px] text-gray-400 mt-0.5 truncate"
                        title={`Goal (1 YR): ${v.goalForRow.projected}`}
                      >
                        Goal: {v.goalForRow.projected}
                      </p>
                    )}
                    {/* Goal-exceeded validation — Quarter Projected must not
                        exceed the annual Goal Projected. Applies uniformly
                        to every categoryType including Standalone. */}
                    {v.exceedsGoal && (
                      <p className="text-[10px] text-red-500 mt-0.5 truncate font-medium">
                        Exceeds Goal (1 YR): {v.goalForRow?.projected}
                      </p>
                    )}
                    {/* Rejected-entry feedback — fires the moment the user tries
                        to type a Projected above the Goal (1 YR). The value is
                        hard-blocked (never committed), so this message is the
                        only signal; hidden once exceedsGoal already covers a
                        loaded over-goal value to avoid a duplicate line. */}
                    {capWarning?.row === i && !v.exceedsGoal && (
                      <p className="text-[10px] text-red-500 mt-0.5 truncate font-medium">
                        Can&apos;t exceed Goal (1 YR): {capWarning.max}
                      </p>
                    )}
                    {/* Required-field: a selected category must have a
                        Projected value entered. */}
                    {v.missingProjected && (
                      <p className="text-[10px] text-red-500 mt-0.5 truncate font-medium">
                        Projected value is required
                      </p>
                    )}
                  </div>
                  {mCols.map((k) => {
                    const disabled = !v.hasCategory || !v.hasProjected;
                    const currency = v.meta?.currency ?? "USD";
                    const availScales = isCurrency ? getScaleAbbrs(currency) : [];
                    // Standalone always uses the dropdown — breakdownType no
                    // longer gates this (Standalone is treated as Automatic
                    // throughout). See StandaloneSelect + breakdownProjected.
                    const isStandalone = v.meta?.categoryType === "Standalone";
                    if (isStandalone) {
                      return (
                        <StandaloneSelect
                          key={k}
                          value={String(row[k] ?? "")}
                          projected={row.projected}
                          disabled={disabled}
                          onChange={(val) => {
                            const next = [...rows];
                            next[i] = { ...next[i], [k]: val };
                            onChange(next);
                          }}
                        />
                      );
                    }
                    const { num: fieldNum, scale: fieldScale } = isCurrency
                      ? parseProjectedValue(String(row[k] ?? ""), currency)
                      : { num: String(row[k] ?? ""), scale: "" };
                    // Per-cell error state — paints a red border + red focus
                    // ring on the offending Month cell so the user sees at a
                    // glance which input breaks the rule (over-Projected or
                    // monotonic). The hover tooltip names the specific rule.
                    const cellIdx = mCols.indexOf(k);
                    const cellOverProjected = v.cellsOverProjected[cellIdx];
                    const cellMonotonicViolation = v.monotonicViolations[cellIdx];
                    const cellHasError = cellOverProjected || cellMonotonicViolation;
                    let cellErrorTitle: string | undefined;
                    if (cellOverProjected) {
                      cellErrorTitle = `Value cannot exceed Projected (${row.projected})`;
                    } else if (cellMonotonicViolation) {
                      let prevIdx = -1;
                      for (let j = cellIdx - 1; j >= 0; j--) {
                        if (v.mValues[j] > 0) { prevIdx = j; break; }
                      }
                      if (prevIdx >= 0) {
                        cellErrorTitle = `Month ${cellIdx + 1} value must be greater than or equal to Month ${prevIdx + 1} value`;
                      }
                    }
                    return (
                      <div
                        key={k}
                        title={cellErrorTitle}
                        className={`flex items-center border rounded bg-white overflow-hidden ${
                          cellHasError
                            ? "border-red-400 focus-within:ring-1 focus-within:ring-red-400"
                            : "border-gray-200"
                        } ${disabled ? "opacity-50 pointer-events-none bg-gray-50" : ""}`}
                      >
                        {isCurrency && symbol && (
                          <span className="pl-2 text-gray-500 text-xs select-none flex-shrink-0">{symbol}</span>
                        )}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={isCurrency ? fieldNum : String(row[k] ?? "")}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = [...rows];
                            // Strip non-numeric chars so cells like "6.6fgdgf7" can't land in state.
                            const cleaned = sanitizeNumericInput(e.target.value);
                            const val = isCurrency ? combineProjectedValue(cleaned, fieldScale) : cleaned;
                            const editedIdx = mCols.indexOf(k);
                            const currentValues = mCols.map((kk) => String(row[kk] ?? ""));
                            const rebalanced = redistributeOnCellEdit({
                              categoryName: row.category,
                              projected: row.projected,
                              values: currentValues,
                              edited: editedIdx,
                              newVal: val,
                            });
                            if (rebalanced) {
                              const patch: Partial<ActionRow> = {};
                              mCols.forEach((kk, idx) => {
                                (patch as Record<string, string>)[kk as string] = rebalanced[idx];
                              });
                              next[i] = { ...next[i], ...patch };
                            } else {
                              next[i] = { ...next[i], [k]: val };
                            }
                            onChange(next);
                          }}
                          placeholder={mPlaceholder}
                          className={`flex-1 min-w-0 w-0 bg-transparent focus:outline-none placeholder-gray-400 text-sm text-gray-700 text-right ${
                            isCurrency && symbol ? "px-1 py-1.5" : isPct ? "pl-2 pr-1 py-1.5" : "px-2 py-1.5"
                          }`}
                        />
                        {isCurrency && (
                          <select
                            value={fieldScale || "-"}
                            disabled={disabled}
                            onChange={(e) => {
                              const next = [...rows];
                              next[i] = { ...next[i], [k]: combineProjectedValue(fieldNum, e.target.value) };
                              onChange(next);
                            }}
                            className="w-[40px] flex-shrink-0 px-0.5 py-1.5 text-xs text-gray-600 bg-gray-50 border-l border-gray-200 focus:outline-none cursor-pointer"
                            title="Scale"
                          >
                            {availScales.map((abbr) => (
                              <option key={abbr} value={abbr}>{abbr}</option>
                            ))}
                          </select>
                        )}
                        {isPct && (
                          <span className="pr-2 pl-0.5 text-gray-500 text-sm flex-shrink-0 select-none">%</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Compact validation bar ── */}
                {v.hasProjected && v.hasAnyM && (
                  <ValidationBar
                    effective={v.balance.effective}
                    projected={v.projectedVal!}
                    categoryName={row.category}
                    mode={v.balance.mode}
                  />
                )}
                {/* Required-field: a selected category with Projected
                    entered must also have a Month breakdown. */}
                {v.missingBreakdown && (
                  <p className="text-[10px] text-red-500 pl-1 pt-0.5 font-medium">
                    Monthly breakdown is required
                  </p>
                )}
                {/* Per-cell over-Projected error — fires for Cumulative +
                    CumulativeTillEnd when any single month exceeds Projected. */}
                {v.hasCellOverProjected && (
                  <p className="text-[10px] text-red-500 pl-1 pt-0.5 font-medium">
                    Month value cannot exceed Projected ({row.projected})
                  </p>
                )}
                {/* Monotonic error (CumulativeTillEnd only) — running totals
                    can't dip below an earlier filled month. One line per
                    violation, naming the exact months so the user knows
                    which cell to fix. */}
                {v.hasMonotonicViolation && v.monotonicViolations.map((violated, idx) => {
                  if (!violated) return null;
                  let prevIdx = -1;
                  for (let j = idx - 1; j >= 0; j--) {
                    if (v.mValues[j] > 0) { prevIdx = j; break; }
                  }
                  if (prevIdx < 0) return null;
                  return (
                    <p
                      key={`mono-${idx}`}
                      className="text-[10px] text-red-500 pl-1 pt-0.5 font-medium"
                    >
                      Month {idx + 1} value must be greater than or equal to Month {prevIdx + 1} value
                    </p>
                  );
                })}
                {/* Exit-not-reached (CumulativeTillEnd) — the last filled
                    month must reach Projected to mark the running total as
                    "exited". Names the actual last-filled month + value so
                    the user knows which cell to bump up. */}
                {v.lastBelowProjected && v.lastFilledMonthIndex >= 0 && (
                  <p className="text-[10px] text-red-500 pl-1 pt-0.5 font-medium">
                    Month {v.lastFilledMonthIndex + 1} value ({v.mValues[v.lastFilledMonthIndex]}) must reach Projected ({row.projected})
                  </p>
                )}
              </div>
            );
          })}

          {/* Helper text */}
          <p className="text-xs text-gray-400 mt-3">
            Enter monthly values manually. Monthly totals must match Projected.
          </p>

          <div className="flex items-center justify-end gap-3 mt-5">
            {!readOnly && hasAnyMissingProjected && (
              <span className="text-xs text-red-500 font-medium">Projected value required</span>
            )}
            {!readOnly && hasAnyMissingBreakdown && (
              <span className="text-xs text-red-500 font-medium">Monthly breakdown required</span>
            )}
            {!readOnly && hasAnyGenericUnbalance && (
              <span className="text-xs text-red-500 font-medium">Projected breakdown doesn&apos;t match</span>
            )}
            {!readOnly && hasAnyLastBelowProjected && (
              <span className="text-xs text-red-500 font-medium">Last month must reach Projected</span>
            )}
            {!readOnly && hasAnyExceedsGoal && (
              <span className="text-xs text-red-500 font-medium">Projected exceeds Goal (1 YR)</span>
            )}
            {!readOnly && hasAnyCellOverProjected && (
              <span className="text-xs text-red-500 font-medium">Month value exceeds Projected</span>
            )}
            {!readOnly && hasAnyMonotonicViolation && (
              <span className="text-xs text-red-500 font-medium">Month values must not decrease</span>
            )}
            <button
              onClick={onClose}
              disabled={!readOnly && (hasAnyUnbalanced || hasAnyExceedsGoal || hasAnyCellOverProjected || hasAnyMonotonicViolation || hasAnyMissingProjected || hasAnyMissingBreakdown || hasAnyLastBelowProjected)}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                !readOnly && (hasAnyUnbalanced || hasAnyExceedsGoal || hasAnyCellOverProjected || hasAnyMonotonicViolation || hasAnyMissingProjected || hasAnyMissingBreakdown || hasAnyLastBelowProjected)
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : readOnly
                    ? "bg-gray-600 text-white hover:bg-gray-700"
                    : "bg-accent-600 text-white hover:bg-accent-700"
              }`}
            >
              {readOnly ? "Close" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RocksModal({
  open,
  onClose,
  rows,
  onChange,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  rows: RockRow[];
  onChange: (r: RockRow[]) => void;
  readOnly?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <p className="text-base font-bold text-gray-900 uppercase tracking-wide">
              ROCKS
            </p>
            <p className="text-xs text-gray-500">
              Quarterly Priorities
              {rows.filter((r) => r.desc.trim() && !r.owner).length > 0 && (
                <span className="text-red-600 font-medium ml-1">
                  ({rows.filter((r) => r.desc.trim() && !r.owner).length} missing owner)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`px-6 pb-6 overflow-y-auto flex-1 ${readOnly ? "opsp-finalized" : ""}`}>
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500 pb-2 border-b border-gray-200 mb-2">
            <span className="w-8 flex-shrink-0 text-center">#</span>
            <span className="flex-1">Quarterly Priorities</span>
            <span className="w-40 flex-shrink-0">Who</span>
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex items-start gap-3 py-2 border-b border-gray-100"
            >
              <span className="w-8 flex-shrink-0 text-center text-xs text-gray-400 pt-2">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="relative w-full">
                  <textarea
                    value={row.desc}
                    placeholder="Quarterly Priority"
                    maxLength={75}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...next[i], desc: e.target.value.slice(0, 75) };
                      onChange(next);
                    }}
                    rows={1}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = el.scrollHeight + "px";
                    }}
                    className="w-full border border-gray-200 rounded px-3 py-2 pb-5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white resize-none overflow-hidden"
                  />
                  <span className={`pointer-events-none absolute bottom-1 right-2 text-[10px] tabular-nums ${row.desc.length >= 75 ? "text-red-600 font-semibold" : "text-gray-400"}`}>{row.desc.length}/75</span>
                </div>
              </div>
              <div className="relative w-40 flex-shrink-0 pt-0.5">
                <OwnerSelect
                  value={row.owner}
                  onChange={(v) => {
                    const next = [...rows];
                    next[i] = { ...next[i], owner: v };
                    onChange(next);
                  }}
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end mt-5">
            <button
              onClick={onClose}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                readOnly
                  ? "bg-gray-600 text-white hover:bg-gray-700"
                  : "bg-accent-600 text-white hover:bg-accent-700"
              }`}
            >
              {readOnly ? "Close" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function KeyThrustsModal({
  open,
  onClose,
  rows,
  onChange,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  rows: ThrustRow[];
  onChange: (r: ThrustRow[]) => void;
  readOnly?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <p className="text-base font-bold text-gray-900 uppercase tracking-wide">
              KEY THRUSTS / CAPABILITIES
            </p>
            <p className="text-xs text-gray-500">3–5 Year Priorities</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`px-6 pb-6 overflow-y-auto flex-1 ${readOnly ? "opsp-finalized" : ""}`}>
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500 pb-2 border-b border-gray-200 mb-2">
            <span className="w-8 flex-shrink-0 text-center">#</span>
            <span className="flex-1">Capability</span>
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex items-start gap-3 py-2 border-b border-gray-100"
            >
              <span className="w-8 flex-shrink-0 text-center text-xs text-gray-400 pt-2">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="relative w-full">
                  <textarea
                    value={row.desc}
                    placeholder="Capability"
                    maxLength={70}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...next[i], desc: e.target.value.slice(0, 70) };
                      onChange(next);
                    }}
                    rows={1}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = el.scrollHeight + "px";
                    }}
                    className="w-full border border-gray-200 rounded px-3 py-2 pb-5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white resize-none overflow-hidden"
                  />
                  <span className={`pointer-events-none absolute bottom-1 right-2 text-[10px] tabular-nums ${row.desc.length >= 70 ? "text-red-600 font-semibold" : "text-gray-400"}`}>{row.desc.length}/70</span>
                </div>
              </div>
            </div>
          ))}
          <div className="flex justify-end mt-5">
            <button
              onClick={onClose}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                readOnly
                  ? "bg-gray-600 text-white hover:bg-gray-700"
                  : "bg-accent-600 text-white hover:bg-accent-700"
              }`}
            >
              {readOnly ? "Close" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function KeyInitiativesModal({
  open,
  onClose,
  rows,
  onChange,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  rows: KeyInitiativeRow[];
  onChange: (r: KeyInitiativeRow[]) => void;
  readOnly?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <p className="text-base font-bold text-gray-900 uppercase tracking-wide">
              KEY INITIATIVES
            </p>
            <p className="text-xs text-gray-500">1 Year Priorities</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`px-6 pb-6 overflow-y-auto flex-1 ${readOnly ? "opsp-finalized" : ""}`}>
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500 pb-2 border-b border-gray-200 mb-2">
            <span className="w-8 flex-shrink-0 text-center">#</span>
            <span className="flex-1">Initiative</span>
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex items-start gap-3 py-2 border-b border-gray-100"
            >
              <span className="w-8 flex-shrink-0 text-center text-xs text-gray-400 pt-2">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="relative w-full">
                  <textarea
                    value={row.desc}
                    placeholder="Initiative"
                    maxLength={70}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...next[i], desc: e.target.value.slice(0, 70) };
                      onChange(next);
                    }}
                    rows={1}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = el.scrollHeight + "px";
                    }}
                    className="w-full border border-gray-200 rounded px-3 py-2 pb-5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white resize-none overflow-hidden"
                  />
                  <span className={`pointer-events-none absolute bottom-1 right-2 text-[10px] tabular-nums ${row.desc.length >= 70 ? "text-red-600 font-semibold" : "text-gray-400"}`}>{row.desc.length}/70</span>
                </div>
              </div>
            </div>
          ))}
          <div className="flex justify-end mt-5">
            <button
              onClick={onClose}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                readOnly
                  ? "bg-gray-600 text-white hover:bg-gray-700"
                  : "bg-accent-600 text-white hover:bg-accent-700"
              }`}
            >
              {readOnly ? "Close" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AccountabilityModal({
  open,
  onClose,
  rows,
  onChange,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  rows: KPIAcctRow[];
  onChange: (r: KPIAcctRow[]) => void;
  readOnly?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <p className="text-base font-bold text-gray-900 uppercase tracking-wide">
              YOUR ACCOUNTABILITY
            </p>
            <p className="text-xs text-gray-500">(Who/When)</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`px-6 pb-6 overflow-y-auto flex-1 ${readOnly ? "opsp-finalized" : ""}`}>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left w-12">S.no.</th>
                  <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left">KPIs</th>
                  <th className="border-b border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left">Goal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-200 last:border-b-0">
                    <td className="border-r border-gray-200 px-3 py-2.5 text-xs text-gray-400 text-center w-12">
                      {String(i + 1).padStart(2, "0")}
                    </td>
                    <td className="border-r border-gray-200 px-3 py-1.5 relative">
                      <input
                        value={row.kpi}
                        maxLength={30}
                        onChange={e => {
                          const next = [...rows];
                          next[i] = { ...next[i], kpi: e.target.value.slice(0, 30) };
                          onChange(next);
                        }}
                        placeholder="Input text"
                        className="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1 pr-10"
                      />
                      <span className={`pointer-events-none absolute bottom-1 right-2 text-[10px] tabular-nums ${row.kpi.length >= 30 ? "text-red-600 font-semibold" : "text-gray-400"}`}>{row.kpi.length}/30</span>
                    </td>
                    <td className="px-3 py-1.5 relative">
                      <input
                        value={row.goal}
                        maxLength={20}
                        onChange={e => {
                          const next = [...rows];
                          next[i] = { ...next[i], goal: e.target.value.slice(0, 20) };
                          onChange(next);
                        }}
                        placeholder="Input text"
                        className="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1 pr-10"
                      />
                      <span className={`pointer-events-none absolute bottom-1 right-2 text-[10px] tabular-nums ${row.goal.length >= 20 ? "text-red-600 font-semibold" : "text-gray-400"}`}>{row.goal.length}/20</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-5">
            <button
              onClick={onClose}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                readOnly
                  ? "bg-gray-600 text-white hover:bg-gray-700"
                  : "bg-accent-600 text-white hover:bg-accent-700"
              }`}
            >
              {readOnly ? "Close" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuarterlyPrioritiesModal({
  open,
  onClose,
  rows,
  onChange,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  rows: QPriorRow[];
  onChange: (r: QPriorRow[]) => void;
  readOnly?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <p className="text-base font-bold text-gray-900 uppercase tracking-wide">
              QUARTERLY PRIORITIES
            </p>
            <p className="text-xs text-gray-500">(Who/When)</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`px-6 pb-6 overflow-y-auto flex-1 ${readOnly ? "opsp-finalized" : ""}`}>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left w-12">S.no.</th>
                  <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left">Quarterly Priorities</th>
                  <th className="border-b border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left w-40">Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-200 last:border-b-0">
                    <td className="border-r border-gray-200 px-3 py-2.5 text-xs text-gray-400 text-center w-12">
                      {String(i + 1).padStart(2, "0")}
                    </td>
                    <td className="border-r border-gray-200 px-3 py-1.5 relative">
                      <input
                        value={row.priority}
                        maxLength={70}
                        onChange={e => {
                          const next = [...rows];
                          next[i] = { ...next[i], priority: e.target.value.slice(0, 70) };
                          onChange(next);
                        }}
                        placeholder="Input text"
                        className="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1 pr-10"
                      />
                      <span className={`pointer-events-none absolute bottom-1 right-2 text-[10px] tabular-nums ${row.priority.length >= 70 ? "text-red-600 font-semibold" : "text-gray-400"}`}>{row.priority.length}/70</span>
                    </td>
                    <td className="px-3 py-1.5 w-40">
                      <div className="relative flex items-center gap-2 cursor-pointer">
                        <span className={`flex-1 text-xs truncate ${row.dueDate ? "text-gray-700" : "text-gray-400"}`}>
                          {row.dueDate
                            ? new Date(row.dueDate + "T00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                            : "Due Date"}
                        </span>
                        <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <input
                          type="date"
                          value={row.dueDate}
                          onChange={e => {
                            const next = [...rows];
                            next[i] = { ...next[i], dueDate: e.target.value };
                            onChange(next);
                          }}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-5">
            <button
              onClick={onClose}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                readOnly
                  ? "bg-gray-600 text-white hover:bg-gray-700"
                  : "bg-accent-600 text-white hover:bg-accent-700"
              }`}
            >
              {readOnly ? "Close" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
