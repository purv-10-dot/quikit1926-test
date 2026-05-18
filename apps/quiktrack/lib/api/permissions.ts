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
import { db } from "@/lib/db";
import {
  NAV_ITEMS,
  NAV_TO_ENTITY,
  isAction,
  isNavKey,
  isResource,
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
 * Project-scoped permission check. Combines:
 *   1. App-wide grants (QtAppRole) — works across every project.
 *   2. App-wide per-user extras (QtUserPermissionExtra).
 *   3. Project-scoped grants (QtProjectRole) — only valid inside this project.
 *
 * A `true` from any layer is sufficient. No explicit DENY layer today (the
 * Jira doc's scheme rules with DENY effect is a future enhancement; for now
 * absence = denied).
 */
export async function userCanInProject(
  userId: string,
  orgId: string,
  projectId: string,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  if (await userCan(userId, orgId, resource, action)) return true;

  // Project-scoped grants — Layer 2. Resolve via:
  //   QtProjectUserRole(userId, projectId) → projectRoleId
  //     → QtProjectRolePermission(projectRoleId, resource, action)
  const hit = await db.qtProjectRolePermission.findFirst({
    where: {
      resource,
      action,
      projectRole: {
        projectId,
        members: { some: { userId } },
      },
    },
    select: { id: true },
  });
  return !!hit;
}
