"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { dailyHuddleFieldLabel, dailyHuddleValueLabel } from "@/lib/audit/dailyHuddleFields";
import { PILLAR_TOKENS } from "@/components/audit/auditLogTokens";
import { useEntityAuditTimeline, useEntityMarkRead } from "@/lib/hooks/useAudit";
import { formatValue } from "@/lib/audit/timeline";
import type { AuditEntityConfig } from "@/components/audit/EntityChangeHistoryPanel";

/** Minimal Daily Huddle shape the panel + create card read (the page's
 *  HuddleRow is structurally assignable; `name` is set by the wrapper). */
export type DailyHuddleAuditEntity = {
  id: string;
  name: string;
  clientName: string;
  meetingDate: string;
  callStatus: string;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  yesterdaysAchievements?: boolean;
  todaysPriority?: boolean;
  stuckIssues?: boolean;
  totalMembers?: number;
  notesKPDashboard?: string | null;
  otherNotes?: string | null;
  absentTeamMemberNames?: string[];
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function callStatusDot(status: string | null | undefined): { className: string; label: string } {
  switch (String(status ?? "")) {
    case "HELD":
      return { className: "bg-green-500", label: "Status indicator: Held" };
    case "NOT_HELD":
      return { className: "bg-red-500", label: "Status indicator: Not Held" };
    case "CALL_CANCELLED_BY_CLIENT":
      return { className: "bg-amber-400", label: "Status indicator: Cancelled by client" };
    default:
      return { className: "bg-gray-400", label: `Status indicator: ${dailyHuddleValueLabel("callStatus", status) ?? status}` };
  }
}

/**
 * Daily Huddle entity config. callStatus → STATUS pill (humanized); the YES/
 * NO/NA format flags + callStatus values are humanized via formatFieldValue.
 * Absent-member adds/removes already store names (resolved at write time), so
 * they render directly. No comments, no weekly.
 */
export const dailyHuddleAuditConfig: AuditEntityConfig<DailyHuddleAuditEntity> = {
  entityType: "DAILY_HUDDLE",
  badgeLabel: "HUDDLE",
  badgeColor: PILLAR_TOKENS.cadence,
  dialogLabel: "Daily huddle change history",
  exportPrefix: "daily-huddle",
  fieldLabel: dailyHuddleFieldLabel,
  periodLabel: (h) => fmtDate(h.meetingDate),
  operationFor: (action) => (action === "STATUS_CHANGE" ? "STATUS" : undefined),
  formatFieldValue: (field, value) => {
    if (field === "meetingDate" && typeof value === "string") return fmtDate(value);
    return dailyHuddleValueLabel(field, value);
  },
  useTimeline: (id) => useEntityAuditTimeline("DAILY_HUDDLE", id),
  useMarkRead: () => useEntityMarkRead("DAILY_HUDDLE"),
  useWeekLabels: () => [],
  statusDot: (h) => callStatusDot(h.callStatus),
  renderCreateCard: ({ entity, open, onToggle }) => (
    <DailyHuddleCreateCard huddle={entity} open={open} onToggle={onToggle} />
  ),
};

function yn(v: boolean | undefined): string {
  return v ? "Yes" : "No";
}

function DailyHuddleCreateCard({
  huddle,
  open,
  onToggle,
}: {
  huddle: DailyHuddleAuditEntity;
  open: boolean;
  onToggle: () => void;
}) {
  const absent = (huddle.absentTeamMemberNames ?? []).join(", ");
  const fields: [string, unknown][] = [
    ["Client", huddle.clientName],
    ["Meeting Date", fmtDate(huddle.meetingDate)],
    ["Status", dailyHuddleValueLabel("callStatus", huddle.callStatus) ?? huddle.callStatus],
    ["Actual Start", huddle.actualStartTime],
    ["Actual End", huddle.actualEndTime],
    ["Yesterday's Achievements", yn(huddle.yesterdaysAchievements)],
    ["Today's Priority", yn(huddle.todaysPriority)],
    ["Stuck Issues", yn(huddle.stuckIssues)],
    ["Total Members", huddle.totalMembers],
    ["Absent Members", absent || null],
    ["K&P Dashboard Notes", huddle.notesKPDashboard],
    ["Other Notes", huddle.otherNotes],
  ];

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
                <span className="w-44 shrink-0 text-gray-500">{label}</span>
                <span className="break-words font-medium text-gray-900">{formatValue(v)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
