/**
 * Server-side permission gate for QuikAsset's dynamic-roles system.
 *
 * Storage model (all in the app_quikasset schema):
 *   - Roles                          → `AstAppRole`
 *   - User → role mapping             → `AstUserAppRole`
 *   - Role grants (resource, action)  → `AstRolePermission`
 *   - Per-user additive grants        → `AstUserPermissionExtra`
 *
 * Permission decision: effective = role grants UNION per-user extras.
 * There is no admin bypass — the seeded admin role simply holds every grant.
 *
 *   const allowed = await userCan(userId, orgId, "Asset", "create");
 *   if (!allowed) return forbidden();
 */
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { isResource, isAction, type Resource, type Action } from "@/lib/api/permissionsRegistry";

export const QUIKASSET_APP_SLUG = "quikasset";

let cachedAppId: string | null = null;
export async function getQuikAssetAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await db.app.findUnique({
    where: { slug: QUIKASSET_APP_SLUG },
    select: { id: true },
  });
  if (app) cachedAppId = app.id;
  return cachedAppId;
}

/** True for the protected admin role row (rename/delete guard). NOT a bypass. */
export function isAdminRole(role: { isSystem: boolean; name: string } | null | undefined): boolean {
  return !!role && role.isSystem && role.name === "admin";
}

/** True if `userId` holds the system "admin" AstAppRole in this org. */
export async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const appId = await getQuikAssetAppId();
  if (!appId) return false;
  const hit = await db.astUserAppRole.findFirst({
    where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
    select: { id: true },
  });
  return !!hit;
}

/**
 * Does this user have `action` rights on `resource` in this org's QuikAsset
 * instance? Resolves via role grants (UserAppRole join) OR per-user extras.
 */
export async function userCan(
  userId: string,
  orgId: string,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  if (!isResource(resource) || !isAction(action)) return false;

  const appId = await getQuikAssetAppId();
  if (!appId) return false;

  const roleHit = await db.astRolePermission.findFirst({
    where: {
      resource,
      action,
      role: { appId, members: { some: { userId, orgId } } },
    },
    select: { id: true },
  });
  if (roleHit) return true;

  const extraHit = await db.astUserPermissionExtra.findFirst({
    where: { userId, orgId, resource, action },
    select: { id: true },
  });
  return !!extraHit;
}

export interface MyPermissions {
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  permissions: string[];
  extras: string[];
}

/** Effective permission set for `userId` in `orgId` — powers the client gate. */
export async function loadMyPermissions(userId: string, orgId: string): Promise<MyPermissions> {
  const empty: MyPermissions = { isAdmin: false, roleId: null, roleName: null, permissions: [], extras: [] };

  const appId = await getQuikAssetAppId();
  if (!appId) return empty;

  const [userRoles, extras] = await Promise.all([
    db.astUserAppRole.findMany({
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
    db.astUserPermissionExtra.findMany({
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
