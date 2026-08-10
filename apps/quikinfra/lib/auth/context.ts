/**
 * Server-side auth + tenant context for API routes.
 *
 * Usage in any route handler:
 *
 *   export async function GET(req: NextRequest) {
 *     const ctxOrResponse = await requireAuth();
 *     if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
 *     const ctx = ctxOrResponse;
 *     // ... use ctx.orgId, ctx.userId, etc.
 *   }
 *
 * Or with permission gating:
 *
 *   const ctxOrResponse = await requirePermission("boq.lock");
 *   if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
 *
 * Contract:
 *  - Tenant/org/role/permissions are resolved server-side only. Never trust
 *    client-provided values.
 *  - Returns a NextResponse (401/403) on failure so route handlers can
 *    short-circuit: `if (x instanceof NextResponse) return x`.
 *  - On success, returns a fully-populated TenantContext.
 */

import { cache } from "react";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { ROLE_DEFINITIONS } from "@/lib/rbac/roles";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac/permissions";
import type { MatrixAction } from "@/lib/rbac/menu-catalog";
import { getQuikInfraAppId } from "@/lib/rbac/userCan";
import { seedDefaultRoles } from "@/lib/rbac/seedDefaultRoles";
import { modulesFromPermissions } from "@/lib/rbac/permissionsRegistry";
import { loadProjectAccess } from "@/lib/rbac/applyProjectAccess";
import { getDescriptorByRoleName } from "@/lib/rbac/user-types";

// ─── Types ──────────────────────────────────────────────────────────

export interface TenantContext {
  userId: string;
  userEmail: string;
  userName: string;
  orgId: string;
  roleKey: string;            // e.g. "site_admin"
  /**
   * PDF-spec user type stored on cn_users.userType — one of SUPER_ADMIN,
   * ADMIN, HO_USER, SITE_ADMIN, USER. This is what the User Management UI
   * shows as a chip and what the sidebar displays under the user's email.
   * Distinct from `roleKey`, which is the granular backing role driving
   * the permission set. Null for demo / test contexts that don't come
   * from a real cn_users row.
   */
  userType: string | null;
  permissions: Set<string>;   // e.g. {"boq.read","boq.import"}
  projectIds?: string[];      // if set, user is restricted to these projects
  /**
   * Per-user module assignment. `null` means "no restriction" — super admins
   * and tenant admins see every module. A non-null array is the whitelist
   * of module keys ("organization", "masters", "purchase", "store",
   * "project_mgmt") the user is allowed to see in the sidebar.
   */
  modulesAssigned: string[] | null;
  /**
   * Per-menu Add/Edit/Delete/View matrix, edited on the Permissions page.
   * Shape: { [menuKey]: { add, edit, delete, view: boolean } }. `null` for
   * super admins / users who have never had their matrix saved. Callers
   * should fall back to role permissions when this is null.
   */
  permissionMatrix: Record<string, Record<string, boolean>> | null;
}

export type AuthResult = TenantContext | NextResponse;

// ─── Core resolvers ─────────────────────────────────────────────────

