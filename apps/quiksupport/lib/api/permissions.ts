/**
 * Server-side permission gate for QuikSupport's standard QuikIT RBAC (Qsp*).
 *
 * Storage model (schema `app_quiksupport`, @@map'd to the canonical names the
 * admin portal reads via raw SQL):
 *   - Roles                          → `AppRole`            (QspAppRole)
 *   - User → role mapping            → `UserAppRole`        (QspUserAppRole)
 *   - Role grants (resource, action) → `RolePermission`     (QspRolePermission)
 *   - Sidebar visibility (navKey)    → `RoleNavigation`     (QspRoleNavigation)
 *   - Per-user additive grants       → `UserPermissionExtra`(QspUserPermissionExtra)
 *
 * Permission decision:  effective = role grants ∪ per-user extras
 *
 * This is the platform-standard permission layer (same shape as
 * quiktrack/quikscale). The helpdesk's own `HdUser.role` remains the in-app
 * domain gate; this layer is what the admin portal + cross-app tooling read.
 *
 * `isSystem=true` on the admin role does NOT bypass checks — admin is editable
 * like any other role; the flag only protects rename/delete in the role API.
 */
import { NextResponse } from "next/server";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { db } from "@/lib/db";
import { getQuikSupportAppId } from "@/lib/api/seedAppRole";
import { isAction, isNavKey, isResource } from "@/lib/api/permissionsRegistry";

/** Protected admin row guard (rename/delete). NOT a permission bypass. */
export function isAdminRole(
  role: { isSystem: boolean; name: string } | null | undefined,
): boolean {
  return !!role && role.isSystem && role.name === "admin";
}

/**
 * True when the user holds the QuikSupport app-admin role (QspUserAppRole →
 * QspAppRole, isSystem + name "admin") for this org — the standard-RBAC admin,
 * distinct from the central `OrgMember.role` tier and from `HdUser.role`.
 */
export async function isQuikSupportAppAdmin(userId: string, orgId: string): Promise<boolean> {
  const appId = await getQuikSupportAppId();
  if (!appId) return false;
  const appAdmin = await db.qspUserAppRole.findFirst({
    where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
    select: { id: true },
  });
  return !!appAdmin;
}

/**
 * Unified "admin access" predicate: true when the user is EITHER an org-tier
 * admin (`OrgMember.role` ∈ ADMIN_TIER_ROLES or "owner") OR a QuikSupport
 * app-admin (QspAppRole "admin"). Mirrors quiktrack's `hasAdminAccess`.
 */
export async function hasAdminAccess(userId: string, orgId: string): Promise<boolean> {
  const m = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  if (m?.role && (ADMIN_TIER_ROLES.has(m.role) || m.role === "owner")) return true;
  return isQuikSupportAppAdmin(userId, orgId);
}

/* ───────────────────────── Class-level checks ───────────────────────── */

export async function userCan(
  userId: string,
  orgId: string,
  resource: string,
  action: string,
): Promise<boolean> {
  if (!isResource(resource) || !isAction(action)) return false;

  const appId = await getQuikSupportAppId();
  if (!appId) return false;

  const roleHit = await db.qspRolePermission.findFirst({
    where: {
      resource,
      action,
      role: { appId, members: { some: { userId, orgId } } },
    },
    select: { id: true },
  });
  if (roleHit) return true;

  const extraHit = await db.qspUserPermissionExtra.findFirst({
    where: { userId, orgId, resource, action },
    select: { id: true },
  });
  return !!extraHit;
}

/** Sidebar-visibility check — explicit `RoleNavigation` grant for the user's role. */
export async function userHasNav(
  userId: string,
  orgId: string,
  navKey: string,
): Promise<boolean> {
  if (!isNavKey(navKey)) return false;

  const appId = await getQuikSupportAppId();
  if (!appId) return false;

  const hit = await db.qspRoleNavigation.findFirst({
    where: {
      navKey,
      role: { appId, members: { some: { userId, orgId } } },
    },
    select: { id: true },
  });
  return !!hit;
}

/* ───────────────────── Client-side effective set ───────────────────── */

export interface MyPermissions {
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  /** `${resource}:${action}` strings — UNION of role grants + user extras. */
  permissions: string[];
  /** Subset of `permissions` granted via `UserPermissionExtra`. */
  extras: string[];
  /** navKeys this user can see in the sidebar (role grants only). */
  navigation: string[];
}

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
    navigation: [],
  };

  const appId = await getQuikSupportAppId();
  if (!appId) return empty;

  const [userRoles, extras] = await Promise.all([
    db.qspUserAppRole.findMany({
      where: { userId, orgId, role: { appId } },
      select: {
        role: {
          select: {
            id: true,
            name: true,
            isSystem: true,
            permissions: { select: { resource: true, action: true } },
            navigations: { select: { navKey: true } },
          },
        },
      },
      orderBy: { assignedAt: "asc" },
    }),
    db.qspUserPermissionExtra.findMany({
      where: { userId, orgId },
      select: { resource: true, action: true },
    }),
  ]);

  if (userRoles.length === 0 && extras.length === 0) return empty;

  const primary = userRoles[0]?.role ?? null;
  const isAdmin = !!userRoles.find((ur) => isAdminRole(ur.role));

  const permSet = new Set<string>();
  const navSet = new Set<string>();
  for (const ur of userRoles) {
    for (const p of ur.role.permissions) permSet.add(`${p.resource}:${p.action}`);
    for (const n of ur.role.navigations) navSet.add(n.navKey);
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
    navigation: Array.from(navSet),
  };
}

export function forbidden(message = "You don't have access to this.") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}
