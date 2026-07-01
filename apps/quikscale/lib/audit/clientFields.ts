/**
 * Client Master ("Client") audit field configuration. Mirrors the other
 * entities' field configs so the generic audit engine stays entity-agnostic.
 */

/** Derived / system / relation fields excluded from the diff. */
export const CLIENT_AUDIT_EXCLUDE = [
  "id",
  "orgId",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "deletedAt",
  "teamMembers",
  "memberships",
  "dailyHuddles",
  "weeklyMeetings",
  "org",
] as const;

/** Human-readable labels for Client fields shown in the Change History timeline. */
export const CLIENT_FIELD_LABELS: Record<string, string> = {
  name: "Client Name",
  description: "Description",
  isActive: "Status",
  startDate: "Start Date",
  weeklyStartTime: "Weekly Window Start",
  weeklyEndTime: "Weekly Window End",
  dailyStartTime: "Daily Window Start",
  dailyEndTime: "Daily Window End",
  teamMemberIds: "Team Members",
};

/** Whitelist of user-editable Client fields to diff on UPDATE. */
export const CLIENT_AUDIT_FIELDS = Object.keys(CLIENT_FIELD_LABELS);

/** Friendly label for a Client field name, falling back to the raw key. */
export function clientFieldLabel(field: string): string {
  return CLIENT_FIELD_LABELS[field] ?? field;
}