/**
 * Resolves the current tenant context for the incoming request.
 *
 * Single resolution path: a valid NextAuth session must be present and
 * the underlying user row must still be active. Anything else returns
 * null and the caller responds with 401.
 *
 * Wrapped in React `cache()` so the result is memoized for the lifetime
 * of one server request — handlers that hit the auth-gate AND read the
 * context inline only pay the DB cost once.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  try {
    const authOptionsMod = await import("@/lib/auth");
    const session = await getServerSession(authOptionsMod.authOptions);
    if (!session?.user) {
      return null;
    }
    const s = session.user as {
      id?: string;
      email?: string;
      name?: string;
      orgId?: string;
      membershipRole?: string;
      isSuperAdmin?: boolean;
    };

    // Skinny path — matches quikscale/quiktrack architecture:
    //   - userId IS auth.User.id (no bridging to a local cn_users row)
    //   - orgId comes from the JWT (already populated by central auth)
    //   - permissions come from the v2 RBAC tables in app_quikinfra:
    //         CnUserAppRole → CnAppRole → CnRolePermissionV2
    //     and CnUserPermissionExtra for per-user additive grants
    //   - if the user has no v2 role assignment for this org yet,
    //     auto-assign the org's default role (lazy bootstrap)
    //   - fall back to ROLE_DEFINITIONS only when the v2 tables aren't
    //     reachable (registry App row missing on this env)
    //
    // No JIT provision into cn_users. No password verification. No demo-
    // user fallback. If the session has no userId/orgId, the caller gets
    // a 401 and that's correct — the central auth → handoff chain is the
    // only way to populate those.
    const userId = s.id;
    const orgId = s.orgId;
    if (!userId || !orgId) {
      logger.warn({
        msg: "tenant_context_missing_session_fields",
        hasId: Boolean(userId),
        hasOrgId: Boolean(orgId),
      });
      return null;
    }

    const appId = await getQuikInfraAppId();
    const permissions = new Set<string>();
    const extrasSet = new Set<string>(); // perms granted via CnUserPermissionExtra
    let roleKey = "user";
    let userType: string | null = null;
    let isAdminRole = false;

    if (appId) {
      // Lazy seed (mirrors quikscale's /api/me/permissions): ensure this org's
      // 4 roles + grants exist BEFORE we resolve/assign the user's role. The
      // QuikInfra dashboard bootstraps via /api/me + /api/dashboard, both of
      // which resolve here through getTenantContext() — NOT through withOrgAuth —
      // so without seeding here a fresh/reset org never gets its roles created
      // on app-open the way quikscale does. Idempotent + 5-min cached (self-heals
      // a wiped table on the next load), so it's a cheap no-op once seeded.
      try {
        await seedDefaultRoles(orgId);
      } catch {
        // best-effort — seeding must never block context resolution
      }
      // Query the v2 RBAC tables — single round-trip with includes.
      // Only `.role` is read downstream, so the narrow shape below is all
      // we need — both the Prisma payload and the synthetic auto-assign
      // object satisfy it.
      type RoleWithPerms = {
        id: string;
        name: string;
        isSystem: boolean;
        rolePermissions: Array<{ resource: string; action: string }>;
      };
      let assignment: { role: RoleWithPerms } | null =
        await db.cnUserAppRole.findFirst({
        where: { userId, orgId, role: { appId } },
        include: {
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

      // No v2 assignment yet → auto-assign a role:
      //
      //   1. Central isSuperAdmin / membershipRole admin-tier → system
      //      "admin" role.
      //   2. Otherwise → org's isDefault role (normally "user").
      //
      // The previous codepath also consulted `app_quikinfra."User".userType`
      // for an invite-time role choice. That fallback is gone — the invite
      // flow now writes `CnUserAppRole` directly in POST /api/settings/users,
      // so by the time an invitee first lands here the assignment already
      // exists and we never reach this branch. Removing the per-request
      // raw SQL cuts one query off every authenticated request.
      if (!assignment) {
        const central = s.membershipRole?.toLowerCase() ?? "";
        const wantsAdmin =
          s.isSuperAdmin === true ||
          central === "super_admin" ||
          central === "platform_super_admin" ||
          central === "org_admin" ||
          central === "admin";

        const targetRoleQuery: Record<string, unknown> = wantsAdmin
          ? { orgId, appId, isSystem: true, name: "admin" }
          : { orgId, appId, isDefault: true };

        let defaultRole = await db.cnAppRole.findFirst({
          where: targetRoleQuery,
          select: {
            id: true,
            name: true,
            isSystem: true,
            rolePermissions: { select: { resource: true, action: true } },
          },
        });

        // Safety net: if the targeted role wasn't found (e.g., seeder hasn't
        // run for this org yet), fall back to whatever isDefault role exists.
        // Better to land them on a real role than bounce to 401.
        if (!defaultRole) {
          defaultRole = await db.cnAppRole.findFirst({
            where: { orgId, appId, isDefault: true },
            select: {
              id: true,
              name: true,
              isSystem: true,
              rolePermissions: { select: { resource: true, action: true } },
            },
          });
        }
        if (defaultRole) {
          try {
            await db.cnUserAppRole.upsert({
              where: {
                userId_orgId_roleId: {
                  userId,
                  orgId,
                  roleId: defaultRole.id,
                },
              },
              update: {},
              create: {
                userId,
                orgId,
                roleId: defaultRole.id,
                assignedBy: "auto-default",
              },
            });
            assignment = { role: defaultRole };
            logger.info({
              msg: "tenant_context_auto_assigned_default_role",
              userId,
              orgId,
              roleName: defaultRole.name,
            });
          } catch (err) {
            // Race-condition path: two parallel requests from the same
            // user both try to upsert the default role. Prisma's upsert
            // isn't atomic — the SELECT-then-INSERT can race and the
            // second one collides on the unique constraint. Treat that
            // as success: another request already assigned the role,
            // so we re-query to get the (now-existing) assignment.
            const isUniqueViolation =
              err instanceof Error &&
              (err.message.includes("Unique constraint failed") ||
                (err as { code?: string }).code === "P2002");

            if (isUniqueViolation) {
              const refetched = await db.cnUserAppRole.findFirst({
                where: { userId, orgId, role: { appId } },
                include: {
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
              if (refetched) {
                assignment = refetched;
                logger.info({
                  msg: "tenant_context_assign_race_recovered",
                  userId,
                  orgId,
                });
              }
            } else {
              logger.warn({
                msg: "tenant_context_auto_assign_failed",
                userId,
                orgId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      }

      if (assignment?.role) {
        roleKey = assignment.role.name;
        isAdminRole =
          assignment.role.isSystem && assignment.role.name === "admin";
        for (const rp of assignment.role.rolePermissions) {
          permissions.add(`${rp.resource}.${rp.action}`);
        }
      }

      // Per-user extras — both additive grants (revoke=false) and
      // subtractive revokes (revoke=true, written by the Add User
      // module-revoke flow). Apply grants first, then strip revokes
      // so the resulting `permissions` set is the effective union.
      // `extrasSet` only tracks GRANTS so the settings-strip block
      // doesn't mistakenly count a revoked perm as an explicit override.
      const extras: Array<{
        resource: string;
        action: string;
        revoke: boolean;
      }> = await db.cnUserPermissionExtra.findMany({
        where: { userId, orgId },
        select: { resource: true, action: true, revoke: true },
      });
      for (const e of extras) {
        const key = `${e.resource}.${e.action}`;
        if (e.revoke) {
          permissions.delete(key);
        } else {
          permissions.add(key);
          extrasSet.add(key);
        }
      }
    }

    // Fallback: no v2 path available — derive from the JWT's
    // membershipRole and the in-code ROLE_DEFINITIONS map. This keeps
    // the app functional when the v2 App row is missing or the seeder
    // hasn't run yet.
    if (permissions.size === 0) {
      const legacy = mapCentralRoleToLocal(s);
      roleKey = legacy.roleKey;
      userType = legacy.userType;
      const def = ROLE_DEFINITIONS.find((r) => r.key === roleKey);
      if (def) {
        if (def.permissions === "*") {
          for (const p of ALL_PERMISSION_KEYS) permissions.add(p);
          permissions.add("*");
        } else {
          for (const p of def.permissions) permissions.add(p);
        }
        if (roleKey === "super_admin" || roleKey === "admin") {
          isAdminRole = true;
        }
      }
    } else {
      // Derive userType label from the v2 role name so the sidebar chip
      // still has something to display.
      userType = v2RoleNameToUserType(roleKey);
    }

    // Distinguish a *central* admin (the org's own owner / super-admin)
    // from an app-level "admin" role granted to a teammate ("sub-admin").
    // This must be computed BEFORE we materialise wildcard permissions so
    // the Settings gate below can actually take effect.
    const isCentralAdmin =
      s.isSuperAdmin === true ||
      (typeof s.membershipRole === "string" &&
        ["super_admin", "platform_super_admin", "org_admin", "admin"].includes(
          s.membershipRole.toLowerCase(),
        ));

    // Admin-tier roles get broad access, but ONLY the central admin gets a
    // literal "*" wildcard. A sub-admin instead gets every concrete
    // permission key materialised — NOT "*". This matters because the
    // client's `can()` / `canViewMenu()` (and route `permissions.has("*")`)
    // short-circuit on "*", which would override the Settings strip below
    // and show Settings → Users/Roles/Workflows even when the admin was
    // NOT granted Settings access. Materialising concrete keys lets the
    // strip remove exactly the 4 settings perms while leaving full access
    // to every other module intact (same effective access as before for
    // everything except Settings).
    if (isAdminRole) {
      if (isCentralAdmin) {
        permissions.add("*");
      } else {
        for (const p of ALL_PERMISSION_KEYS) permissions.add(p);
      }
    }

    // ── Settings access gate ────────────────────────────────────────
    // Sub-admins (admin role given to them by another admin) do
    // NOT see Settings → Users/Roles/Workflows by default. Only the real
    // central org-admin / super-admin gets that automatically.
    //
    // Override: if the inviting admin ticked "Grant Settings access" on
    // the invite/role-swap form, the corresponding settings permissions
    // were inserted into CnUserPermissionExtra. Those are tracked in
    // `extrasSet`. We honour them — extras are NEVER stripped here.
    const SETTINGS_PERMS = [
      "construction.settings.manage",
      "construction.users.manage",
      "construction.roles.manage",
      "construction.workflows.manage",
    ];

    if (!isCentralAdmin) {
      for (const key of SETTINGS_PERMS) {
        // Only strip if the perm came from the role grant (not from
        // a per-user extra — those are an explicit admin override).
        if (!extrasSet.has(key)) {
          permissions.delete(key);
        }
      }
    }

    // Settings visibility is now resolved directly from the v2 permission
    // set (sidebar reads can("construction.users.manage") /
    // can("construction.workflows.manage")), so the legacy
    // userType === "SUPER_ADMIN" side-channel that used to feed the
    // sidebar is no longer needed. We leave `extrasSet` populated only so
    // the settings-strip block above keeps honouring per-user extras.
    void extrasSet;

    // Phase 4: derive modulesAssigned from the effective v2 permission
    // set (role grants ∪ extras-grants − extras-revokes — already
    // applied to `permissions` above by the revoke-honouring logic).
    // For admins (`isAdminRole`), pass `null` to mean "no restriction"
    // so the sidebar shows everything.
    const scopedModulesAssigned: string[] | null = isAdminRole
      ? null
      : modulesFromPermissions(permissions);

    // Phase 5: projectIds now come from CnUserProjectAccess (v2 table),
    // not cn_users.projectsAssigned. Admins bypass via `isAdmin` so they
    // see all projects; for non-admins we load the explicit grants.
    //
    // Item 6: permissionMatrix is now derived from CnUserPermissionExtra
    // revoke rows (matrix is a *view* on top of v2 revokes). The matrix
    // is built lazily — only used by `hasMatrixAction()` and the per-
    // menu UI gates; since all migrated routes now go through `userCan`/
    // `ctx.permissions.has()` directly, the matrix surface is shrinking.
    let scopedProjectIds: string[] | undefined = undefined;
    let scopedPermissionMatrix:
      | Record<string, Record<string, boolean>>
      | null = null;

    // Cross-site roles (admin, HO User, super_admin) see EVERY project — no
    // per-site filter — so we leave projectIds undefined ("all projects"),
    // same as admins. Only genuinely site-scoped roles (site_admin, user,
    // custom roles) load their explicit CnUserProjectAccess grants; a role
    // with no grants then correctly gets an empty project list. Without this,
    // a HO User (cross-site but not admin) loaded zero grants and saw NO
    // projects in the BOQ/DPR pickers.
    const isCrossSite = getDescriptorByRoleName(roleKey).crossSite;
    if (!isAdminRole && !isCrossSite) {
      try {
        scopedProjectIds = await loadProjectAccess(
          db as never,
          userId,
          orgId,
        );
      } catch {
        // CnUserProjectAccess unreachable — leave undefined (no scope).
      }
    }

    // Per-page matrix revokes still apply to every non-admin role — including
    // the page-level HO User — so load them whenever the user isn't an admin,
    // independent of the project-scope decision above.
    if (!isAdminRole) {
      try {
        const revokes = (await db.cnUserPermissionExtra.findMany({
          where: { userId, orgId, revoke: true },
          select: { resource: true, action: true },
        })) as Array<{ resource: string; action: string }>;
        // The matrix is rebuilt only if there are revokes — empty = null
        // means "no restrictions" (preserves the legacy semantic where
        // null matrix → hasMatrixAction returns true).
        if (revokes.length > 0) {
          const { revokesToMatrix } = await import(
            "@/lib/rbac/matrixV2Bridge"
          );
          scopedPermissionMatrix = revokesToMatrix(revokes) as Record<
            string,
            Record<string, boolean>
          >;
        }
      } catch {
        // Non-fatal — leave matrix null (no restrictions).
      }
    }

    return {
      userId,
      userEmail: s.email ?? "",
      userName: s.name ?? "",
      orgId,
      roleKey,
      userType,
      permissions,
      projectIds: scopedProjectIds,
      modulesAssigned: scopedModulesAssigned,
      permissionMatrix: scopedPermissionMatrix,
    };
  } catch (err) {
    logger.warn({
      msg: "tenant_context_unhandled_error",
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
});

/**
 * Map a central-auth membershipRole (or isSuperAdmin flag) to a legacy
 * QuikInfra `{ userType, roleKey }` pair. Used ONLY in the fallback path
 * when the v2 RBAC tables aren't reachable — the regular path resolves
 * role/permissions from CnUserAppRole + CnRolePermissionV2.
 */
