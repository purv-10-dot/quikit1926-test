"use client";

import { useLogs } from "@/lib/hooks/useKPI";
import type { KPIRow } from "@/lib/types/kpi";
import { LogsPanel, isEmpty, type LogEntry } from "@/components/LogsPanel";

interface Props { kpi: KPIRow; onClose: () => void; }

const FIELD_LABELS: Record<string, string> = {
  name: "KPI Name", description: "Description", owner: "Owner", status: "Status",
  target: "Target Value", quarterlyGoal: "Quarterly Goal", qtdGoal: "QTD Goal",
  measurementUnit: "Measurement Unit", quarter: "Quarter", year: "Year",
  teamId: "Team", parentKPIId: "Parent KPI",
  kpiLevel: "KPI Level", divisionType: "Division Type",
  currency: "Currency", targetScale: "Target Scale", reverseColor: "Reverse Color",
};

// Parse an UPDATE_WEEKLY log's newValue (JSON-serialized KPIWeeklyValue).
function formatWeeklyLog(
  newJson: string | null | undefined,
  ownerLookup: Record<string, string>,
): { week: number | null; value: string; notes: string; ownerLabel: string } | null {
  if (!newJson) return null;
  try {
    const obj = JSON.parse(newJson) as {
      weekNumber?: number;
      value?: number | null;
      notes?: string | null;
      userId?: string | null;
    };
    return {
      week: typeof obj.weekNumber === "number" ? obj.weekNumber : null,
      value: isEmpty(obj.value) ? "—" : String(obj.value),
      notes: obj.notes ?? "",
      ownerLabel: obj.userId ? (ownerLookup[obj.userId] ?? "") : "",
    };
  } catch {
    return null;
  }
}

export function KPILogsModal({ kpi, onClose }: Props) {
  const { data: logs = [], isLoading } = useLogs(kpi.id);

  // userId → "First Last" lookup so UPDATE_WEEKLY rows can show the team-KPI owner
  const ownerLookup: Record<string, string> = {};
  const owners = (kpi.owners ?? []) as Array<{ id: string; firstName?: string; lastName?: string }>;
  for (const o of owners) {
    ownerLookup[o.id] = `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim();
  }
  if (kpi.owner_user) {
    ownerLookup[kpi.owner_user.id] = `${kpi.owner_user.firstName ?? ""} ${kpi.owner_user.lastName ?? ""}`.trim();
  }

  return (
    <LogsPanel
      title={kpi.name}
      subtitle="Change history"
      logs={logs as LogEntry[]}
      isLoading={isLoading}
      fieldLabels={FIELD_LABELS}
      onClose={onClose}
      extraRowRenderer={(log) => {
        if (log.action !== "UPDATE_WEEKLY") return null;
        const w = formatWeeklyLog(log.newValue, ownerLookup);
        if (!w) return null;
        return (
          <div className="mt-1.5 text-xs text-gray-600 flex items-center gap-2 flex-wrap">
            {w.week !== null && <span className="font-medium text-gray-700">Week {w.week}</span>}
            <span className="text-gray-400">value</span>
            <span className="font-medium text-gray-800">{w.value}</span>
            {w.ownerLabel && <span className="text-[10px] text-gray-400">· for {w.ownerLabel}</span>}
            {w.notes && <span className="block w-full text-[11px] text-gray-500 italic">{w.notes}</span>}
          </div>
        );
      }}
    />
  );
}
