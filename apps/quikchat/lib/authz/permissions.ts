/**
 * Server-side permission gate for QuikChat's dynamic-roles v2 system.
 *
 * Storage model (app_quikchat, mirrors QuikScale verbatim):
 *   - Roles                          → `QcAppRole`            (@@map "AppRole")
 *   - User → role mapping             → `QcUserAppRole`        (@@map "UserAppRole")
 *   - Role grants (resource, action)  → `QcRolePermission`     (@@map "RolePermission")
 *   - Per-user additive grants        → `QcUserPermissionExtra`(@@map "UserPermissionExtra")
 *
 * Permission decision:
 *   effective = role grants UNION per-user extras
 *
 * The `isSystem=true` flag on the admin role does NOT bypass permission
 * checks — admin gets access via its (seeded) grants. The flag only protects
 * rename/delete (Phase 3 role-management UI).
 *
 * ⚠️ Phase 1 (substrate) defines these helpers but nothing CALLS them yet —
 * there is no enforcement or UI gating. Wiring happens in Phase 2.
 */
import { db } from "@/lib/db";
import {
  isResource,
  isAction,
  type Resource,
  type Action,
} from "./permissionsRegistry";

export const QUIKCHAT_APP_SLUG = "quikchat";

/**
 * Resolved `App.id` for slug `quikchat`. Cached FOREVER once found — a slug's
 * row id does not change, and this is read on nearly every permission check.
 */
let cachedAppId: string | null = null;

/**
 * Absolute expiry of a cached MISS. Negative caching matters here because the
 * miss is the expensive case: `cachedAppId` used to be assigned only on success,
 * so an environment with no `App` row paid a DB round-trip on every `userCan`,
 * every `loadMyPermissions`, every `extraAdminCheck`, and once more per request
 * via `ensureUserRole` — the broken deployment was also the slowest one.
 *
 * OPERATIONAL NOTE: after someone INSERTS the missing row to fix a deployment,
 * permission-gated features stay dark for up to MISS_TTL_MS longer in each
 * running process. That is expected, not a failed fix. Restart the process (or
 * wait it out) rather than concluding the insert didn't take.
 */
let appIdMissUntil = 0;
const MISS_TTL_MS = 30_000;

async function getQuikChatAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  if (Date.now() < appIdMissUntil) return null;

  const app = await db.app.findUnique({
    where: { slug: QUIKCHAT_APP_SLUG },
    select: { id: true },
  });
  if (app) {
    cachedAppId = app.id;
    appIdMissUntil = 0;
    return cachedAppId;
  }
  appIdMissUntil = Date.now() + MISS_TTL_MS;
  return null;
}

/**
 * Test hook — drop BOTH the positive and negative caches.
 *
 * ⚠️ Required by any test file that exercises both the found and not-found
 * paths, because this module-level cache makes such a file order-dependent in
 * BOTH directions: a resolved App id sticks forever (so a later "no App row"
 * case can never be reached), and now a miss sticks for 30s (so a later "App
 * found" case sees null). `lib/authz/seed.test.ts` already carries a
 * "MUST run first" comment for the first half of that; call this in `beforeEach`
 * instead of relying on declaration order.
 */
export function __resetAppIdCacheForTest(): void {
  cachedAppId = null;
  appIdMissUntil = 0;
}

/** True for the protected admin role row (rename/delete guard). NOT a bypass. */
export function isAdminRole(
  role: { isSystem: boolean; name: string } | null | undefined,
): boolean {
  return !!role && role.isSystem && role.name === "admin";
}

/*
 * There is deliberately NO `isOrgAdmin()` here.
 *
 * One existed, was called only by its own tests, and was a trap: it answered
 * "does this user hold the seeded admin QcAppRole", which is NOT the question
 * the real gate asks. `requireAdmin` admits anyone at ADMIN_TIER_ROLES /
 * ROLE_HIERARCHY level 5 OR holding the v2 grant — so `isOrgAdmin` returned
 * FALSE for a platform org_admin who simply had not been bound yet, while
 * `requireAdmin` correctly returned true for the same request. A helper whose
 * name promises the general question and delivers a narrower one is worse than
 * no helper: the next person needing an admin check reaches for it by name.
 *
 * Need "is this caller an admin?" → use `requireAdmin` (lib/authz/requireAdmin).
 * Need "may they do X?" → use `userCan(userId, orgId, resource, action)`.
 */