function mapCentralRoleToLocal(s: {
  membershipRole?: string | null;
  isSuperAdmin?: boolean;
}): { userType: string; roleKey: string } {
  const r = (s.membershipRole ?? "").toLowerCase();
  if (s.isSuperAdmin || r === "super_admin" || r === "platform_super_admin") {
    return { userType: "SUPER_ADMIN", roleKey: "super_admin" };
  }
  if (r === "org_admin" || r === "admin") {
    return { userType: "ADMIN", roleKey: "admin" };
  }
  return { userType: "USER", roleKey: "user" };
}

/** Convert a v2 CnAppRole.name to the legacy USER_TYPE string for UI chips. */
function v2RoleNameToUserType(name: string): string {
  switch (name) {
    case "admin":
      return "ADMIN";
    case "ho_user":
      return "HO_USER";
    case "site_admin":
      return "SITE_ADMIN";
    case "user":
      return "USER";
    default:
      return name.toUpperCase();
  }
}

// ─── Route guards ───────────────────────────────────────────────────

/**
 * Require an authenticated user. Returns either the context or a 401 response.
 *
 *   const ctx = await requireAuth();
 *   if (ctx instanceof NextResponse) return ctx;
 */
export async function requireAuth(): Promise<AuthResult> {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  return ctx;
}

