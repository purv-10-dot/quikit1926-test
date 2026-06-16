/**
 * Server-side permission gate for the QuikTrack Roles & Permissions v2 system.
 *
 * Storage model (shared with QuikScale â€” discriminated by `AppRole.appId`):
 *   - Roles                          â†’ `app_quikscale.AppRole`
 *   - User â†’ role mapping            â†’ `app_quikscale.UserAppRole`
 *   - Role grants (resource, action) â†’ `app_quikscale.RolePermission`
 *   - Sidebar visibility (navKey)    â†’ `app_quikscale.RoleNavigation`
 *   - Per-user additive grants       â†’ `app_quikscale.UserPermissionExtra`
 *
 * Permission decision:
 *   effective = role grants UNION per-user extras
 *
 * The `isSystem=true` flag on the admin role does NOT bypass checks â€”
 * admin is editable like any other role; the flag only protects against
 * rename/delete in the role API.
 *
 * Usage at the top of any handler (after withOrgAuth):
 *   if (!(await userCan(ctx.userId, ctx.orgId, "Issue", "create"))) {
 *     return forbidden();
 *   }
 */
import { NextResponse } from "next/server";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { db } from "@/lib/db";
import {
  NAV_ITEMS,
  NAV_TO_ENTITY,
  isAction,
  isNavKey,
  isResource,
  SPACE_ADMIN_ROLE_NAME,
  type Action,
  type Resource,
} from "@/lib/api/permissionsRegistry";

export const QUIKTRACK_APP_SLUG = "quiktrack";

let cachedAppId: string | null = null;
async function getQuikTrackAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await db.app.findUnique({
    where: { slug: QUIKTRACK_APP_SLUG },
    select: { id: true },
  });
  if (app) cachedAppId = app.id;
  return cachedAppId;
}

/** Protected admin row guard (rename/delete). NOT a permission bypass. */
export function isAdminRole(
  role: { isSystem: boolean; name: string } | null | undefined,
): boolean {
  return !!role && role.isSystem && role.name === "admin";
}

/**
 * True when the user holds the QuikTrack app-admin role (QtUserAppRole →
 * QtAppRole, isSystem + name "admin") for this org — the dynamic-RBAC v2
 * admin, distinct from the legacy `OrgMember.role` tier.
 *
 * Use this ALONGSIDE the org-tier check so app-admins get the same
 * org-wide visibility/actions as org owners/admins:
 *   const isAdmin =
 *     m?.role === "admin" || m?.role === "owner" ||
 *     (await isQuikTrackAppAdmin(userId, orgId));
 */
export async function isQuikTrackAppAdmin(userId: string, orgId: string): Promise<boolean> {
  const appId = await getQuikTrackAppId();
  if (!appId) return false;
  const appAdmin = await db.qtUserAppRole.findFirst({
    where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
    select: { id: true },
  });
  return !!appAdmin;
}

/**
 * Unified "admin access" predicate for QuikTrack — the canonical replacement
 * for the scattered, hand-rolled `role === "admin" || role === "owner"`
 * checks. Returns true when the user is EITHER:
 *   - an org-tier admin — `OrgMember.role` ∈ ADMIN_TIER_ROLES (super_admin,
 *     org_admin, legacy "admin") or "owner"; OR
 *   - a QuikTrack app-admin — holds the `QtAppRole` "admin" (dynamic-RBAC v2).
 *
 * Notes:
 *   - The legacy `=== "admin" || "owner"` checks were wrong twice over: they
 *     LOCKED OUT `super_admin`/`org_admin` (the v4 role names) and ignored
 *     app-admins entirely. ADMIN_TIER_ROLES fixes the former; the v2 lookup
 *     fixes the latter.
 *   - Platform super-admin (`User.isSuperAdmin`) is intentionally NOT checked:
 *     consumer apps force `session.user.isSuperAdmin = false`, so the in-app
 *     equivalent is the `super_admin` ROLE tier, already covered above.
 */
