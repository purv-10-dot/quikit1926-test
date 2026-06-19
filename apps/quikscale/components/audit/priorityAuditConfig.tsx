"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { DataTable, type DataTableColumn } from "@quikit/ui";
import type { PriorityRow, PriorityWeeklyStatus } from "@/lib/types/priority";
import { useWeekLabels } from "@/lib/hooks/useCurrentWeek";
import { priorityFieldLabel } from "@/lib/audit/priorityFields";
import { PILLAR_TOKENS } from "@/components/audit/auditLogTokens";
import {
  useEntityAuditTimeline,
  useEntityMarkRead,
} from "@/lib/hooks/useAudit";
import { formatValue } from "@/lib/audit/timeline";
import type { AuditEntityConfig } from "@/components/audit/EntityChangeHistoryPanel";

/** Map a Priority overallStatus to its (semantic, fixed) timeline dot color. */
function priorityStatusDot(status: string | null | undefined): { className: string; label: string } {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
      return { className: "bg-blue-500", label: "Completed" };
    case "on-track":
      return { className: "bg-green-500", label: "On track" };
    case "behind-schedule":
      return { className: "bg-amber-400", label: "Behind schedule" };
    case "not-yet-started":
    case "not-started":
      return { className: "bg-red-500", label: "Not yet started" };
    case "not-applicable":
      return { className: "bg-gray-400", label: "Not applicable" };
    default:
      return { className: "bg-gray-300", label: status || "—" };
  }
}

/** Pretty label for a status string ("on-track" → "On track"). */
function statusLabel(status: string): string {
  return status
    .split("-")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Priority entity config for the generic Change History panel. Uses the
 * entity-agnostic audit hooks, a status-kind weekly card, a status RAG dot, and
 * a CREATE card that renders the full spec + a per-week status breakdown built
 * on the shared global DataTable. (No comment composer — historical COMMENT
 * events still render, but adding new comments from the panel is disabled.)
 */
export const priorityAuditConfig: AuditEntityConfig<PriorityRow> = {
  entityType: "PRIORITY",
  badgeLabel: "PRIORITY",
  badgeColor: PILLAR_TOKENS.execution,
  dialogLabel: "Priority change history",
  exportPrefix: "priority",
  fieldLabel: priorityFieldLabel,
  periodLabel: (p) => `FY ${p.year}-${p.year + 1} · ${p.quarter}`,
  weeklyKind: "status",
  // Priority surfaces a distinct STATUS pill for overallStatus changes (its
  // design), unlike KPI which renders them as UPDATED.
  operationFor: (action) => (action === "STATUS_CHANGE" ? "STATUS" : undefined),
  useTimeline: (id) => useEntityAuditTimeline("PRIORITY", id),
  useMarkRead: () => useEntityMarkRead("PRIORITY"),
  useWeekLabels: (p) => useWeekLabels(p.year, p.quarter),
  statusDot: (p) => {
    const d = priorityStatusDot(p.overallStatus);
    return { className: d.className, label: `Status indicator: ${d.label}` };
  },
  renderCreateCard: ({ entity, weekLabels, open, onToggle }) => (
    <PriorityCreateCard priority={entity} weekLabels={weekLabels} open={open} onToggle={onToggle} />
  ),
};

interface WeekStatusRow {
  weekNumber: number;
  dateRange: string;
  status: string;
}

const WEEK_COLUMNS: DataTableColumn<WeekStatusRow>[] = [
  { key: "week", label: "Wk", width: 44, align: "center", render: (r) => <span className="font-medium">{r.weekNumber}</span> },
  { key: "range", label: "Date Range", render: (r) => <span className="text-gray-600">{r.dateRange || "—"}</span> },
  {
    key: "status",
    label: "Status",
    render: (r) => {
      const dot = priorityStatusDot(r.status);
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${dot.className}`} />
          <span className="text-gray-800">{statusLabel(r.status)}</span>
        </span>
      );
    },
  },
];

function PriorityCreateCard({
  priority,
  weekLabels,
  open,
  onToggle,
}: {
  priority: PriorityRow;
  weekLabels: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const ownerUser = priority.owner_user;
  const ownerDisplay =
    (ownerUser ? `${ownerUser.firstName} ${ownerUser.lastName}`.trim() : "") ||
    (typeof priority.owner === "string" ? priority.owner : null);
  const period = `FY ${priority.year}-${priority.year + 1} · ${priority.quarter}`;
  const weekRange =
    priority.startWeek != null && priority.endWeek != null
      ? `Week ${priority.startWeek} – Week ${priority.endWeek}`
      : null;

  const fields: [string, unknown][] = [
    ["Name", priority.name],
    ["Owner", ownerDisplay],
    ["Team", priority.team?.name ?? null],
    ["Status", priority.overallStatus ? statusLabel(priority.overallStatus) : null],
    ["Period", period],
    ["Weeks", weekRange],
    ["Description", priority.description],
    ["Notes", priority.notes],
  ];

  const weekRows: WeekStatusRow[] = [...(priority.weeklyStatuses ?? [])]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((w: PriorityWeeklyStatus) => ({
      weekNumber: w.weekNumber,
      dateRange: weekLabels[w.weekNumber - 1] ?? "",
      status: w.status,
    }));

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
                <span className="w-32 shrink-0 text-gray-500">{label}</span>
                <span className="break-words font-medium text-gray-900">{formatValue(v)}</span>
              </div>
            ))}

          {weekRows.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-green-700">Weekly Status Breakdown</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Status seeded across {weekRows.length} week{weekRows.length === 1 ? "" : "s"}. Owners update each week.
              </p>
              <div className="mt-1 overflow-hidden rounded-lg border border-gray-100">
                <DataTable
                  columns={WEEK_COLUMNS}
                  data={weekRows}
                  rowKey={(r) => String(r.weekNumber)}
                  stickyHeader={false}
                  emptyMessage="No weekly statuses."
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
