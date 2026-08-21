/**
 * Server-side permission gate for QuikFlow's dynamic-roles v2 system.
 *
 * Storage model:
 *   - Roles                          → `app_quikflow.AppRole`   (Prisma: WfAppRole)
 *   - User → role mapping             → `app_quikflow.UserAppRole` (WfUserAppRole)
 *   - Role grants (resource, action)  → `app_quikflow.RolePermission` (WfRolePermission)
 *
 * QuikFlow deliberately has no `UserPermissionExtra` table (unlike
 * QuikScale) — every grant lives on a role, and per-user exceptions are
 * handled by putting the user on a differently-scoped role instead. One
 * table (RolePermission) to manage, one to read.
 *
 * The `isSystem=true` flag on the admin role does NOT bypass permission
 * checks — admin is editable like any other role, seeded with every grant.
 * The flag only protects against rename/delete (see
 * `app/api/org/roles/[id]/route.ts`).
 *
 * Usage at the top of any handler:
 *
 *   const allowed = await userCan(userId, orgId, "Workflows", "create");
 *   if (!allowed) return forbidden();
 *
 * Mirrors apps/quikscale/lib/api/permissions.ts, minus the UserPermissionExtra layer.
 */
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { isResource, isAction, type Resource, type Action } from "@/lib/api/permissionsRegistry";

export const QUIKFLOW_APP_SLUG = "quikflow";

let cachedAppId: string | null = null;
export async function getQuikFlowAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await db.app.findUnique({
    where: { slug: QUIKFLOW_APP_SLUG },
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

/** True if `userId` holds the system "admin" AppRole in this org. */
export async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const appId = await getQuikFlowAppId();
  if (!appId) return false;
  const hit = await db.wfUserAppRole.findFirst({
    where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
    select: { id: true },
  });
  return !!hit;
}

/* ───────────────────────── Class-level checks ───────────────────────── */

/**
 * Does this user have `action` rights on `resource` in this tenant's
 * QuikFlow instance?
 *
 * Resolves via any RolePermission row whose role belongs to the user
 * (UserAppRole join). No admin bypass — admin gets access via its (seeded)
 * RolePermission grants.
 */
export async function userCan(
  userId: string,
  orgId: string,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  if (!isResource(resource) || !isAction(action)) return false;

  const appId = await getQuikFlowAppId();
  if (!appId) return false;

  const roleHit = await db.wfRolePermission.findFirst({
    where: {
      resource,
      action,
      role: { appId, members: { some: { userId, orgId } } },
    },
    select: { id: true },
  });
  return !!roleHit;
}

/* ───────────────────────── Client-side effective set ───────────────────────── */

export interface MyPermissions {
  /** True iff the user holds ANY role with `isSystem && name === "admin"`. */
  isAdmin: boolean;
  /** Convenience: primary role id (first one assigned to the user). */
  roleId: string | null;
  /** Convenience: primary role name. */
  roleName: string | null;
  /** `${resource}:${action}` strings granted via the user's role(s). */
  permissions: string[];
}

/**
 * Compute the effective permission set for `userId` in `orgId`. Used by
 * `/api/me/permissions` to power the client-side gate.
 */
export async function loadMyPermissions(userId: string, orgId: string): Promise<MyPermissions> {
  const empty: MyPermissions = { isAdmin: false, roleId: null, roleName: null, permissions: [] };

  const appId = await getQuikFlowAppId();
  if (!appId) return empty;

  const userRoles = await db.wfUserAppRole.findMany({
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
  });

  if (userRoles.length === 0) return empty;

  const primary = userRoles[0]?.role ?? null;
  const isAdmin = !!userRoles.find((ur) => isAdminRole(ur.role));

  const permSet = new Set<string>();
  for (const ur of userRoles) {
    for (const p of ur.role.permissions) permSet.add(`${p.resource}:${p.action}`);
  }

  return {
    isAdmin,
    roleId: primary?.id ?? null,
    roleName: primary?.name ?? null,
    permissions: Array.from(permSet),
  };
}

/** Standard 403 response for permission-denied. */
export function forbidden(message = "You do not have permission to perform this action") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}
