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

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { ROLE_DEFINITIONS } from "@/lib/rbac/roles";
import { ALL_PERMISSION_KEYS, filterPermissionsByModules } from "@/lib/rbac/permissions";
import type { MatrixAction } from "@/lib/rbac/menu-catalog";
import { findByEmailForLogin } from "@/lib/users/repository";
import { getUserTypeDescriptor } from "@/lib/rbac/user-types";

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
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  try {
    const authOptionsMod = await import("./next-auth-options");
    const session = await getServerSession(authOptionsMod.authOptions);
    if (!session?.user) {
      return null;
    }
    const s = session.user as any;

    // Central QuikIT auth sessions carry { id, email, orgId, membershipRole,
    // isSuperAdmin } but no roleKey. Bridge to the local cn_users row by email
    // so the rest of the app (which expects roleKey + cn_users.id) keeps
    // working without a /login page on this app. If no row exists yet, auto-
    // provision one mirroring the central auth's role — that way clicking the
    // app from the launcher just works and never bounces back to login.
    if (!s.roleKey && s.email) {
      const existing = await findByEmailForLogin(s.email);
      const cnUser =
        existing ?? (await provisionUserFromSession(s));
      if (!cnUser) {
        logger.warn({
          msg: "tenant_context_email_not_in_cn_users",
          email: s.email,
        });
        return null;
      }
      const descriptor = getUserTypeDescriptor(cnUser.userType ?? "USER");
      s.id = cnUser.id;
      s.orgId = cnUser.orgId ?? s.orgId ?? "default";
      s.roleKey = cnUser.roleKey ?? descriptor?.backingRole ?? "user";
      s.displayRole = descriptor?.label ?? cnUser.userType ?? "";
      s.department = cnUser.department ?? "";
    }

    if (!s.id || !s.roleKey) {
      logger.warn({
        msg: "tenant_context_session_missing_fields",
        hasId: Boolean(s.id),
        hasRoleKey: Boolean(s.roleKey),
        hasOrgId: Boolean(s.orgId),
      });
      return null;
    }

    // Stale-JWT guard: NextAuth uses JWT sessions, so a user who was
    // deactivated/soft-deleted/hard-deleted in the DB still carries a
    // valid signed cookie. Reject them here so the next API call
    // returns 401 and the client signs them out.
    //
    // Sessions can originate from two tables:
    //   - cn_users      — the real invited-user table
    //   - cn_demo_users — the seeded admin accounts
    // We look up BOTH in parallel and accept the JWT only when at
    // least one table reports the user as active. Rules:
    //   - active in either table   → allow
    //   - present and inactive     → reject (admin disabled them)
    //   - missing from both tables → reject (row was deleted)
    //   - both lookups threw       → degrade open (DB outage; don't
    //                                mass-logout the entire app)
    const [cnRes, demoRes] = await Promise.allSettled([
      (db as any).cnUser.findFirst({
        where: { id: s.id, orgId: s.orgId },
        select: { status: true },
      }),
      (db as any).cnDemoUser.findUnique({
        where: { id: s.id },
        select: { status: true },
      }),
    ]);
    const cnStatus: string | null | undefined =
      cnRes.status === "fulfilled" ? (cnRes.value?.status ?? null) : undefined;
    const demoStatus: string | null | undefined =
      demoRes.status === "fulfilled" ? (demoRes.value?.status ?? null) : undefined;
    const activeSomewhere = cnStatus === "active" || demoStatus === "active";
    const bothErrored = cnStatus === undefined && demoStatus === undefined;
    if (!activeSomewhere && !bothErrored) {
      logger.warn({
        msg: "tenant_context_user_not_active",
        userId: s.id,
        sessionOrgId: s.orgId,
        cnStatus: cnStatus ?? "not_found",
        demoStatus: demoStatus ?? "not_found",
      });
      return null;
    }
    return buildContextFromSession(s);
  } catch {
    return null;
  }
}

/**
 * Build a full TenantContext from a NextAuth session user object.
 * Materializes the role's permission set by looking up CnRolePermission.
 * Session fields come from the jwt callback in next-auth-options.ts.
 */
