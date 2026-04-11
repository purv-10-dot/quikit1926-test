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
 *   - `TargetsModal` — 5-year targets with fiscal-year column labels
 *   - `GoalsModal`   — 1-year goals broken down Q1-Q4
 *   - `RocksModal`   — 5-row quarterly priorities with owner picker
 */

import { X } from "lucide-react";
import { FInput } from "./RichEditor";
import { CategorySelect, ProjectedInput } from "./category";
import { OwnerSelect, WithTooltip } from "./pickers";
import type { TargetRow, GoalRow, RockRow } from "../types";

export function TargetsModal({
  open,
  onClose,
  rows,
  onChange,
  targetYears,
  fiscalYear,
  fiscalYearStart,
}: {
  open: boolean;
  onClose: () => void;
  rows: TargetRow[];
  onChange: (r: TargetRow[]) => void;
  targetYears: number;
  fiscalYear: number;
  fiscalYearStart: number;
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

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
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
        <div className="px-6 pb-6 overflow-y-auto flex-1">
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
          {rows.map((row, i) => (
            <div
              key={i}
              style={gridStyle}
              className="items-start py-2 border-b border-gray-100"
            >
              <CategorySelect
                value={row.category}
                onChange={(v) => {
                  const next = [...rows];
                  next[i] = { ...next[i], category: v };
                  onChange(next);
                }}
              />
              <ProjectedInput
                categoryName={row.category}
                value={row.projected}
                onChange={(v) => {
                  const next = [...rows];
                  next[i] = { ...next[i], projected: v };
                  onChange(next);
                }}
              />
              {keys.map((k) => (
                <FInput
                  key={k}
                  value={String(row[k] ?? "")}
                  onChange={(v) => {
                    const next = [...rows];
                    next[i] = { ...next[i], [k]: v };
                    onChange(next);
                  }}
                  placeholder="Number"
                />
              ))}
            </div>
          ))}
          <div className="flex justify-end mt-5">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700"
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GoalsModal({
  open,
  onClose,
  rows,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  rows: GoalRow[];
  onChange: (r: GoalRow[]) => void;
}) {
  if (!open) return null;
  const qCols: (keyof GoalRow)[] = ["q1", "q2", "q3", "q4"];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
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
        <div className="px-6 pb-6 overflow-y-auto flex-1">
          <div
            style={{
              display: "grid",
              gap: "12px",
              gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
            }}
            className="text-xs font-medium text-gray-500 pb-2 border-b border-gray-200 mb-2"
          >
            <span>Category</span>
            <span>Projected</span>
            {["Quarter 1", "Quarter 2", "Quarter 3", "Quarter 4"].map((q) => (
              <span key={q}>{q}</span>
            ))}
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gap: "12px",
                gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
              }}
              className="items-start py-2 border-b border-gray-100"
            >
              <CategorySelect
                value={row.category}
                onChange={(v) => {
                  const next = [...rows];
                  next[i] = { ...next[i], category: v };
                  onChange(next);
                }}
              />
              <ProjectedInput
                categoryName={row.category}
                value={row.projected}
                onChange={(v) => {
                  const next = [...rows];
                  next[i] = { ...next[i], projected: v };
                  onChange(next);
                }}
              />
              {qCols.map((k) => (
                <FInput
                  key={k}
                  value={row[k]}
                  onChange={(v) => {
                    const next = [...rows];
                    next[i] = { ...next[i], [k]: v };
                    onChange(next);
                  }}
                  placeholder="Number"
                />
              ))}
            </div>
          ))}
          <div className="flex justify-end mt-5">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700"
            >
              Submit
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
}: {
  open: boolean;
  onClose: () => void;
  rows: RockRow[];
  onChange: (r: RockRow[]) => void;
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
        <div className="px-6 pb-6 overflow-y-auto flex-1">
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500 pb-2 border-b border-gray-200 mb-2">
            <span className="w-8 flex-shrink-0 text-center">#</span>
            <span className="flex-1">Quarterly Priorities</span>
            <span className="w-40 flex-shrink-0">Who</span>
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-2 border-b border-gray-100"
            >
              <span className="w-8 flex-shrink-0 text-center text-xs text-gray-400">
                {String(i + 1).padStart(2, "0")}
              </span>
              <WithTooltip content={row.desc} className="relative flex-1 min-w-0">
                <FInput
                  value={row.desc}
                  placeholder="Quarterly Priority"
                  onChange={(v) => {
                    const next = [...rows];
                    next[i] = { ...next[i], desc: v };
                    onChange(next);
                  }}
                />
              </WithTooltip>
              <div className="relative w-40 flex-shrink-0">
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
              className="px-6 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700"
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
