"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type { KPIRow } from "@/lib/types/kpi";
import { useAuditTimeline, useMarkAuditRead } from "@/lib/hooks/useKPI";
import { useWeekLabels } from "@/lib/hooks/useCurrentWeek";
import { kpiFieldLabel } from "@/lib/audit/kpiFields";
import { getProgressBadgeColors } from "@/lib/utils/kpiHelpers";
import { PILLAR_TOKENS } from "@/components/audit/auditLogTokens";
import { formatValue } from "@/lib/audit/timeline";
import type { AuditEntityConfig } from "@/components/audit/EntityChangeHistoryPanel";

/**
 * KPI entity config for the generic Change History panel. Reuses the existing
 * KPI audit hooks (so the KPI data layer is untouched) and renders the KPI
 * spec + Weekly Target Breakdown in the CREATE card.
 */
export const kpiAuditConfig: AuditEntityConfig<KPIRow> = {
  entityType: "KPI",
  badgeLabel: "KPI",
  badgeColor: PILLAR_TOKENS.execution,
  dialogLabel: "KPI change history",
  exportPrefix: "kpi",
  fieldLabel: kpiFieldLabel,
  periodLabel: (k) => `FY ${k.year}-${k.year + 1} · ${k.quarter}`,
  weeklyKind: "numeric",
  useTimeline: (id) => useAuditTimeline(id),
  useMarkRead: () => useMarkAuditRead(),
  useWeekLabels: (k) => useWeekLabels(k.year, k.quarter),
  statusDot: (k) => {
    // Goal priority mirrors the "Quarterly Goal" column shown on-screen
    // (quarterlyGoal ?? target ?? qtdGoal) — see kpiStats.ts resolveProgressOverall.
    const goal = k.quarterlyGoal ?? k.target ?? k.qtdGoal ?? 0;
    const achieved = k.qtdAchieved ?? 0;
    const rag = getProgressBadgeColors(achieved, goal, achieved > 0, k.reverseColor ?? false);
    return { className: rag.bar, label: `RAG indicator: ${rag.label}` };
  },
  renderCreateCard: ({ entity, weekLabels, open, onToggle }) => (
    <KpiCreateCard kpi={entity} weekLabels={weekLabels} open={open} onToggle={onToggle} />
  ),
};

function KpiCreateCard({
  kpi,
  weekLabels,
  open,
  onToggle,
}: {
  kpi: KPIRow;
  weekLabels: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const ownerUser = kpi.owner_user;
  const ownerFromUser = ownerUser ? `${ownerUser.firstName} ${ownerUser.lastName}`.trim() : "";
  const ownerList = (kpi.owners ?? []).map((o) => `${o.firstName} ${o.lastName}`.trim()).filter(Boolean);
  const ownerDisplay =
    ownerFromUser ||
    (ownerList.length ? ownerList.join(", ") : null) ||
    (kpi.ownerIds && kpi.ownerIds.length ? `${kpi.ownerIds.length} owners` : null) ||
    (typeof kpi.owner === "string" ? kpi.owner : null);

  const freq = kpi.frequency ?? "weekly";
  const cadence = `${freq.charAt(0).toUpperCase()}${freq.slice(1)} · 13 weeks`;
  const period = `FY ${kpi.year}-${kpi.year + 1} · ${kpi.quarter}`;
  const colorCoding = kpi.reverseColor ? "Reversed (lower is better)" : "Standard";

  const fields: [string, unknown][] = [
    ["KPI Name", kpi.name],
    ["Owner", ownerDisplay],
    ["Measurement Unit", kpi.measurementUnit],
    ["Target", kpi.target],
    ["Division Type", kpi.divisionType],
    ["Color Coding", colorCoding],
    ["Cadence", cadence],
    ["Period", period],
    ["Description", kpi.description],
  ];

  const weekly = kpi.weeklyTargets ?? null;
  const weekKeys = weekly
    ? Object.keys(weekly)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)
    : [];
  const totalTarget = weekly
    ? weekKeys.reduce((s, w) => s + (weekly[String(w)] ?? 0), 0)
    : (kpi.target ?? 0);

  return (
    <div>
      <button type="button" onClick={onToggle} className="mb-1 flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs text-green-700">
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? "Hide" : "Show"} details
      </button>
      {open && (
        <div className="space-y-1 text-sm">
          {fields
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([label, v]) => (
              <div key={label} className="flex gap-2">
                <span className="w-36 shrink-0 text-gray-500">{label}</span>
                <span className="break-words font-medium text-gray-900">{formatValue(v)}</span>
              </div>
            ))}

          {weekKeys.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-green-700">Weekly Target Breakdown</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Cumulative target {totalTarget} distributed across {weekKeys.length} weeks. Teams fill Actual each week.
              </p>
              <table className="mt-1 w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-gray-400">
                    <th className="py-1">Wk</th>
                    <th>Date Range</th>
                    <th>Weekly Target</th>
                    <th>Cumulative</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let cum = 0;
                    return weekKeys.map((w) => {
                      const inc = weekly![String(w)] ?? 0;
                      cum += inc;
                      return (
                        <tr key={w} className="border-t border-gray-50">
                          <td className="py-1 font-medium">{w}</td>
                          <td className="text-gray-600">{weekLabels[w - 1] ?? "—"}</td>
                          <td className="text-gray-700">+{inc}</td>
                          <td className="font-medium">{cum}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
