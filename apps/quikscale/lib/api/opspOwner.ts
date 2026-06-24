import { db } from "@/lib/db";
import { getQuikScaleAppId, userCan } from "@/lib/api/permissions";

/**
 * Resolve which user's per-user OPSP data the caller may act on.
 *   - no/own `targetUserId` → the acting user (always allowed; the caller's own
 *     OPSP.Create / OPSP.Review.Critical grant already covers self);
 *   - a DIFFERENT user → allowed only with `OPSP.EditUser:update`.
 * Returns the resolved subject userId, or `null` when a foreign target was
 * requested without the special permission (caller maps null → 403).
 */
export async function resolveSectionUserId(
  orgId: string,
  actingUserId: string,
  targetUserId: string | null | undefined,
): Promise<string | null> {
  if (!targetUserId || targetUserId === actingUserId) return actingUserId;
  const canEditOthers = await userCan(actingUserId, orgId, "OPSP.EditUser", "update");
  return canEditOthers ? targetUserId : null;
}

/**
 * Resolve the canonical OPSP owner for an org.
 *
 * OPSP is an org-level document — a single "One-Page Strategic Plan" shared by
 * everyone with OPSP permission. But `OPSPData` rows are physically keyed by
 * `(orgId, userId, year, quarter)`, so we designate ONE canonical owner per org
 * and resolve every OPSP read/write to that owner's rows. The owner is the
 * creator of the org's earliest OPSP record (the person who first set it up).
 *
 * Returns `null` when the org has no OPSP yet — callers fall back to the acting
 * user (`?? userId`), so the first person to create an OPSP becomes the owner.
 *
 * Permission is enforced separately by the `withOrgAuthForResource` wrapper —
 * this helper only decides WHICH record is the org's plan, never WHO may
 * read/write it. Audit fields (`updatedBy`/`createdBy`/`actorId`) must still
 * record the acting user, not the owner.
 */
export async function resolveOpspOwnerId(orgId: string): Promise<string | null> {
  const earliest = await db.oPSPData.findFirst({
    where: { orgId },
    // Deterministic: the first plan ever created in the org. `id` breaks any
    // createdAt tie so the owner is stable across requests.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { userId: true },
  });
  return earliest?.userId ?? null;
}

/**
 * Convenience: the effective OPSP owner for a request — the canonical owner if
 * the org already has a plan, else the acting user (who becomes the owner on
 * first create). Centralises the `?? userId` fallback so every route resolves
 * identically.
 */
export async function resolveOpspOwnerOrSelf(orgId: string, userId: string): Promise<string> {
  return (await resolveOpspOwnerId(orgId)) ?? userId;
}

/**
 * Collect the user ids in `orgId` whose effective permissions include
 * (`resource`, `action`) — role grants UNION per-user extras. Used to find who
 * can edit other users' OPSP sections (the "responsible admin").
 */
async function userIdsWithPermission(
  orgId: string,
  appId: string,
  resource: string,
  action: string,
  restrictTo?: string[],
): Promise<string[]> {
  const idFilter = restrictTo ? { userId: { in: restrictTo } } : {};
  const [roleHolders, extraHolders] = await Promise.all([
    db.userAppRole.findMany({
      where: {
        orgId,
        ...idFilter,
        role: { appId, permissions: { some: { resource, action } } },
      },
      select: { userId: true },
    }),
    db.userPermissionExtra.findMany({
      where: { orgId, resource, action, ...idFilter },
      select: { userId: true },
    }),
  ]);
  return Array.from(
    new Set([
      ...(roleHolders ?? []).map((r) => r.userId),
      ...(extraHolders ?? []).map((e) => e.userId),
    ]),
  );
}

/**
 * Name of the admin a member should contact to update their finalized OPSP
 * sections — i.e. someone holding `OPSP.EditUser:update`. Prefers a candidate
 * who can ALSO edit after finalize (`OPSP.History.EditFinalize:update`) since
 * only they can actually change a finalized OPSP. Returns null if nobody holds
 * the permission yet.
 */
export async function resolveResponsibleAdminName(orgId: string): Promise<string | null> {
  const appId = await getQuikScaleAppId();
  if (!appId) return null;

  const candidates = await userIdsWithPermission(orgId, appId, "OPSP.EditUser", "update");
  if (candidates.length === 0) return null;

  const canFinalizeEdit = await userIdsWithPermission(
    orgId,
    appId,
    "OPSP.History.EditFinalize",
    "update",
    candidates,
  );
  const efSet = new Set(canFinalizeEdit);
  const preferred = candidates.filter((id) => efSet.has(id));
  const pickFrom = preferred.length ? preferred : candidates;

  const users = await db.user.findMany({
    where: { id: { in: pickFrom } },
    select: { firstName: true, lastName: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  const u = users[0];
  return u ? `${u.firstName} ${u.lastName}`.trim() : null;
}