/**
 * Check the per-user permission matrix for a specific action on a menu page.
 * Returns true (allow) when:
 *   - User holds the wildcard `*` (admin)
 *   - User has no matrix saved (no restriction)
 *   - The menu key is unknown to the saved matrix
 *   - The matrix row exists and explicitly allows the action
 * Returns false (deny) only when the matrix exists AND the row has the
 * action set to `false`.
 *
 * NOTE: this is a matrix check ONLY — it is deliberately fail-open, because
 * the matrix is derived purely from per-user revoke rows and a user with no
 * revokes must not be locked out. It is therefore NOT sufficient on its own
 * to gate a mutation: a role that never granted edit/delete produces no
 * revoke rows, so this returns true. Every create/edit/delete route must ALSO
 * assert the real grant (`requireMastersAction` / `requirePermission` /
 * `withMutationRoute`'s `requirePermission`).
 */
export function hasMatrixAction(
  ctx: TenantContext,
  menuKey: string,
  action: MatrixAction,
): boolean {
  if (ctx.permissions.has("*")) return true;
  const matrix = ctx.permissionMatrix;
  if (!matrix) return true;
  const row = matrix[menuKey];
  if (!row) return true;
  return row[action] !== false;
}

/**
 * Require a specific permission. Super admins (`*` perm) always pass.
 *
 *   const ctx = await requirePermission("boq.lock");
 *
 * Optionally also enforces the per-user permission matrix. This closes the
 * gap where the matrix only hid UI buttons — callers that pass `matrix`
 * also block API requests when the matrix denies the action:
 *
 *   const ctx = await requirePermission("purchase.po.write", {
 *     matrix: { menuKey: "purchase.po", action: "edit" },
 *   });
 */
