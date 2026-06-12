"use client";

import { Info, ArrowUp, ArrowDown } from "lucide-react";
import { productivityTone } from "@/lib/reports/productivity";
import type { ExecutiveReportData, TeamProductivityRow } from "./types";

interface Props {
  data: ExecutiveReportData;
  onSelect?: (row: TeamProductivityRow) => void;
}

const TONE_BAR: Record<ReturnType<typeof productivityTone>, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-400",
  low: "bg-red-500",
};

// Distinct palette for the bars — mirrors the image colors.
const COLORS = ["#8b5cf6", "#3b82f6", "#22d3ee", "#10b981", "#f97316", "#eab308", "#ec4899", "#a855f7"];

export function TeamProductivityBar({ data, onSelect }: Props) {
  const rows = data.teams;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm h-full flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Productivity by Department</h3>
          <Info className="h-3.5 w-3.5 text-gray-400" />
        </div>
        <button
          type="button"
          className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
          onClick={() => rows[0] && onSelect?.(rows[0])}
        >
          View All
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mt-3 space-y-2.5 flex-1 overflow-y-auto">
          {rows.map((row, idx) => (
            <li key={row.teamId}>
              <button
                type="button"
                onClick={() => onSelect?.(row)}
                className="w-full text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-24 truncate text-xs text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                    {row.teamName}
                  </div>
                  <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(2, row.productivity)}%`,
                        background: COLORS[idx % COLORS.length],
                      }}
                    />
                  </div>
                  <div className="w-10 text-right text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {row.productivity}%
                  </div>
                  <DeltaPill delta={row.delta} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[10px] text-gray-400">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="w-12 text-right text-[10px] text-gray-400">—</span>;
  }
  const good = delta >= 0;
  return (
    <span
      className={`w-12 inline-flex items-center justify-end gap-0.5 text-[11px] font-medium tabular-nums ${
        good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      {good ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta)}%
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
      <div className="text-3xl mb-2">📊</div>
      <p className="text-sm text-gray-500 dark:text-gray-400">No department activity in this period</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        Assign roles in Settings &rarr; Roles &amp; Permissions to see productivity here
      </p>
    </div>
  );
}

// Re-export for the heatmap to share tone colors.
export { TONE_BAR };
