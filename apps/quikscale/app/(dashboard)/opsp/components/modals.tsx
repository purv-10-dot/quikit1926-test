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

import { X, AlertTriangle, Lock, Check, Calendar } from "lucide-react";
import { FInput } from "./RichEditor";
import { CategorySelect, ProjectedInput, parseProjectedValue, combineProjectedValue, getScaleAbbrs, displayCategory, catMetaCache } from "./category";
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
  if (!options?.force && meta.breakdownType !== "Automatic") return null;

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
 * row, rebalance the OTHER period cells so the sum still equals Projected.
 *
 * Rebalance only applies when:
 *   - `breakdownType === "Automatic"` (Manual rows leave cells alone)
 *   - `categoryType === "Cumulative"` (Standalone/TillEnd have different semantics)
 *
 * Operates on the displayed numeric value (same as `breakdownProjected`)
 * so currency rows preserve the Projected's scale across all cells.
 *
 * Returns a new `string[]` of length `values.length`, OR `null` when no
 * rebalance applies (then the caller should write only the edited cell).
 */
function redistributeOnCellEdit(opts: {
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

  const out = [...opts.values];
  // Write the edited cell with the formatted value (preserves scale on currency).
  out[opts.edited] = formatVal(editedDisplayed);

  // Remainder to distribute across the other cells (clamped to 0 if user
  // typed > projected).
  const remainder = Math.max(0, projDisplayed - editedDisplayed);
  const otherIdxs: number[] = [];
  for (let i = 0; i < opts.values.length; i++) if (i !== opts.edited) otherIdxs.push(i);
  const n = otherIdxs.length;
  if (n === 0) return out;

  if (isWhole) {
    const base = Math.floor(remainder / n);
    const lastResidue = Math.round(remainder - base * (n - 1));
    otherIdxs.forEach((origIdx, j) => {
      const v = j === n - 1 ? lastResidue : base;
      out[origIdx] = formatVal(v);
    });
  } else {
    const base = Math.round((remainder / n) * 100) / 100;
    const lastResidue = Math.round((remainder - base * (n - 1)) * 100) / 100;
    otherIdxs.forEach((origIdx, j) => {
      const v = j === n - 1 ? lastResidue : base;
      out[origIdx] = formatVal(v);
    });
  }
  return out;
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
 * Cell renderer for Manual + Standalone rows.
 *
 * Standalone semantics say every period cell holds the Projected value
 * (rendered as-is, preserving currency scale suffix). Manual fill mode
 * shouldn't let the user free-type into the cell — instead they pick from
 * a 3-option dropdown:
 *   - "Select…" (empty)
 *   - the Projected value (verbatim, including scale like "1 L")
 *   - "0"
 *
 * Picks resolve to either the projected string or "0" — no parsing or
 * rebalance — and the parent stores them as-is.
 */
function StandaloneManualSelect({
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
  // The select holds the displayed pick label so React renders the right option.
  const selectValue =
    valTrim === "" ? "" : valTrim === "0" ? "0" : projTrim;
  return (
    <div className={`flex items-center border border-gray-200 rounded bg-white focus-within:ring-1 focus-within:ring-accent-400 overflow-hidden ${disabled ? "opacity-50 pointer-events-none bg-gray-50" : ""}`}>
      <select
        value={selectValue}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 w-0 bg-transparent focus:outline-none text-sm text-gray-700 px-2 py-1.5 cursor-pointer"
      >
        <option value="">Select…</option>
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
                    const isManualStandalone =
                      v.meta?.breakdownType === "Manual" && v.meta?.categoryType === "Standalone";
                    if (isManualStandalone) {
                      return (
                        <StandaloneManualSelect
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
                          value={isCurrency ? fieldNum : String(row[k] ?? "")}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = [...rows];
                            const val = isCurrency ? combineProjectedValue(e.target.value, fieldScale) : e.target.value;
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
                    const isManualStandalone =
                      v.meta?.breakdownType === "Manual" && v.meta?.categoryType === "Standalone";

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

                    if (isManualStandalone) {
                      return wrap(
                        <StandaloneManualSelect
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
                          value={isCurrency ? fieldNum : String(row[k] ?? "")}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = [...rows];
                            const val = isCurrency ? combineProjectedValue(e.target.value, fieldScale) : e.target.value;
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
  if (!open) return null;
  const mCols: (keyof ActionRow)[] = ["m1", "m2", "m3"];
  // Columns: Category | Category Type | Projected | M1 | M2 | M3
  const gridCols = "2fr 1fr 1fr 1fr 1fr 1fr";
  const qKey = fiscalQuarter.toLowerCase() as keyof GoalRow; // "q1" | "q2" | "q3" | "q4"

  // ── Pre-compute per-row validation ──
  const rowValidations = rows.map((row, i) => {
    const meta = catMetaCache.get(row.category);
    const hasCategory = !!row.category.trim();
    const projectedVal = resolveProjected(row.category, row.projected);
    const hasProjected = projectedVal !== null && projectedVal > 0;
    const mValues = mCols.map(k => resolveProjected(row.category, String(row[k] ?? "")) ?? 0);
    const hasAnyM = mValues.some(v => v > 0);
    const hasAllM = mCols.every(k => String(row[k] ?? "").trim() !== "");
    const balance = computeRowBalance(row.category, mValues, projectedVal ?? 0);

    // Check if inherited from Goals
    const g = i < goalRows.length ? goalRows[i] : null;
    const gQVal = g ? String(g[qKey] ?? "").trim() : "";
    const isInherited = !!(g && g.category.trim() && g.projected.trim() && gQVal);

    const noMFilled = hasCategory && !hasAnyM;
    const isMatched = hasProjected && hasAllM && balance.isBalanced;
    const isOver = hasProjected && balance.isOver;
    const isUnder = hasProjected && hasAnyM && !hasAllM && !balance.isBalanced && !balance.isOver;
    const isMismatch = hasProjected && hasAllM && !balance.isBalanced;
    const hasError = noMFilled || isOver || isUnder || isMismatch;
    const isUnbalanced = hasProjected && hasAnyM && !balance.isBalanced;

    return { meta, hasCategory, projectedVal, hasProjected, mValues, balance, hasAnyM, hasAllM, noMFilled, isMatched, isOver, isUnder, isMismatch, hasError, isUnbalanced, isInherited };
  });

  const hasAnyUnbalanced = rowValidations.some(v => v.isUnbalanced);

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
                  {/* Category + Projected are always editable in the modal.
                      The earlier "inherited from Goals → lock" UI was removed
                      per spec — users can change category/projected on Action
                      rows even when they were seeded from a Goal. */}
                  <CategorySelect
                    value={row.category}
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
                    {/* Parent Goal (1 YR.) hint — small grey label so the
                        user knows the upstream Goal value while entering
                        Action's Projected. Shows only when the Goal at the
                        same row index has a matching category and a filled
                        projected. */}
                    {(() => {
                      const g = i < goalRows.length ? goalRows[i] : null;
                      if (!g || !g.category.trim() || !g.projected.trim()) return null;
                      if (g.category !== row.category) return null;
                      return (
                        <p
                          className="text-[10px] text-gray-400 mt-0.5 truncate"
                          title={`Goal (1 YR): ${g.projected}`}
                        >
                          Goal: {g.projected}
                        </p>
                      );
                    })()}
                  </div>
                  {mCols.map((k) => {
                    const disabled = !v.hasCategory || !v.hasProjected;
                    const currency = v.meta?.currency ?? "USD";
                    const availScales = isCurrency ? getScaleAbbrs(currency) : [];
                    const isManualStandalone =
                      v.meta?.breakdownType === "Manual" && v.meta?.categoryType === "Standalone";
                    if (isManualStandalone) {
                      return (
                        <StandaloneManualSelect
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
                          value={isCurrency ? fieldNum : String(row[k] ?? "")}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = [...rows];
                            const val = isCurrency ? combineProjectedValue(e.target.value, fieldScale) : e.target.value;
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
              </div>
            );
          })}

          {/* Helper text */}
          <p className="text-xs text-gray-400 mt-3">
            Enter monthly values manually. Monthly totals must match Projected.
          </p>

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
