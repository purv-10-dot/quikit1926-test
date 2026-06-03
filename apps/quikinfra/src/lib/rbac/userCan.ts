/**
 * QuikInfra — server-side permission check.
 *
 * Reads the v2 RBAC tables (CnUserAppRole + CnRolePermissionV2 +
 * CnUserPermissionExtra) and returns true if the user has the requested
 * (resource, action) grant for their org.
 *
 * No admin bypass — "admin" is a real role with real RolePermission rows
 * seeded from src/lib/permissions.ts. If admin's grants are unticked, the
 * check naturally returns false.
 *
 * Mirrors apps/quikscale/lib/api/permissions.ts userCan().
 */

import { cache } from "react";
import { db } from "@quikit/database";
import { isValidPermissionPair, type Action } from "./permissionsRegistry";

export const QUIKINFRA_APP_SLUG = "quikinfra";

let cachedAppId: string | null = null;

export async function getQuikInfraAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await db.app.findUnique({
    where: { slug: QUIKINFRA_APP_SLUG },
    select: { id: true },
  });
  if (app) cachedAppId = app.id;
  return cachedAppId;
}

/**
 * Does this user have `action` rights on `resource` in this org's QuikInfra
 * instance?
 *
 *   1. Check for a per-user REVOKE entry — if present, deny immediately.
 *      (Revokes override both role grants and additive grants — they're
 *      the strongest signal.)
 *   2. UserAppRole → AppRole → RolePermission matches  (role grant)
 *   3. UserPermissionExtra matches with revoke=false   (additive grant)
 *
 * Effective set = role_grants ∪ extras(revoke=false) − extras(revoke=true).
 * Returns false on invalid input, missing app row, or no matching grant.
 *
 * Wrapped in React `cache()` so repeat `(userId, orgId, resource, action)`
 * checks within the same request — typical when a handler gates first
 * with `requirePermission` and then re-checks inline — hit the DB once.
 */
export const userCan = cache(async (
  userId: string,
  orgId: string,
  resource: string,
  action: string,
): Promise<boolean> => {
  if (!isValidPermissionPair(resource, action)) return false;

  const appId = await getQuikInfraAppId();
  if (!appId) return false;

  // 1. Revoke check FIRST — a revoke entry trumps any role grant.
  //    The cast is needed until `npx prisma generate` refreshes the client
  //    types with the new `revoke` column.
  const revokeHit = await (db.cnUserPermissionExtra as unknown as {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
  }).findFirst({
    where: { userId, orgId, resource, action, revoke: true },
    select: { id: true },
  });
  if (revokeHit) return false;

  // 2. Role grant via UserAppRole join.
  const roleHit = await db.cnRolePermissionV2.findFirst({
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

  // 3. Per-user additive grant (revoke=false).
  const extraHit = await (db.cnUserPermissionExtra as unknown as {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
  }).findFirst({
    where: { userId, orgId, resource, action, revoke: false },
    select: { id: true },
  });
  return !!extraHit;
});

/** True for the protected admin role row (rename/delete guard). NOT a bypass. */
export function isAdminRole(
  role: { isSystem: boolean; name: string } | null | undefined,
): boolean {
  return !!role && role.isSystem && role.name === "admin";
}

/**
 * Load the effective permission set for one user in one org. Returns
 * { isAdmin, roleId, roleName, permissions, extras } — same shape as
 * quikscale's loadMyPermissions, used to power useMyPermissions() (Phase 5).
 *
 * `permissions` is the UNION of role grants + extras as `"resource:action"`
 * strings. `extras` is the subset granted via UserPermissionExtra only.
 */
export interface MyPermissions {
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  permissions: string[];
  extras: string[];
}

export async function loadMyPermissions(
  userId: string,
  orgId: string,
): Promise<MyPermissions> {
  const appId = await getQuikInfraAppId();
  if (!appId) {
    return { isAdmin: false, roleId: null, roleName: null, permissions: [], extras: [] };
  }

  const assignment = await db.cnUserAppRole.findFirst({
    where: { userId, orgId, role: { appId } },
    select: {
      role: {
        select: {
          id: true,
          name: true,
          isSystem: true,
          rolePermissions: { select: { resource: true, action: true } },
        },
      },
    },
  });

  // Pull ALL extras (grants + revokes). Cast until `prisma generate`
  // refreshes the client types with the new `revoke` column.
  const extras = (await (db.cnUserPermissionExtra as unknown as {
    findMany: (args: unknown) => Promise<
      Array<{ resource: string; action: string; revoke: boolean }>
    >;
  }).findMany({
    where: { userId, orgId },
    select: { resource: true, action: true, revoke: true },
  })) as Array<{ resource: string; action: string; revoke: boolean }>;

  const role = assignment?.role ?? null;
  const rolePairs = role
    ? role.rolePermissions.map((p: { resource: string; action: string }) => `${p.resource}:${p.action}`)
    : [];
  const grantPairs = extras
    .filter((p) => !p.revoke)
    .map((p) => `${p.resource}:${p.action}`);
  const revokePairs = new Set(
    extras.filter((p) => p.revoke).map((p) => `${p.resource}:${p.action}`),
  );

  // Effective = (role ∪ grants) − revokes
  const effective = Array.from(new Set([...rolePairs, ...grantPairs])).filter(
    (key) => !revokePairs.has(key),
  );

  return {
    isAdmin: isAdminRole(role),
    roleId: role?.id ?? null,
    roleName: role?.name ?? null,
    permissions: effective,
    extras: grantPairs,
  };
}

/** Re-export Action for callers that need the type. */
export type { Action };
