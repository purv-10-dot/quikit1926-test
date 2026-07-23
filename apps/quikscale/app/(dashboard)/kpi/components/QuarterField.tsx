"use client";

/**
 * Quarter field for the KPI Add/Edit forms — the single source of truth shared
 * by KPIModal (create + edit team) and LogModal's Edit tab (edit individual).
 *
 * Behaviour is gated by the org's "Add Past Week Data" flag (`canAddPastWeek`),
 * which the caller resolves and passes as `editable`:
 *   - editable === false → read-only box (default). Quarter is immutable.
 *   - editable === true  → Q1–Q4 dropdown so power users can point a KPI at a
 *     different quarter (e.g. backfill a prior quarter). The fiscal year is
 *     fixed to the page's selected year — only the quarter changes.
 *
 * The caller owns the surrounding grid cell; this renders label + field + error.
 */

import { DropdownPicker } from "@quikit/ui";
import { ALL_QUARTERS, fiscalYearLabel } from "@/lib/utils/fiscal";

interface QuarterFieldProps {
  /** Fiscal year the quarter belongs to (fixed — never changed here). */
  year: number;
  /** Currently selected quarter ("Q1".."Q4"). */
  quarter: string;
  /** When true, render an editable dropdown; otherwise a read-only box. */
  editable: boolean;
  /** Called with the newly-selected quarter. Only used when `editable`. */
  onChange?: (quarter: string) => void;
  /** Inline validation error text. */
  error?: string;
  /** Show the required-field asterisk (matches the create form). */
  required?: boolean;
}

export function QuarterField({ year, quarter, editable, onChange, error, required }: QuarterFieldProps) {
  const yearLabel = Number.isFinite(year) ? fiscalYearLabel(year) : "";

  return (
    <>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        Quarter {required && <span className="text-red-500">*</span>}
      </label>
      {editable ? (
        <DropdownPicker
          value={quarter}
          onChange={(v) => onChange?.(v)}
          options={ALL_QUARTERS.map((q) => ({
            value: q,
            label: yearLabel ? `${yearLabel} · ${q}` : q,
          }))}
        />
      ) : (
        <div className="px-3 py-2 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-600">
          {yearLabel ? `${yearLabel} · ${quarter}` : quarter}
        </div>
      )}
      {error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
    </>
  );
}
