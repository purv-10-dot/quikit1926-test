"use client";

import { forwardRef } from "react";
import { fiscalYearLabel } from "@/lib/utils/fiscal";

/**
 * YearQuarterPicker — presentational picker for OPSP year + quarter.
 *
 * This component owns only JSX/markup. All state (open/closed, form state)
 * and side-effects (load-for-period) remain in the parent page so behavior
 * is identical to the original inline implementation.
 */
interface Props {
  year: number;
  setYear: (y: number) => void;
  quarter: string;
  setQuarter: (q: string) => void;
  years: number[];
  /** Whether the dropdown is open. */
  open: boolean;
  /** Toggle the dropdown open/closed. */
  onToggle: () => void;
  /** Return true to disable a year button. */
  isYearDisabled: (y: number) => boolean;
  /** Return true to disable a quarter button. */
  isQuarterDisabled: (q: string) => boolean;
}

export const YearQuarterPicker = forwardRef<HTMLDivElement, Props>(function YearQuarterPicker(
  { year, setYear, quarter, setQuarter, years, open, onToggle, isYearDisabled, isQuarterDisabled },
  ref,
) {
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${open ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"}`}
      >
        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {fiscalYearLabel(year)} · {quarter}
        <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Fiscal Year</p>
            <div className="grid grid-cols-1 gap-1">
              {years.map(y => {
                const isSelected = year === y;
                const isDisabled = isYearDisabled(y);
                return (
                  <button key={y}
                    disabled={isDisabled}
                    onClick={() => { if (!isDisabled) setYear(y); }}
                    className={`text-xs px-3 py-1.5 rounded-lg text-left transition-colors ${
                      isSelected
                        ? "bg-gray-900 text-white"
                        : isDisabled
                          ? "text-gray-300 cursor-not-allowed"
                          : "hover:bg-gray-50 text-gray-700"
                    }`}>
                    {fiscalYearLabel(y)}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quarter</p>
            <div className="grid grid-cols-4 gap-1">
              {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
                const isBeforeStart = isQuarterDisabled(q);
                const isSelected = quarter === q;
                return (
                  <button key={q}
                    disabled={isBeforeStart}
                    onClick={() => { if (!isBeforeStart) setQuarter(q); }}
                    className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${
                      isSelected
                        ? "bg-gray-900 text-white"
                        : isBeforeStart
                          ? "text-gray-300 border border-gray-100 cursor-not-allowed"
                          : "hover:bg-gray-50 text-gray-700 border border-gray-200"
                    }`}>
                    {q}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
