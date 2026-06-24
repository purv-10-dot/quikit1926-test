/**
 * Client Member ("ClientMember") audit field configuration. Mirrors the other
 * entities' field configs so the generic audit engine stays entity-agnostic.
 */

/** Derived / system / relation fields excluded from the diff. */
export const CLIENT_MEMBER_AUDIT_EXCLUDE = [
  "id",
  "orgId",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "deletedAt",
  "org",
  "clientLinks",
  "dailyAbsences",
  "weeklyAbsences",
  "weeklyDashboardNA",
  "weeklyScores",
] as const;

/** Human-readable labels for Client Member fields. */
export const CLIENT_MEMBER_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
};

/** Whitelist of user-editable Client Member fields to diff on UPDATE. */
export const CLIENT_MEMBER_AUDIT_FIELDS = Object.keys(CLIENT_MEMBER_FIELD_LABELS);

/** Friendly label for a Client Member field name, falling back to the raw key. */
export function clientMemberFieldLabel(field: string): string {
  return CLIENT_MEMBER_FIELD_LABELS[field] ?? field;
}
