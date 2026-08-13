"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Segmented } from "@quikit/ui";
import { getPeriodLabel, stepAnchorDate, type PeriodView } from "@/lib/utils/periodRange";

export interface DueDateRangeNavProps {
  view: PeriodView;
  onViewChange: (v: PeriodView) => void;
  /** "YYYY-MM-DD" — the day/week/month is anchored on this date. */
  anchorDate: string;
  onAnchorDateChange: (v: string) => void;
}

const VIEW_OPTIONS: { value: PeriodView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "all", label: "All" },
];

export function DueDateRangeNav({ view, onViewChange, anchorDate, onAnchorDateChange }: DueDateRangeNavProps) {
  const label = getPeriodLabel(view, anchorDate);
  const steppable = view !== "all";

  return (
    <div className="flex items-center gap-3">
      <Segmented value={view} onChange={onViewChange} options={VIEW_OPTIONS} />

      <div className="flex items-center gap-0.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md">
        {steppable && (
          <button
            type="button"
            onClick={() => onAnchorDateChange(stepAnchorDate(view, anchorDate, -1))}
            aria-label={`Previous ${view}`}
            className="p-1.5 rounded-l-md hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="min-w-[7.5rem] px-1 text-center font-medium text-gray-700 whitespace-nowrap">
          {label || "All dates"}
        </span>
        {steppable && (
          <button
            type="button"
            onClick={() => onAnchorDateChange(stepAnchorDate(view, anchorDate, 1))}
            aria-label={`Next ${view}`}
            className="p-1.5 rounded-r-md hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="relative">
        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="date"
          value={anchorDate}
          onChange={(e) => onAnchorDateChange(e.target.value)}
          className="pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400"
        />
      </div>
    </div>
  );
}
