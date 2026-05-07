/**
 * Server-side permission gate for the dynamic-roles system.
 *
 * Usage at the top of any handler:
 *
 *   const allowed = await userCan(userId, orgId, "KPI", "create");
 *   if (!allowed) return forbidden();
 *
 * The check resolves the user's AppRole via the `app_quikscale.UserAppRole`
 * join table (filtered to the QuikScale `appId`). System roles
 * (`isSystem=true && name="admin"`) bypass the permission table entirely.
 *
 * Storage model (post 2026-05-06 rename):
 *   - Roles → `app_quikscale.AppRole`           (was CustomRole)
 *   - User → role mapping → `app_quikscale.UserAppRole`
 *     (replaces the `appRoleId` column that used to live on
 *      `quikit.UserAppAccess`).
 */
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import {
  isResource,
  isAction,
  isNavKey,
  type Resource,
  type Action,
} from "@quikit/shared";

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

interface AccessRow {
  roleId: string;
  role: { id: string; isSystem: boolean; name: string };
}

/** Resolve the user's currently-assigned AppRole in the org. */
async function loadAccess(userId: string, orgId: string): Promise<AccessRow | null> {
  const appId = await getQuikScaleAppId();
  if (!appId) return null;
  const ua = await db.userAppRole.findFirst({
    where: { userId, orgId, role: { appId } },
    select: {
      role: { select: { id: true, name: true, isSystem: true } },
    },
  });
  if (!ua) return null;
  return { roleId: ua.role.id, role: ua.role };
}

export function isAdminRole(role: { isSystem: boolean; name: string } | null | undefined): boolean {
  return !!role && role.isSystem && role.name === "admin";
}

/**
 * Class-level check: does this user have `action` rights on `resource` in
 * this tenant's QuikScale instance?
 *
 * Instance-level rules (e.g. "user can edit only their own KPIs") still
 * live in the per-feature permission helpers (`canEditKPI`, etc.) — this
 * function is the gate one level above them.
 */
export async function userCan(
  userId: string,
  orgId: string,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  if (!isResource(resource) || !isAction(action)) return false;

  const access = await loadAccess(userId, orgId);
  if (!access) return false;
  if (isAdminRole(access.role)) return true;

  const grant = await db.rolePermission.findUnique({
    where: { roleId_resource_action: { roleId: access.roleId, resource, action } },
    select: { id: true },
  });
  return !!grant;
}

/** Same idea, for navigation visibility. */
export async function userHasNav(
  userId: string,
  orgId: string,
  navKey: string,
): Promise<boolean> {
  if (!isNavKey(navKey)) return false;
  const access = await loadAccess(userId, orgId);
  if (!access) return false;
  if (isAdminRole(access.role)) return true;

  const row = await db.roleNavigation.findUnique({
    where: { roleId_navKey: { roleId: access.roleId, navKey } },
    select: { id: true },
  });
  return !!row;
}

/**
 * Effective permission set for the current user. Used by the client-side
 * gate (`/api/me/permissions` returns this object so the sidebar + buttons
 * can render decisively without a per-action round-trip).
 */
export interface MyPermissions {
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  /** Set of `${resource}:${action}` strings for fast O(1) lookup on the client. */
  permissions: string[];
  /** navKeys this user can see in the sidebar. */
  navigation: string[];
}

export async function loadMyPermissions(userId: string, orgId: string): Promise<MyPermissions> {
  const empty: MyPermissions = {
    isAdmin: false,
    roleId: null,
    roleName: null,
    permissions: [],
    navigation: [],
  };

  const appId = await getQuikScaleAppId();
  if (!appId) return empty;

  const ua = await db.userAppRole.findFirst({
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
  });

  if (!ua) return empty;
  const role = ua.role;
  const isAdmin = isAdminRole(role);

  return {
    isAdmin,
    roleId: role.id,
    roleName: role.name,
    permissions: role.permissions.map((p: { resource: string; action: string }) => `${p.resource}:${p.action}`),
    navigation: role.navigations.map((n: { navKey: string }) => n.navKey),
  };
}

/** Standard 403 response for permission-denied. */
export function forbidden(message = "You do not have permission to perform this action") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export { getQuikScaleAppId };
