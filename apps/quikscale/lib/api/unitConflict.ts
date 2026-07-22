import { db } from "@/lib/db";

// Duplicate-name (orgId, nameKey) 409 messages. The unique constraint spans
// (orgId, nameKey) WITHOUT deletedAt, so a soft-deleted unit still reserves its
// name — creating/renaming to that name fails even though the unit is in Trash
// and invisible in the default grid. Point the user at Trash in that case so
// the conflict is actionable instead of confusing.
export const UNIT_NAME_TAKEN = "A unit with this name already exists.";
export const UNIT_NAME_TAKEN_TRASHED =
  "A unit with this name already exists. Please go to the Trash View and restore the existing unit, or use a different unit name.";

/**
 * Resolve the 409 message for a duplicate unit name. Looks up the conflicting
 * row by (orgId, nameKey): if it's soft-deleted (in Trash) the caller gets the
 * restore-guidance message; otherwise the generic "already exists" message.
 */
export async function unitNameConflictMessage(orgId: string, name: string): Promise<string> {
  const conflict = await db.unitMaster.findFirst({
    where: { orgId, nameKey: name.trim().toLowerCase() },
    select: { deletedAt: true },
  });
  return conflict?.deletedAt ? UNIT_NAME_TAKEN_TRASHED : UNIT_NAME_TAKEN;
}
