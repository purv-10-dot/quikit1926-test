/**
 * Server-side permission gate for the dynamic-roles v2 system.
 *
 * Storage model:
 *   - Roles                          → `app_quikscale.AppRole`
 *   - User → role mapping             → `app_quikscale.UserAppRole`
 *   - Role grants (resource, action)  → `app_quikscale.RolePermission`
 *   - Per-user additive grants        → `app_quikscale.UserPermissionExtra`
 *
 * Sidebar visibility is derived from entity `view` grants via
 * `NAV_RESOURCE` in `permissionsRegistry.ts` — there is no separate
 * navigation permission table.
 *
 * Permission decision:
 *   effective = role grants UNION per-user extras
 *
 * The `isSystem=true` flag on the admin role no longer bypasses
 * permission checks — admin is editable like any other role. The flag
 * only protects against rename/delete (see `app/api/org/roles/[id]/route.ts`).
 *
 * Usage at the top of any handler:
 *
 *   const allowed = await userCan(userId, orgId, "KPI", "create");
 *   if (!allowed) return forbidden();
 */
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import {
  isResource,
  isAction,
  type Resource,
  type Action,
} from "@/lib/api/permissionsRegistry";

export const QUIKSCALE_APP_SLUG = "quikscale";

let cachedAppId: string | null = null;
async function getQuikScaleAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await db.app.findUnique({
    where: { slug: QUIKSCALE_APP_SLUG },
    select: { id: true },
  });
  if (app) cachedAppId = app.id;
  return cachedAppId;
}

/** True for the protected admin role row (rename/delete guard). NOT a bypass. */
export function isAdminRole(role: { isSystem: boolean; name: string } | null | undefined): boolean {
  return !!role && role.isSystem && role.name === "admin";
}

/**
 * True if `userId` holds the system "admin" AppRole in this org.
 *
 * Unlike `userCan()`, this check **ignores** `UserPermissionExtra` rows —
 * per-user extras are additive grants, not a role promotion. Routes that
 * gate strictly on "is this user an admin?" (e.g. the Habits aggregate
 * dashboard, which would leak everyone else's responses to a non-admin
 * granted Habits:view) use this helper instead of `userCan(...)`.
 */
export async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const appId = await getQuikScaleAppId();
  if (!appId) return false;
  const hit = await db.userAppRole.findFirst({
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
 * Does this user have `action` rights on `resource` in this tenant's
 * QuikScale instance?
 *
 * Resolves via:
 *   1. Any RolePermission row whose role belongs to the user (UserAppRole join).
 *   2. OR any UserPermissionExtra row scoped to (userId, orgId).
 *
 * No admin bypass — admin gets access via its (seeded) RolePermission grants.
 * Instance-level rules (e.g. "user can edit only their own KPIs") still
 * live in the per-feature permission helpers above this layer.
 */
export async function userCan(
  userId: string,
  orgId: string,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  if (!isResource(resource) || !isAction(action)) return false;

  const appId = await getQuikScaleAppId();
  if (!appId) return false;

  // 1. Role grants via UserAppRole join. One query — Prisma compiles to a
  //    single SELECT with EXISTS subqueries.
  const roleHit = await db.rolePermission.findFirst({
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

  // 2. Per-user additive grant.
  const extraHit = await db.userPermissionExtra.findFirst({
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
  /** Subset of `permissions` granted via `UserPermissionExtra` (not the role). */
  extras: string[];
}

/**
 * Compute the effective permission set for `userId` in `orgId`.
 * Used by `/api/me/permissions` to power the client-side gate.
 */
export async function loadMyPermissions(userId: string, orgId: string): Promise<MyPermissions> {
  const empty: MyPermissions = {
    isAdmin: false,
    roleId: null,
    roleName: null,
    permissions: [],
    extras: [],
  };

  const appId = await getQuikScaleAppId();
  if (!appId) return empty;

  const [userRoles, extras] = await Promise.all([
    db.userAppRole.findMany({
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
    db.userPermissionExtra.findMany({
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

/** Standard 403 response for permission-denied. */
export function forbidden(message = "You do not have permission to perform this action") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export { getQuikScaleAppId };
