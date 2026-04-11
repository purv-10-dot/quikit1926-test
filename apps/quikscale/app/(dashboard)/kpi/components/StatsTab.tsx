"use client";

/**
 * StatsTab — read-only stats view for a KPI, used in LogModal.
 *
 * Extracted from `LogModal.tsx` in R6. Pure presentational — owns no
 * state, no mutations. The underlying stat calculations live in
 * `./kpiStats.ts` so they can be unit-tested independently.
 */

import type { KPIRow } from "@/lib/types/kpi";
import { progressColor, fmt } from "@/lib/utils/kpiHelpers";
import { computeKPIStats } from "./kpiStats";

export function StatsTab({ kpi }: { kpi: KPIRow }) {
  const colors = progressColor(kpi.progressPercent ?? 0);
  const target = kpi.qtdGoal ?? kpi.target ?? 0;
  const achieved = kpi.qtdAchieved ?? 0;
  const { filledWeeks, avgPerWeek, bestWeek } = computeKPIStats(kpi);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-3">
          Overall Progress
        </h3>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className={`text-3xl font-bold ${colors.text}`}>
                {(kpi.progressPercent ?? 0).toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{colors.label}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Achieved</div>
              <div className="text-lg font-semibold text-gray-800">
                {fmt(achieved)}
              </div>
              <div className="text-[10px] text-gray-400">
                of {fmt(target)} target
              </div>
            </div>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all ${colors.bar}`}
              style={{ width: `${Math.min(kpi.progressPercent ?? 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Weeks Reported", value: String(filledWeeks.length) },
          { label: "Avg / Week", value: fmt(avgPerWeek) },
          { label: "Best Week", value: bestWeek ? `W${bestWeek}` : "—" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center"
          >
            <div className="text-lg font-semibold text-gray-800">{s.value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: "Quarterly Goal",
            value: kpi.quarterlyGoal != null ? String(kpi.quarterlyGoal) : "—",
          },
          {
            label: "QTD Goal",
            value: kpi.qtdGoal != null ? String(kpi.qtdGoal) : "—",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center"
          >
            <div className="text-lg font-semibold text-gray-800">{s.value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