/* ───────────────────────── Class-level checks ───────────────────────── */

/**
 * Does this user have `action` rights on `resource` in this org's QuikChat
 * instance?
 *
 * Resolves via:
 *   1. Any QcRolePermission row whose role belongs to the user (join), OR
 *   2. Any QcUserPermissionExtra row scoped to (userId, orgId).
 *
 * No admin bypass — admin gets access via its seeded grants. Fails CLOSED:
 * unknown resource/action, or a missing App row, returns false.
 */
export async function userCan(
  userId: string,
  orgId: string,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  if (!isResource(resource) || !isAction(action)) return false;

  const appId = await getQuikChatAppId();
  if (!appId) return false;

  const roleHit = await db.qcRolePermission.findFirst({
    where: {
      resource,
      action,
      role: {
        appId,
        members: { some: { userId, orgId } },
      },
    },
    select: { id: true },
  });
  if (roleHit) return true;

  const extraHit = await db.qcUserPermissionExtra.findFirst({
    where: { userId, orgId, resource, action },
    select: { id: true },
  });
  return !!extraHit;
}

/* ───────────────────────── Client-side effective set ───────────────────────── */

export interface MyPermissions {
  /** True iff the user holds ANY role with `isSystem && name === "admin"`. */
  isAdmin: boolean;
  /** Convenience: primary role id (first one assigned to the user). */
  roleId: string | null;
  /** Convenience: primary role name. */
  roleName: string | null;
  /** `${resource}:${action}` strings — UNION of role grants + user extras. */
  permissions: string[];
  /** Subset of `permissions` granted via `QcUserPermissionExtra` (not the role). */
  extras: string[];
}

/**
 * Compute the effective permission set for `userId` in `orgId`. Will power
 * `GET /api/me/permissions` + the client gate in Phase 2.
 */
export async function loadMyPermissions(
  userId: string,
  orgId: string,
): Promise<MyPermissions> {
  const empty: MyPermissions = {
    isAdmin: false,
    roleId: null,
    roleName: null,
    permissions: [],
    extras: [],
  };

  const appId = await getQuikChatAppId();
  if (!appId) return empty;

  const [userRoles, extras] = await Promise.all([
    db.qcUserAppRole.findMany({
      where: { userId, orgId, role: { appId } },
      select: {
        role: {
          select: {
            id: true,
            name: true,
            isSystem: true,
            permissions: { select: { resource: true, action: true } },
          },
        },
      },
      orderBy: { assignedAt: "asc" },
    }),
    db.qcUserPermissionExtra.findMany({
      where: { userId, orgId },
      select: { resource: true, action: true },
    }),
  ]);

  if (userRoles.length === 0 && extras.length === 0) return empty;

  const primary = userRoles[0]?.role ?? null;
  const isAdmin = !!userRoles.find((ur) => isAdminRole(ur.role));

  const permSet = new Set<string>();
  for (const ur of userRoles) {
    for (const p of ur.role.permissions) permSet.add(`${p.resource}:${p.action}`);
  }
  const extrasArr: string[] = [];
  for (const e of extras) {
    const key = `${e.resource}:${e.action}`;
    extrasArr.push(key);
    permSet.add(key);
  }

  return {
    isAdmin,
    roleId: primary?.id ?? null,
    roleName: primary?.name ?? null,
    permissions: Array.from(permSet),
    extras: extrasArr,
  };
}

/** Standard 403 response matching QuikChat's uniform `{ error }` body. */
export function forbidden(
  message = "You do not have permission to perform this action",
): Response {
  return Response.json({ error: message }, { status: 403 });
}

/**
 * Batch "which of these users currently hold the Guest role" — powers the
 * Teams-style "External" badge on `PublicUser.isGuest`. One indexed query
 * regardless of how many userIds are passed; empty input/no App row short-
 * circuits to an empty set (fails closed — no badge rather than a wrong one).
 */
export async function getGuestUserIds(orgId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const appId = await getQuikChatAppId();
  if (!appId) return new Set();
  const rows = await db.qcUserAppRole.findMany({
    where: { orgId, userId: { in: userIds }, role: { appId, name: "Guest" } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

export { getQuikChatAppId };
