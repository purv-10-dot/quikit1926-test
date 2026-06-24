"use client";

/**
 * Year / Quarter picker for the OPSP Review screen — shared by BOTH the full
 * Review mode and the focused critical-only mode, so a critical-only member can
 * switch period too (previously that mode showed a static label).
 *
 * Self-contained: owns its open state + outside-click close. The parent keeps
 * `year`/`quarter` and reacts via `onChange`.
 */

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { fiscalYearLabel } from "@/lib/utils/fiscal";
import { useClickOutside } from "@/lib/hooks/useClickOutside";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

export function ReviewPeriodPicker({
  year,
  quarter,
  onChange,
}: {
  year: number;
  quarter: string;
  /** Fired on either a fiscal-year or a quarter selection. */
  onChange: (year: number, quarter: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  // Five fiscal years centred on the current one (prev .. +3), matching the
  // window the rest of the app's pickers use.
  const fiscalYears = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => current - 1 + i);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors",
          open ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600",
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

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Fiscal Year</p>
            <div className="grid grid-cols-1 gap-1">
              {fiscalYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => onChange(y, quarter)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-lg text-left transition-colors",
                    year === y ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700",
                  )}
                >
                  {fiscalYearLabel(y)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quarter</p>
            <div className="grid grid-cols-4 gap-1">
              {QUARTERS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    onChange(year, q);
                    setOpen(false);
                  }}
                  className={cn(
                    "text-xs px-2 py-1.5 rounded-lg transition-colors",
                    quarter === q ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700 border border-gray-200",
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