export async function requirePermission(
  permissionKey: string,
  opts?: { matrix?: { menuKey: string; action: MatrixAction } },
): Promise<AuthResult> {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (!hasPermission(ctx, permissionKey)) {
    return forbidden(`Missing permission: ${permissionKey}`);
  }
  if (opts?.matrix && !hasMatrixAction(ctx, opts.matrix.menuKey, opts.matrix.action)) {
    return forbidden(
      `Action "${opts.matrix.action}" not allowed for ${opts.matrix.menuKey}`,
    );
  }
  return ctx;
}

/**
 * Require ANY one of the listed permissions. Useful for routes that can be
 * reached by multiple roles (e.g. "indent L1 OR L2 can approve the current
 * pending step" — the approval-service then checks the specific step actor).
 *
 *   const ctx = await requireAnyPermission(["purchase.indent.approve_l1",
 *                                           "purchase.indent.approve_l2"]);
 */
export async function requireAnyPermission(permissionKeys: readonly string[]): Promise<AuthResult> {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.permissions.has("*")) return ctx;
  for (const k of permissionKeys) {
    if (ctx.permissions.has(k)) return ctx;
  }
  return forbidden(`Missing any of: ${permissionKeys.join(", ")}`);
}

/**
 * Require ALL of the listed permissions. Useful for composite operations.
 */
