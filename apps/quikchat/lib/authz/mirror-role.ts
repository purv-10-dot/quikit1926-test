/**
 * Central-mirror helpers (RBAC_PLAN §7 — "UserAppAccess.role is the mirror").
 *
 * The single source of truth for a user's QuikChat role is this app's own
 * `QcUserAppRole → QcAppRole`. The central `quikit.UserAppAccess.role` column is
 * a denormalised copy of that role's NAME, read by the Admin Portal. Every place
 * QuikChat changes a per-app role calls into here so the two stay in lock-step —
 * the app-code half of the platform sync (the Admin-Portal → app half lives in
 * the shared `assignAppRoles`).
 *
 * These are ADDITIVE: they reuse the existing shared `mirrorAppRoleToCentral`
 * export and never touch enforcement (which reads QuikChat's own tables).
 */
import { mirrorAppRoleToCentral } from "@quikit/auth/assign-app-roles";
import { db } from "@/lib/db";

/**
 * Compute each user's FALLBACK QuikChat role name — the role they effectively
 * hold once they no longer have any `QcUserAppRole` row (after a detach from the
 * members-reconcile, or a role delete). Mirrors the bind rule in
 * `ensureUserRole` (seed.ts): platform / org admins → "admin", everyone else →
 * the default "Member". Kept in lock-step with that function so the central
 * mirror matches what QuikChat will actually rebind the user to on next entry.
 */
export async function fallbackRoleNames(
  orgId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return out;

  const [members, users] = await Promise.all([
    db.orgMember.findMany({
      where: { orgId, userId: { in: unique } },
      select: { userId: true, role: true },
    }),
    db.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, isSuperAdmin: true },
    }),
  ]);
  const roleByUser = new Map(members.map((m) => [m.userId, m.role]));
  const superById = new Map(users.map((u) => [u.id, u.isSuperAdmin]));

  for (const userId of unique) {
    const orgRole = roleByUser.get(userId);
    const isAdmin =
      orgRole === "org_admin" || orgRole === "super_admin" || superById.get(userId) === true;
    out.set(userId, isAdmin ? "admin" : "Member");
  }
  return out;
}

/**
 * Best-effort mirror of one-or-more (user → role name) pairs onto the central
 * `quikit.UserAppAccess.role` column. Reuses the shared `mirrorAppRoleToCentral`
 * (no-op when the user has no access row for QuikChat, or the name is empty).
 *
 * NON-FATAL: a mirror hiccup must never fail the primary role write, so every
 * call is individually swallowed — same convention as the ingest-marker write
 * (app/api/channels/[id]/ingest/route.ts). A missed mirror just leaves the
 * central copy stale until the next role change / entry.
 */
export async function mirrorRolesToCentral(params: {
  orgId: string;
  appId: string;
  entries: Array<{ userId: string; roleName: string }>;
}): Promise<void> {
  const { orgId, appId, entries } = params;
  for (const { userId, roleName } of entries) {
    try {
      await mirrorAppRoleToCentral(db, { orgId, userId, appId, roleName });
    } catch {
      // Non-fatal — see doc comment.
    }
  }
}
