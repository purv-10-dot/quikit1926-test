"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { weeklyMeetingFieldLabel, weeklyMeetingValueLabel } from "@/lib/audit/weeklyMeetingFields";
import { PILLAR_TOKENS } from "@/components/audit/auditLogTokens";
import { useEntityAuditTimeline, useEntityMarkRead } from "@/lib/hooks/useAudit";
import { formatValue } from "@/lib/audit/timeline";
import type { AuditEntityConfig } from "@/components/audit/EntityChangeHistoryPanel";

/** Minimal Weekly Meeting shape the panel + create card read (the page's
 *  MeetingRow is structurally assignable; `name` is set by the wrapper). */
export type WeeklyMeetingAuditEntity = {
  id: string;
  name: string;
  clientName: string;
  meetingDate: string;
  callStatus: string;
  callStatusOther?: string | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  punctualityOverride?: string;
  goodNewsSharing?: string;
  kpDashboard?: string;
  gaps?: string;
  www?: string;
  feedback?: string;
  collectiveIntelligence?: string;
  opspReview?: string;
  notesKPDashboard?: string | null;
  otherNotes?: string | null;
  absentClientMemberNames?: string[];
  dashboardNAClientMemberNames?: string[];
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
      return { className: "bg-gray-400", label: `Status indicator: ${weeklyMeetingValueLabel("callStatus", status) ?? status}` };
  }
}

/**
 * Weekly Meeting entity config. callStatus → STATUS pill (humanized); flags +
 * callStatus humanized via formatFieldValue. Absent + Dashboard-NA member
 * adds/removes resolve to names (new edits store names; migrated ids resolve
 * via the wrapper's nameById). Per-member score updates arrive as UPDATE events
 * with member-prefixed rows. No comments, no weekly breakdown.
 */
export const weeklyMeetingAuditConfig: AuditEntityConfig<WeeklyMeetingAuditEntity> = {
  entityType: "WEEKLY_MEETING",
  badgeLabel: "MEETING",
  badgeColor: PILLAR_TOKENS.execution,
  dialogLabel: "Weekly meeting change history",
  exportPrefix: "weekly-meeting",
  fieldLabel: weeklyMeetingFieldLabel,
  periodLabel: (m) => fmtDate(m.meetingDate),
  operationFor: (action) => (action === "STATUS_CHANGE" ? "STATUS" : undefined),
  formatFieldValue: (field, value) => {
    if (field === "meetingDate" && typeof value === "string") return fmtDate(value);
    return weeklyMeetingValueLabel(field, value);
  },
  useTimeline: (id) => useEntityAuditTimeline("WEEKLY_MEETING", id),
  useMarkRead: () => useEntityMarkRead("WEEKLY_MEETING"),
  useWeekLabels: () => [],
  statusDot: (m) => callStatusDot(m.callStatus),
  renderCreateCard: ({ entity, open, onToggle }) => (
    <WeeklyMeetingCreateCard meeting={entity} open={open} onToggle={onToggle} />
  ),
};

function flag(v: string | undefined): string | null {
  return v ? weeklyMeetingValueLabel("goodNewsSharing", v) ?? v : null;
}

function WeeklyMeetingCreateCard({
  meeting,
  open,
  onToggle,
}: {
  meeting: WeeklyMeetingAuditEntity;
  open: boolean;
  onToggle: () => void;
}) {
  const absent = (meeting.absentClientMemberNames ?? []).join(", ");
  const dashNA = (meeting.dashboardNAClientMemberNames ?? []).join(", ");
  const status =
    weeklyMeetingValueLabel("callStatus", meeting.callStatus) ?? meeting.callStatus;
  const fields: [string, unknown][] = [
    ["Client", meeting.clientName],
    ["Meeting Date", fmtDate(meeting.meetingDate)],
    ["Status", meeting.callStatus === "OTHER" && meeting.callStatusOther ? `Other — ${meeting.callStatusOther}` : status],
    ["Planned Deviation In Time", flag(meeting.punctualityOverride)],
    ["Actual Start", meeting.actualStartTime],
    ["Actual End", meeting.actualEndTime],
    ["Good News Sharing", flag(meeting.goodNewsSharing)],
    ["K&P Dashboard", flag(meeting.kpDashboard)],
    ["GAPS", flag(meeting.gaps)],
    ["WWW", flag(meeting.www)],
    ["Feedback", flag(meeting.feedback)],
    ["Collective Intelligence", flag(meeting.collectiveIntelligence)],
    ["OPSP Review", flag(meeting.opspReview)],
    ["Absent Members", absent || null],
    ["Dashboard N/A Members", dashNA || null],
    ["K&P Dashboard Notes", meeting.notesKPDashboard],
    ["Other Notes", meeting.otherNotes],
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
