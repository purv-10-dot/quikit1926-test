/**
 * Daily Huddle ("ClientDailyHuddle") audit field configuration. Mirrors the
 * other entities' field configs so the generic audit engine stays
 * entity-agnostic.
 */

/** Derived / system / relation fields excluded from the diff. */
export const DAILY_HUDDLE_AUDIT_EXCLUDE = [
  "id",
  "orgId",
  "clientId", // set at create, not editable
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "deletedAt",
  "client",
  "org",
  "absentMembers", // legacy User-based absences (not surfaced)
  "absentTeamMembers",
  "absentUserIds",
] as const;

/** Human-readable labels for Daily Huddle fields shown in the timeline. */
export const DAILY_HUDDLE_FIELD_LABELS: Record<string, string> = {
  meetingDate: "Meeting Date",
  callStatus: "Status",
  actualStartTime: "Actual Start",
  actualEndTime: "Actual End",
  format1Status: "Yesterday's Achievements",
  format2Status: "Today's Priority",
  stuckCallStatus: "Stuck Issues",
  punctualityOverride: "Punctuality Override",
  totalMembers: "Total Members",
  notes: "Notes",
  notesKPDashboard: "K&P Dashboard Notes",
  otherNotes: "Other Notes",
  absentClientMemberIds: "Absent Members",
};

/** Whitelist of user-editable Daily Huddle fields to diff on UPDATE. */
export const DAILY_HUDDLE_AUDIT_FIELDS = Object.keys(DAILY_HUDDLE_FIELD_LABELS);

/** Friendly label for a Daily Huddle field name, falling back to the raw key. */
export function dailyHuddleFieldLabel(field: string): string {
  return DAILY_HUDDLE_FIELD_LABELS[field] ?? field;
}

/** Humanize a Daily Huddle callStatus / flag enum value for display. */
export function dailyHuddleValueLabel(field: string, value: unknown): string | undefined {
  if (value == null) return undefined;
  if (field === "callStatus") {
    const map: Record<string, string> = {
      HELD: "Held",
      NOT_HELD: "Not Held",
      CALL_CANCELLED_BY_CLIENT: "Cancelled by client",
      HOLIDAY_FOR_CLIENT: "Holiday (client)",
      HOLIDAY_FOR_SUCCESS_ALCHEMIST: "Holiday (SA)",
    };
    return map[String(value)] ?? String(value);
  }
  if (["format1Status", "format2Status", "stuckCallStatus", "punctualityOverride"].includes(field)) {
    const map: Record<string, string> = { YES: "Yes", NO: "No", NA: "N/A" };
    return map[String(value)] ?? String(value);
  }
  return undefined;
}