export async function hasAdminAccess(userId: string, orgId: string): Promise<boolean> {
  const m = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  if (m?.role && (ADMIN_TIER_ROLES.has(m.role) || m.role === "owner")) return true;
  return isQuikTrackAppAdmin(userId, orgId);
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Class-level checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export async function userCan(
  userId: string,
  orgId: string,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  if (!isResource(resource) || !isAction(action)) return false;

  const appId = await getQuikTrackAppId();
  if (!appId) return false;

  const roleHit = await db.qtRolePermission.findFirst({
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

  const extraHit = await db.qtUserPermissionExtra.findFirst({
    where: { userId, orgId, resource, action },
    select: { id: true },
  });
  return !!extraHit;
}

/**
 * Sidebar-visibility check. Resolution order:
 *   1. Nav keys that map to an entity (Project → spaces, Timesheet → timesheet,
 *      Report → reports) are satisfied when the role has `view` on that entity.
 *      No separate nav grant required — the Entities tab is the single
 *      source of truth.
 *   2. Otherwise (pure-navigation items: home / dashboards / plans), the row
 *      must be explicitly granted in QtRoleNavigation.
 */
export async function userHasNav(
  userId: string,
  orgId: string,
  navKey: string,
): Promise<boolean> {
  // Derived navs — check view grant on the mapped entity.
  const mappedEntity = NAV_TO_ENTITY[navKey];
  if (mappedEntity) {
    return userCan(userId, orgId, mappedEntity as Resource, "view");
  }

  if (!isNavKey(navKey)) return false;

  const appId = await getQuikTrackAppId();
  if (!appId) return false;

  const hit = await db.qtRoleNavigation.findFirst({
    where: {
      navKey,
      role: {
        appId,
        members: { some: { userId, orgId } },
      },
    },
    select: { id: true },
  });
  return !!hit;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Client-side effective set â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export interface MyPermissions {
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  /** `${resource}:${action}` strings â€” UNION of role grants + user extras. */
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

  const appId = await getQuikTrackAppId();
  if (!appId) return empty;

  const [userRoles, extras] = await Promise.all([
    db.qtUserAppRole.findMany({
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
    db.qtUserPermissionExtra.findMany({
      where: { userId, orgId },
      select: { resource: true, action: true },
    }),
  ]);

  if (userRoles.length === 0 && extras.length === 0) return empty;

  const primary = userRoles[0]?.role ?? null;
  const isAdmin = !!userRoles.find((ur) => isAdminRole(ur.role));

  const permSet = new Set<string>();
  const explicitNavs = new Set<string>();
  for (const ur of userRoles) {
    for (const p of ur.role.permissions) permSet.add(`${p.resource}:${p.action}`);
    for (const n of ur.role.navigations) explicitNavs.add(n.navKey);
  }
  const extrasArr: string[] = [];
  for (const e of extras) {
    const key = `${e.resource}:${e.action}`;
    extrasArr.push(key);
    permSet.add(key);
  }

  // Build the effective nav set with the same resolution rules as
  // `userHasNav()`:
  //   - Derived navs (in NAV_TO_ENTITY) — driven ONLY by the mapped entity's
  //     `view` grant. Old explicit rows in QtRoleNavigation for these keys
  //     are intentionally ignored so revoking Timesheet:view actually hides
  //     the Timesheet sidebar row.
  //   - Nav-only items (in NAV_ITEMS) — driven by the explicit
  //     QtRoleNavigation row.
  const navSet = new Set<string>();
  const navOnlyKeys = new Set<string>(NAV_ITEMS.map((n) => n.key));
  for (const key of explicitNavs) {
    if (navOnlyKeys.has(key)) navSet.add(key);
  }
  for (const [navKey, entity] of Object.entries(NAV_TO_ENTITY)) {
    if (permSet.has(`${entity}:view`)) navSet.add(navKey);
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

export function forbidden(
  message = "You do not have permission to perform this action",
) {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export { getQuikTrackAppId };

/* ───────────────────────── Project-scoped checks ───────────────────────── */

/**
 * Project-scoped permission check. The project (custom) role is AUTHORITATIVE
 * inside its space and OVERRIDES the app-wide (global) role. Resolution order:
 *
 *   1. App-admin → always allowed (highest priority; a restrictive project
 *      role can never lock an admin out).
 *   2. User holds a project role in THIS space → that role's grants (plus the
 *      user's per-user extras) are the WHOLE story. The app-wide role is NOT
 *      consulted — so un-granting a permission at the project level genuinely
 *      denies it, even when the app-wide role grants it.
 *   3. User has NO project role here → fall back to the app-wide grant.
 *
 * No explicit DENY layer today; within the authoritative project role, absence
 * of a grant = denied.
 */
export async function userCanInProject(
  userId: string,
  orgId: string,
  projectId: string,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  if (!isResource(resource) || !isAction(action)) return false;

  // 1. App-admins bypass everything. (Previously this was covered implicitly by
  //    the app-wide grant check, which ran first. Now that the project role can
  //    override the app-wide role, admins must be short-circuited explicitly.)
  if (await hasAdminAccess(userId, orgId)) return true;

  // 2. The project role assigned to this user in this space (≤1 — unique on
  //    [projectId, userId]) is authoritative when present.
  const assignment = await db.qtProjectUserRole.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { projectRoleId: true, projectRole: { select: { name: true } } },
  });

  if (assignment) {
    // Space Admin = full access within its space (locked, like an app admin
    // scoped to this project). Covers every resource, incl. ones added later.
    if (assignment.projectRole.name === SPACE_ADMIN_ROLE_NAME) return true;
    const hit = await db.qtProjectRolePermission.findFirst({
      where: { projectRoleId: assignment.projectRoleId, resource, action },
      select: { id: true },
    });
    if (hit) return true;
    // Per-user extras still apply as an additive override for a single user.
    const extraHit = await db.qtUserPermissionExtra.findFirst({
      where: { userId, orgId, resource, action },
      select: { id: true },
    });
    return !!extraHit;
  }

  // 3. No project role in this space → fall back to the app-wide grant.
  return userCan(userId, orgId, resource, action);
}