export async function requireAllPermissions(permissionKeys: string[]): Promise<AuthResult> {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.permissions.has("*")) return ctx;
  const missing = permissionKeys.filter((k) => !ctx.permissions.has(k));
  if (missing.length > 0) return forbidden(`Missing: ${missing.join(", ")}`);
  return ctx;
}

/**
 * Require the current user to hold one of the listed role keys. Role-based
 * checks are a coarser tool than permission checks — prefer requirePermission
 * unless you genuinely need "only a PM can see this" regardless of perms.
 */
export async function requireRole(roleKeys: string[]): Promise<AuthResult> {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.roleKey === "super_admin" || ctx.roleKey === "admin") return ctx;
  if (roleKeys.includes(ctx.roleKey)) return ctx;
  return forbidden(`Role ${ctx.roleKey} not allowed. Need one of: ${roleKeys.join(", ")}`);
}

/** Pure predicate — same logic as requirePermission but returns boolean. */
export function hasPermission(ctx: TenantContext, permissionKey: string): boolean {
  return ctx.permissions.has("*") || ctx.permissions.has(permissionKey);
}

// ─── Standard responses ─────────────────────────────────────────────

export function unauthorized(msg = "Authentication required") {
  return NextResponse.json({ error: msg, code: "UNAUTHORIZED" }, { status: 401 });
}

export function forbidden(msg = "Forbidden") {
  return NextResponse.json({ error: msg, code: "FORBIDDEN" }, { status: 403 });
}

export function badRequest(msg: string, details?: unknown) {
  return NextResponse.json(
    { error: msg, code: "BAD_REQUEST", details },
    { status: 400 }
  );
}

export function notFound(msg = "Not found") {
  return NextResponse.json({ error: msg, code: "NOT_FOUND" }, { status: 404 });
}

// ─── Scoping helpers ────────────────────────────────────────────────

/**
 * Build a Prisma `where` clause scoped to the current org. Never call Prisma
 * without running the where through this (or an explicit orgId literal).
 */
export function tenantWhere(ctx: TenantContext, extra: Record<string, unknown> = {}) {
  return {
    orgId: ctx.orgId,
    ...extra,
  };
}

/**
 * Build a Prisma `create` data payload with org scope and audit fields
 * injected server-side. Strips any client-provided orgId/createdBy.
 */
export function tenantCreate<T extends Record<string, unknown>>(
  ctx: TenantContext,
  data: T
): T & { orgId: string; createdBy: string; updatedBy: string } {
  const {
    orgId: _ignored1,
    createdBy: _ignored2,
    updatedBy: _ignored3,
    ...rest
  } = data;
  return {
    ...(rest as T),
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  };
}

/**
 * Build a Prisma `update` data payload with audit fields refreshed.
 */
export function tenantUpdate<T extends Record<string, unknown>>(
  ctx: TenantContext,
  data: T
): T & { updatedBy: string } {
  const { orgId: _ignored1, createdBy: _ignored2, ...rest } = data;
  return {
    ...(rest as T),
    updatedBy: ctx.userId,
  };
}
