/**
 * Server-side permission gate for the QuikIT RBAC v2 layer on QuikSocial.
 *
 * Storage model:
 *   - Roles                          → app_quiksocial.AppRole         (Prisma: QsAppRole)
 *   - User → role mapping             → app_quiksocial.UserAppRole     (Prisma: QsUserAppRole)
 *   - Role grants (resource, action)  → app_quiksocial.RolePermission  (Prisma: QsRolePermission)
 *   - Sidebar visibility              → app_quiksocial.RoleNavigation  (Prisma: QsRoleNavigation)
 *
 * No `UserPermissionExtra` table this round — the per-user additive layer
 * is out of scope. `loadMyPermissions().extras` always returns `[]` so the
 * response shape stays forward-compatible.
 *
 * Decision rule (currently): effective = role grants. (Extras layer added later.)
 *
 * The `isSystem=true` flag on the Admin role does NOT bypass permission
 * checks — Admin gets access via its seeded RolePermission grants. The
 * flag only protects against rename/delete on the role row.
 *
 * BrandMembership is unchanged and untouched by this gate. Per-brand
 * role enforcement (admin/approver/member) still lives in lib/auth/rbac.ts.
 */
import { db } from "@quikit/database";
import { NextResponse } from "next/server";
import {
  isResource,
  isAction,
  type Resource,
  type Action,
} from "@/lib/rbac/permissionsRegistry";
import { getQuikSocialAppId } from "@/lib/rbac/seedDefaultRoles";

/** True for the protected Admin role row (rename/delete guard). NOT a bypass. */
export function isAdminRole(
  role: { isSystem: boolean; name: string } | null | undefined,
): boolean {
  return !!role && role.isSystem && role.name === "Admin";
}

/* ───────────────────────── Class-level checks ───────────────────────── */

/**
 * Does this user have `action` rights on `resource` in this org's
 * QuikSocial instance?
 *
 * Resolves via a single Prisma findFirst — compiles to one SELECT with
 * an EXISTS subquery joining QsUserAppRole → QsAppRole → QsRolePermission.
 *
 * No admin bypass — Admin gets access through its (seeded) RolePermission
 * grants. Instance-level rules (e.g. "user can only edit their own
 * brand") still live in per-feature permission helpers above this layer.
 */
export async function userCan(
  userId: string,
  orgId: string,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  if (!isResource(resource) || !isAction(action)) return false;

  const appId = await getQuikSocialAppId();
  if (!appId) return false;

  const roleHit = await db.qsRolePermission.findFirst({
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
  return !!roleHit;
}

/* ──────────────────── Client-side effective set ──────────────────── */

export interface MyPermissions {
  /** True iff the user holds ANY role with `isSystem && name === "Admin"`. */
  isAdmin: boolean;
  /** Convenience: primary role id (first assigned). */
  roleId: string | null;
  /** Convenience: primary role name. */
  roleName: string | null;
  /** `${resource}:${action}` strings — UNION of role grants (and future extras). */
  permissions: string[];
  /**
   * Subset of `permissions` granted via per-user extras. Always [] in this
   * round — kept on the response shape so adding UserPermissionExtra later
   * doesn't break clients.
   */
  extras: string[];
}

/**
 * Compute the effective permission set for `userId` in `orgId`.
 * Powers the client-side gate via GET /api/me/permissions.
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

  const appId = await getQuikSocialAppId();
  if (!appId) return empty;

  const userRoles = await db.qsUserAppRole.findMany({
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
    for (const p of ur.role.permissions) {
      permSet.add(`${p.resource}:${p.action}`);
    }
  }

  return {
    isAdmin,
    roleId: primary?.id ?? null,
    roleName: primary?.name ?? null,
    permissions: Array.from(permSet),
    extras: [],
  };
}

/** Standard 403 response for permission-denied. */
export function forbidden(
  message = "You do not have permission to perform this action",
) {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}
