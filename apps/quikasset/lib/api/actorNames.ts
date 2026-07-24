import { db } from "@/lib/db";

/** Compose a display name from a platform User row (firstName+lastName, else email). */
function composeName(u: { firstName: string | null; lastName: string | null; email: string | null }): string | null {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email || null;
}

/**
 * Batched actor-name resolver for "who performed this action" attribution.
 *
 * Given a set of platform `User.id`s (e.g. `AstAsset.createdByUserId`,
 * `AstAssignment.assignedByUserId`, `AstRepair.createdByUserId`), returns a
 * `Map<userId, displayName>` in ONE query. Names come from the `User` table
 * rather than `AstEmployee` because actors are usually admins/asset-managers who
 * may have no employee record. Ids with no matching User (or falsy ids) are
 * simply absent from the map — callers fall back to `null`.
 *
 * Mirrors the batched-join pattern used for requester names in the asset-request
 * queue, but on the User table.
 */
export async function resolveActorNames(
  userIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const map = new Map<string, string>();
  for (const u of users) {
    const name = composeName(u);
    if (name) map.set(u.id, name);
  }
  return map;
}