async function buildContextFromSession(sessionUser: {
  id: string;
  email?: string;
  name?: string;
  orgId: string;
  roleKey: string;
}): Promise<TenantContext> {
  const permissions = new Set<string>();

  // Resolve the role's permissions from cn_role_permissions. Wildcard ("*")
  // roles (super/tenant admin) get every permission materialized.
  try {
    const role = await (db as any).cnRole.findFirst({
      where: { orgId: sessionUser.orgId, key: sessionUser.roleKey },
      include: { permissions: { include: { permission: true } } },
    });
    if (role?.permissions) {
      for (const rp of role.permissions) {
        permissions.add(rp.permission.key);
      }
    }
  } catch {
    // cn_role table missing — fall through to the role-definitions file
  }

  // Fallback: if the DB lookup produced nothing (fresh dev DB with no
  // role_permissions), resolve from the in-code ROLE_DEFINITIONS.
  if (permissions.size === 0) {
    const role = ROLE_DEFINITIONS.find((r) => r.key === sessionUser.roleKey);
    if (role) {
      if (role.permissions === "*") {
        for (const p of ALL_PERMISSION_KEYS) permissions.add(p);
        permissions.add("*");
      } else {
        for (const p of role.permissions) permissions.add(p);
      }
    }
  }

  // Load the user's per-user restrictions (modulesAssigned, permissionMatrix)
  // from cn_users. Tenant/platform super admins are treated as unrestricted
  // regardless of what's saved on the row so they can never lock themselves out.
  //
  // `modulesAssigned` exists on the base schema; `permissionMatrix` was
  // added later and may not exist yet on stale DBs (the migration has to
  // run first). We run the two lookups separately so a missing
  // `permissionMatrix` column doesn't also wipe out `modulesAssigned`.
  let modulesAssigned: string[] | null = null;
  let permissionMatrix: Record<string, Record<string, boolean>> | null = null;
  let projectIds: string[] | undefined = undefined;
  let userType: string | null = null;
  const isSuperAdmin =
    sessionUser.roleKey === "super_admin" ||
    sessionUser.roleKey === "admin" ||
    permissions.has("*");
  // Pull userType regardless of admin status — the sidebar shows it for
  // every user, and the field exists on every cn_users row.
  try {
    const row = await (db as any).cnUser.findFirst({
      where: { id: sessionUser.id, orgId: sessionUser.orgId },
      select: { userType: true },
    });
    userType = (row?.userType as string | null) ?? null;
  } catch {
    // cn_users table missing on this DB — leave null.
  }
  if (!isSuperAdmin) {
    try {
      const row = await (db as any).cnUser.findFirst({
        where: { id: sessionUser.id, orgId: sessionUser.orgId },
        select: { modulesAssigned: true, projectsAssigned: true },
      });
      if (row && Array.isArray(row.modulesAssigned) && row.modulesAssigned.length) {
        modulesAssigned = row.modulesAssigned;
      }
      // projectsAssigned: the set of project IDs this user is allowed to
      // see. We only apply the restriction when the list is NON-EMPTY:
      //  - non-empty array → filter to those projects
      //  - empty array or unset → treat as unrestricted (no filter)
      // This prevents accidental lockouts when a user is created without
      // any assignments yet. Admins who want strict access control should
      // populate `projectsAssigned` before granting the account.
      if (row && Array.isArray(row.projectsAssigned) && row.projectsAssigned.length > 0) {
        projectIds = row.projectsAssigned;
      }
    } catch {
      // Table missing — leave null so the caller falls back to role perms.
    }
    try {
      const row = await (db as any).cnUser.findFirst({
        where: { id: sessionUser.id, orgId: sessionUser.orgId },
        select: { permissionMatrix: true },
      });
      permissionMatrix = (row?.permissionMatrix ?? null) as typeof permissionMatrix;
    } catch {
      // Column missing on stale DB — run the pending Prisma migration.
      // We silently leave this null instead of noisy-logging so the dev
      // console doesn't fill up until the migration is applied.
    }
  }

  // Fallback for accounts where userType isn't set on the row (e.g. seeded
  // platform/tenant admin demo users): infer it from the role key so the
  // sidebar still shows a sensible chip.
  if (!userType) {
    if (sessionUser.roleKey === "super_admin") userType = "SUPER_ADMIN";
    else if (sessionUser.roleKey === "admin") userType = "ADMIN";
  }

  // Narrow the role's permissions to those whose module is in the user's
  // modulesAssigned. Super admins / wildcard holders bypass.
  // modulesAssigned=null means "unrestricted" — leave permissions intact.
  const effectivePermissions =
    !isSuperAdmin && modulesAssigned !== null
      ? filterPermissionsByModules(permissions, modulesAssigned)
      : permissions;

  return {
    userId: sessionUser.id,
    userEmail: sessionUser.email ?? "",
    userName: sessionUser.name ?? "",
    orgId: sessionUser.orgId,
    roleKey: sessionUser.roleKey,
    userType,
    permissions: effectivePermissions,
    projectIds,
    modulesAssigned,
    permissionMatrix,
  };
}

