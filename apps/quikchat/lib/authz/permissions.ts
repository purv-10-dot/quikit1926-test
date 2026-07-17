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

let cachedAppId: string | null = null;
async function getQuikChatAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await db.app.findUnique({
    where: { slug: QUIKCHAT_APP_SLUG },
    select: { id: true },
  });
  if (app) cachedAppId = app.id;
  return cachedAppId;
}

/** True for the protected admin role row (rename/delete guard). NOT a bypass. */
export function isAdminRole(
  role: { isSystem: boolean; name: string } | null | undefined,
): boolean {
  return !!role && role.isSystem && role.name === "admin";
}

/**
 * True if `userId` holds the system "admin" QcAppRole in this org.
 *
 * Unlike `userCan()`, this IGNORES `QcUserPermissionExtra` — per-user extras
 * are additive grants, not a role promotion. Routes that gate strictly on
 * "is this user an admin?" use this instead of `userCan(...)`. The name match
 * is lowercase `"admin"` (canonical, matches the seeded row + the Phase-2
 * `extraAdminCheck` bridge + every assignAppRoles call).
 */
export async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const appId = await getQuikChatAppId();
  if (!appId) return false;
  const hit = await db.qcUserAppRole.findFirst({
    where: {
      userId,
      orgId,
      role: { appId, isSystem: true, name: "admin" },
    },
    select: { id: true },
  });
  return !!hit;
}

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

export { getQuikChatAppId };
