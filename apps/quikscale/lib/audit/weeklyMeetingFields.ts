/**
 * Weekly Meeting ("ClientWeeklyMeeting") audit field configuration. Mirrors the
 * other entities' field configs so the generic audit engine stays
 * entity-agnostic.
 */

/** Derived / system / relation fields excluded from the diff. */
export const WEEKLY_MEETING_AUDIT_EXCLUDE = [
  "id",
  "orgId",
  "clientId",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "deletedAt",
  "client",
  "org",
  "absentMembers", // legacy User-based
  "dashboardNAMembers",
  "absentTeamMembers",
  "dashboardNATeamMembers",
  "memberScores",
  "logs",
  "absentUserIds",
  "dashboardNAUserIds",
] as const;

/** Human-readable labels for Weekly Meeting fields shown in the timeline. */
export const WEEKLY_MEETING_FIELD_LABELS: Record<string, string> = {
  meetingDate: "Meeting Date",
  callStatus: "Status",
  callStatusOther: "Status (Other)",
  actualStartTime: "Actual Start",
  actualEndTime: "Actual End",
  segmentTime1: "Good News Sharing Time",
  segmentTime2: "K&P Dashboard Time",
  segmentTime3: "GAPS Time",
  segmentTime4: "WWW Time",
  segmentTime5: "Feedback Time",
  segmentTime6: "Collective Intelligence Time",
  segmentTime7: "OPSP Review Time",
  punctualityOverride: "Planned Deviation In Time",
  goodNewsSharing: "Good News Sharing",
  kpDashboard: "K&P Dashboard",
  gaps: "GAPS",
  www: "WWW",
  feedback: "Feedback",
  collectiveIntelligence: "Collective Intelligence",
  opspReview: "OPSP Review",
  notesKPDashboard: "K&P Dashboard Notes",
  otherNotes: "Other Notes",
  absentClientMemberIds: "Absent Members",
  dashboardNAClientMemberIds: "Dashboard N/A Members",
};

/** Whitelist of user-editable Weekly Meeting fields to diff on UPDATE. */
export const WEEKLY_MEETING_AUDIT_FIELDS = Object.keys(WEEKLY_MEETING_FIELD_LABELS);

/** Per-member score field labels — used to build member-prefixed change rows
 *  in the scores PATCH route (e.g. "user2 · KPI Weekly QTD"). */
export const WEEKLY_SCORE_LABELS: Record<string, string> = {
  kpiWeeklyQTD: "KPI Weekly QTD",
  kpiCoding: "KPI Color Coding",
  priorityNotes: "Priority Notes",
  priorityStartEndDate: "Priority Start/End Date",
  priorityColor: "Priority Color",
};

/** Friendly label for a Weekly Meeting field name, falling back to the raw key. */
export function weeklyMeetingFieldLabel(field: string): string {
  return WEEKLY_MEETING_FIELD_LABELS[field] ?? field;
}

const FLAG_FIELDS = [
  "punctualityOverride", "goodNewsSharing", "kpDashboard", "gaps",
  "www", "feedback", "collectiveIntelligence", "opspReview",
];

/** Humanize a Weekly Meeting callStatus / flag enum value for display. */
export function weeklyMeetingValueLabel(field: string, value: unknown): string | undefined {
  if (value == null) return undefined;
  if (field === "callStatus") {
    const map: Record<string, string> = {
      HELD: "Held",
      NOT_HELD: "Not Held",
      CALL_CANCELLED_BY_CLIENT: "Cancelled by client",
      HOLIDAY_FOR_CLIENT: "Holiday (client)",
      HOLIDAY_FOR_SUCCESS_ALCHEMIST: "Holiday (SA)",
      OTHER: "Other",
    };
    return map[String(value)] ?? String(value);
  }
  if (FLAG_FIELDS.includes(field)) {
    const map: Record<string, string> = { YES: "Yes", NO: "No", NA: "N/A" };
    return map[String(value)] ?? String(value);
  }
  return undefined;
}