// When the root workspace User + Membership tables become authoritative
// (Phase 3b follow-up), add a resolver that queries them and merge it into
// getTenantContext() above. The prior draft of that resolver is in git
// history — delete this comment when the cutover lands.

/**
 * Map a central-auth membershipRole (or isSuperAdmin flag) to the local
 * QuikInfra { userType, roleKey } pair. Used by auto-provisioning so
 * a user who's an admin in the central auth shows up as an admin here too.
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

/**
 * Auto-provision a `cn_users` row for a freshly-arriving central-auth user.
 * Idempotent — re-runs on the same email no-op via the `where: { email }` upsert.
 * Returns the resulting UserRecord, or null if the upsert failed for any reason
 * (DB outage, missing column, etc.) so the caller can fall back to 401.
 */
async function provisionUserFromSession(s: {
  id?: string;
  email?: string;
  name?: string;
  orgId?: string;
  membershipRole?: string;
  isSuperAdmin?: boolean;
}) {
  if (!s.email) return null;
  const { userType, roleKey } = mapCentralRoleToLocal(s);
  const username = s.email.split("@")[0] ?? s.email;
  const orgId = s.orgId ?? "default";
  const now = new Date();
  try {
    // CnUser's unique constraint is composite — @@unique([orgId, email]).
    // Prisma exposes that as the `orgId_email` lookup key on upsert.
    await (db as any).cnUser.upsert({
      where: { orgId_email: { orgId, email: s.email } },
      update: {},
      create: {
        id: s.id || (globalThis.crypto?.randomUUID?.() ?? `usr_${Date.now()}`),
        orgId,
        email: s.email,
        username,
        fullName: s.name ?? username,
        passwordHash: "",
        userType,
        roleKey,
        status: "active",
        mustChangePassword: false,
        invitedAt: now,
        updatedAt: now,
      },
    });
    logger.info({
      msg: "tenant_context_auto_provisioned",
      email: s.email,
      userType,
      roleKey,
    });
    return await findByEmailForLogin(s.email);
  } catch (err: any) {
    // Race-condition path: a concurrent request from the same session can
    // hit `findByEmailForLogin → null → upsert` simultaneously, and the
    // second one's INSERT collides on the `id` PK (P2002). Treat that as
    // a successful provisioning by the other request — fetch and return.
    if (err?.code === "P2002") {
      const recovered = await findByEmailForLogin(s.email);
      if (recovered) {
        logger.info({
          msg: "tenant_context_provision_race_recovered",
          email: s.email,
        });
        return recovered;
      }
    }
    logger.warn({
      msg: "tenant_context_auto_provision_failed",
      email: s.email,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
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
export async function requireAnyPermission(permissionKeys: string[]): Promise<AuthResult> {
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
 * Require the current user to be a platform Super Admin (userType ===
 * "SUPER_ADMIN"). Tenant ADMINs — even with the `*` permission wildcard
 * — are rejected with 403. Used to gate platform-managed surfaces like
 * `/api/settings/users/*` and `/api/settings/workflows/*` where
 * provisioning is centralised on the MoreYeahs team.
 *
 *   const ctx = await requireSuperAdmin();
 *   if (ctx instanceof NextResponse) return ctx;
 *
 * Pair this with the sidebar `superAdminOnly` flag and the
 * `app/(dashboard)/settings/layout.tsx` server redirect so the same
 * rule applies at every layer (nav → page → API).
 */
export async function requireSuperAdmin(): Promise<AuthResult> {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.userType === "SUPER_ADMIN") return ctx;
  return forbidden("Super Admin only");
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
  } = data as any;
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
  const { orgId: _ignored1, createdBy: _ignored2, ...rest } = data as any;
  return {
    ...(rest as T),
    updatedBy: ctx.userId,
  };
}
