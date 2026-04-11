"use client";

/**
 * WeekRow — single-week input row used in KPI LogModal's Updates tab.
 *
 * Extracted from `LogModal.tsx` in R6 so the presentational week editor
 * can be tested in isolation and re-used by other KPI entry surfaces
 * (e.g. Team KPI row editor).
 *
 * Renders:
 *   - Week label + date range + mini progress bar
 *   - Value input (number)
 *   - Notes textarea
 *
 * Owns no state. Locked state disables both inputs and dims the row.
 */

import { weekDateLabel } from "@/lib/utils/fiscal";
import { getColorByPercentage } from "@/lib/utils/colorLogic";

export function WeekRow({
  weekNumber,
  value,
  notes,
  weeklyTarget,
  year,
  quarter,
  onValueChange,
  onNotesChange,
  locked,
  reverse,
}: {
  weekNumber: number;
  value: string;
  notes: string;
  weeklyTarget: number;
  year: number;
  quarter: string;
  onValueChange: (v: string) => void;
  onNotesChange: (n: string) => void;
  locked?: boolean;
  reverse?: boolean;
}) {
  const numVal = parseFloat(value);
  const hasValue = value !== "" && !isNaN(numVal);

  const colorResult = hasValue
    ? getColorByPercentage(numVal, weeklyTarget, true, reverse ?? false)
    : null;
  const barColor = colorResult
    ? colorResult.bg.replace("bg-", "bg-").replace("-600", "-500")
    : "bg-gray-200";

  const lockTitle = locked
    ? "Past week editing is disabled. Enable in Settings > Configurations."
    : undefined;

  return (
    <div
      className={`flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-b-0 ${locked ? "opacity-60" : ""}`}
      title={lockTitle}
    >
      {/* Week label + date range + mini bar */}
      <div className="w-24 flex-shrink-0 pt-1">
        <div className="text-xs font-semibold text-gray-600 flex items-center gap-1">
          {locked && (
            <svg
              className="h-2.5 w-2.5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          )}
          Week {weekNumber}
        </div>
        <div className="text-[9px] text-gray-400 mt-0.5 leading-none">
          {weekDateLabel(year, quarter, weekNumber)}
        </div>
        <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
          {hasValue && weeklyTarget > 0 && (
            <div
              className={`h-1 rounded-full ${barColor}`}
              style={{
                width: `${Math.min((numVal / weeklyTarget) * 100, 100)}%`,
              }}
            />
          )}
        </div>
      </div>
      {/* Value input */}
      <div className="w-24 flex-shrink-0">
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="—"
          readOnly={locked}
          className={`w-full px-2 py-1.5 text-xs border rounded-md focus:outline-none text-center ${locked ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-gray-200 focus:ring-1 focus:ring-accent-400"}`}
        />
      </div>
      {/* Notes */}
      <div className="flex-1">
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Add a note for this week…"
          rows={2}
          readOnly={locked}
          className={`w-full px-2 py-1.5 text-xs border rounded-md focus:outline-none resize-y min-h-[36px] ${locked ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-gray-200 focus:ring-1 focus:ring-accent-400"}`}
        />
      </div>
    </div>
  );
}
