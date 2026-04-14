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
function resolveProjected(categoryName: string, projected: string): number | null {
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
function ValidationBar({ sum, projected, categoryName }: {
  sum: number;
  projected: number;
  categoryName: string;
}) {
  if (projected <= 0 || sum === 0) return null;

  const pct = Math.min((sum / projected) * 100, 100);
  const isMatched = Math.abs(sum - projected) < 0.01;
  const isOver = sum > projected + 0.01;

  if (isMatched) {
    return (
      <div className="flex items-center gap-1 pl-1 pt-0.5 pb-0.5">
        <Check className="h-3 w-3 text-green-600" />
        <span className="text-[10px] text-green-600 font-medium">Balanced</span>
      </div>
    );
  }

  if (isOver) {
    const overAmt = sum - projected;
    return (
      <div className="flex items-center gap-1 pl-1 pt-0.5 pb-0.5">
        <AlertTriangle className="h-3 w-3 text-red-500" />
        <span className="text-[10px] text-red-600 font-medium">
          Exceeded by {fmtScaled(overAmt, categoryName)}
        </span>
      </div>
    );
  }

  // Under — show progress
  return (
    <div className="pl-1 pt-0.5 pb-0.5 space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-blue-600 font-medium">
          Filled: {fmtScaled(sum, categoryName)} / {fmtScaled(projected, categoryName)}
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
    const yearSum = yearValues.reduce((a, b) => a + b, 0);
    const hasAnyYear = yearValues.some(v => v > 0);
    const hasAllYears = keys.every(k => String(row[k] ?? "").trim() !== "");
    const diff = hasProjected ? projectedVal - yearSum : 0;

    // Error states
    const noYearsFilled = hasCategory && !hasAnyYear; // category selected but no year values
    const isMatched = hasProjected && hasAllYears && Math.abs(diff) < 0.01;
    const isOver = hasProjected && yearSum > projectedVal + 0.01;
    const isUnder = hasProjected && hasAnyYear && !hasAllYears && diff > 0;
    const isMismatch = hasProjected && hasAllYears && Math.abs(diff) >= 0.01;

    const hasError = noYearsFilled || isOver || isUnder || isMismatch;
    // Block submit only when user has started filling AND sum doesn't match
    const isUnbalanced = hasProjected && hasAnyYear && !isMatched;

    return {
      meta, hasCategory, projectedVal, hasProjected,
      yearValues, yearSum, hasAnyYear, hasAllYears, diff,
      noYearsFilled, isMatched, isOver, isUnder, isMismatch, hasError, isUnbalanced,
    };
  });

  const hasAnyUnbalanced = rowValidations.some(v => v.isUnbalanced);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh]">
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
                        next[i] = { ...next[i], projected: val };
                        onChange(next);
                      }}
                    />
                  </div>
                  {keys.map((k) => {
                    const disabled = !v.hasCategory || !v.hasProjected;
                    const currency = v.meta?.currency ?? "USD";
                    const availScales = isCurrency ? getScaleAbbrs(currency) : [];
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
                            next[i] = { ...next[i], [k]: val };
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
                  <ValidationBar sum={v.yearSum} projected={v.projectedVal!} categoryName={row.category} />
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
}: {
  open: boolean;
  onClose: () => void;
  rows: GoalRow[];
  onChange: (r: GoalRow[]) => void;
  targetRows: TargetRow[];
  readOnly?: boolean;
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
    const qSum = qValues.reduce((a, b) => a + b, 0);
    const hasAnyQ = qValues.some(v => v > 0);
    const hasAllQ = qCols.every(k => String(row[k] ?? "").trim() !== "");
    const diff = hasProjected ? projectedVal - qSum : 0;

    // Check if this row is inherited from Targets (rows 0-4 only)
    const t = i < targetRows.length ? targetRows[i] : null;
    const isInherited = !!(t && t.category.trim() && t.projected.trim() && t.y1.trim());

    const noQFilled = hasCategory && !hasAnyQ;
    const isMatched = hasProjected && hasAllQ && Math.abs(diff) < 0.01;
    const isOver = hasProjected && qSum > projectedVal + 0.01;
    const isUnder = hasProjected && hasAnyQ && !hasAllQ && diff > 0;
    const isMismatch = hasProjected && hasAllQ && Math.abs(diff) >= 0.01;
    const hasError = noQFilled || isOver || isUnder || isMismatch;
    const isUnbalanced = hasProjected && hasAnyQ && !isMatched;

    return { meta, hasCategory, projectedVal, hasProjected, qValues, qSum, hasAnyQ, hasAllQ, diff, noQFilled, isMatched, isOver, isUnder, isMismatch, hasError, isUnbalanced, isInherited };
  });

  const hasAnyUnbalanced = rowValidations.some(v => v.isUnbalanced);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh]">
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
                          next[i] = { ...next[i], projected: val };
                          onChange(next);
                        }}
                      />
                    </div>
                  )}
                  {qCols.map((k) => {
                    const disabled = !v.hasCategory || !v.hasProjected;
                    const currency = v.meta?.currency ?? "USD";
                    const availScales = isCurrency ? getScaleAbbrs(currency) : [];
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
                            next[i] = { ...next[i], [k]: val };
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
                      </div>
                    );
                  })}
                </div>

                {/* ── Compact validation bar ── */}
                {v.hasProjected && v.hasAnyQ && (
                  <ValidationBar sum={v.qSum} projected={v.projectedVal!} categoryName={row.category} />
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
  const gridCols = "2fr 1fr 1fr 1fr 1fr";
  const qKey = fiscalQuarter.toLowerCase() as keyof GoalRow; // "q1" | "q2" | "q3" | "q4"

  // ── Pre-compute per-row validation ──
  const rowValidations = rows.map((row, i) => {
    const meta = catMetaCache.get(row.category);
    const hasCategory = !!row.category.trim();
    const projectedVal = resolveProjected(row.category, row.projected);
    const hasProjected = projectedVal !== null && projectedVal > 0;
    const mValues = mCols.map(k => resolveProjected(row.category, String(row[k] ?? "")) ?? 0);
    const mSum = mValues.reduce((a, b) => a + b, 0);
    const hasAnyM = mValues.some(v => v > 0);
    const hasAllM = mCols.every(k => String(row[k] ?? "").trim() !== "");
    const diff = hasProjected ? projectedVal - mSum : 0;

    // Check if inherited from Goals
    const g = i < goalRows.length ? goalRows[i] : null;
    const gQVal = g ? String(g[qKey] ?? "").trim() : "";
    const isInherited = !!(g && g.category.trim() && g.projected.trim() && gQVal);

    const noMFilled = hasCategory && !hasAnyM;
    const isMatched = hasProjected && hasAllM && Math.abs(diff) < 0.01;
    const isOver = hasProjected && mSum > projectedVal + 0.01;
    const isUnder = hasProjected && hasAnyM && !hasAllM && diff > 0;
    const isMismatch = hasProjected && hasAllM && Math.abs(diff) >= 0.01;
    const hasError = noMFilled || isOver || isUnder || isMismatch;
    const isUnbalanced = hasProjected && hasAnyM && !isMatched;

    return { meta, hasCategory, projectedVal, hasProjected, mValues, mSum, hasAnyM, hasAllM, diff, noMFilled, isMatched, isOver, isUnder, isMismatch, hasError, isUnbalanced, isInherited };
  });

  const hasAnyUnbalanced = rowValidations.some(v => v.isUnbalanced);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh]">
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
                  {v.isInherited ? (
                    <InheritedCategory value={row.category} source="Goals" />
                  ) : (
                    <CategorySelect
                      value={row.category}
  
                      onChange={(val) => {
                        const next = [...rows];
                        next[i] = { ...next[i], category: val, projected: "", m1: "", m2: "", m3: "" };
                        onChange(next);
                      }}
                    />
                  )}
                  {v.isInherited ? (
                    <InheritedProjected value={row.projected} categoryName={row.category} source="Goals" />
                  ) : (
                    <div className={!v.hasCategory ? "opacity-50 pointer-events-none" : ""}>
                      <ProjectedInput
                        categoryName={row.category}
                        value={row.projected}
                        onChange={(val) => {
                          const next = [...rows];
                          next[i] = { ...next[i], projected: val };
                          onChange(next);
                        }}
                      />
                    </div>
                  )}
                  {mCols.map((k) => {
                    const disabled = !v.hasCategory || !v.hasProjected;
                    const currency = v.meta?.currency ?? "USD";
                    const availScales = isCurrency ? getScaleAbbrs(currency) : [];
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
                            next[i] = { ...next[i], [k]: val };
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
                  <ValidationBar sum={v.mSum} projected={v.projectedVal!} categoryName={row.category} />
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <p className="text-base font-bold text-gray-900 uppercase tracking-wide">
              ROCKS
            </p>
            <p className="text-xs text-gray-500">Quarterly Priorities</p>
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
                <textarea
                  value={row.desc}
                  placeholder="Quarterly Priority"
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], desc: e.target.value };
                    onChange(next);
                  }}
                  rows={1}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white resize-none overflow-hidden"
                />
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
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
                <textarea
                  value={row.desc}
                  placeholder="Capability"
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], desc: e.target.value };
                    onChange(next);
                  }}
                  rows={1}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white resize-none overflow-hidden"
                />
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
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
                <textarea
                  value={row.desc}
                  placeholder="Initiative"
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], desc: e.target.value };
                    onChange(next);
                  }}
                  rows={1}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white resize-none overflow-hidden"
                />
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
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
                    <td className="border-r border-gray-200 px-3 py-1.5">
                      <input
                        value={row.kpi}
                        onChange={e => {
                          const next = [...rows];
                          next[i] = { ...next[i], kpi: e.target.value };
                          onChange(next);
                        }}
                        placeholder="Input text"
                        className="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={row.goal}
                        onChange={e => {
                          const next = [...rows];
                          next[i] = { ...next[i], goal: e.target.value };
                          onChange(next);
                        }}
                        placeholder="Input text"
                        className="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                      />
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
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
                    <td className="border-r border-gray-200 px-3 py-1.5">
                      <input
                        value={row.priority}
                        onChange={e => {
                          const next = [...rows];
                          next[i] = { ...next[i], priority: e.target.value };
                          onChange(next);
                        }}
                        placeholder="Input text"
                        className="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                      />
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
