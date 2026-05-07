/**
 * Server-side auth + tenant context for API routes.
 *
 * Usage in any route handler:
 *
 *   export async function GET(req: NextRequest) {
 *     const ctxOrResponse = await requireAuth();
 *     if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
 *     const ctx = ctxOrResponse;
 *     // ... use ctx.tenantId, ctx.userId, etc.
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
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db/prisma";
import { ROLE_DEFINITIONS } from "@/lib/rbac/roles";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac/permissions";

// ─── Types ──────────────────────────────────────────────────────────

export interface TenantContext {
  userId: string;
  userEmail: string;
  userName: string;
  tenantId: string;
  orgId: string;
  roleKey: string;            // e.g. "project_manager"
  /**
   * PDF-spec user type stored on users.userType — one of SUPER_ADMIN,
   * ADMIN, HO_USER, SITE_ADMIN, USER. This is what the User Management UI
   * shows as a chip and what the sidebar displays under the user's email.
   * Distinct from `roleKey`, which is the granular backing role driving
   * the permission set. Null for demo / test contexts that don't come
   * from a real users row.
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

// ─── Dev/demo fallback ──────────────────────────────────────────────
// When AUTH_DEMO_MODE=true (default for local dev), bypass NextAuth and
// return a pre-seeded super-admin context. Production MUST NOT set this.

const DEMO_MODE =
  (process.env.AUTH_DEMO_MODE ?? "true") !== "false" &&
  process.env.NODE_ENV !== "production";

const DEMO_CTX: TenantContext = {
  userId: "demo-user-1",
  userEmail: "demo@quikconstruction.local",
  userName: "Demo Super Admin",
  tenantId: "default",
  orgId: "default",
  roleKey: "platform_super_admin",
  userType: "SUPER_ADMIN",
  permissions: new Set(["*"]),
  modulesAssigned: null,
  permissionMatrix: null,
};

/**
 * Test-only header override. When DEMO_MODE is on AND the request carries
 * `x-test-role: <role-key>` (plus optional `x-test-tenant` / `x-test-user`),
 * build a TenantContext scoped to that role's permissions instead of the
 * super-admin wildcard. Lets the E2E + API test suite exercise role-based
 * restriction paths without wiring full NextAuth sessions.
 *
 * Never active in production. The `DEMO_MODE` gate already requires
 * NODE_ENV !== "production" AND AUTH_DEMO_MODE !== "false".
 */
function buildTestOverrideContext(): TenantContext | null {
  if (!DEMO_MODE) return null;
  let h: ReturnType<typeof headers>;
  try {
    h = headers();
  } catch {
    // headers() can only be called during a request — return null for
    // service-layer calls outside a route handler.
    return null;
  }
  const roleKey = h.get("x-test-role");
  if (!roleKey) return null;

  const role = ROLE_DEFINITIONS.find((r) => r.key === roleKey);
  if (!role) return null;

  const perms = new Set<string>();
  if (role.permissions === "*") {
    perms.add("*");
    for (const p of ALL_PERMISSION_KEYS) perms.add(p);
  } else {
    for (const p of role.permissions) perms.add(p);
  }

  return {
    userId: h.get("x-test-user") ?? `test-${roleKey}-1`,
    userEmail: `${roleKey}@test.local`,
    userName: `Test ${role.name}`,
    tenantId: h.get("x-test-tenant") ?? "default",
    orgId: h.get("x-test-org") ?? "default",
    roleKey: role.key,
    userType: null,
    permissions: perms,
    modulesAssigned: null,
    permissionMatrix: null,
  };
}

// ─── Core resolvers ─────────────────────────────────────────────────

/**
 * Resolves the current tenant context for the incoming request.
 *
 * Resolution order:
 *   1. Real NextAuth session (CnDemoUser login) — if present, build the
 *      context from the session's role/tenant fields. This is what real
 *      logged-in users get.
 *   2. Test-override header (`x-test-role`) — dev-only path the test suite
 *      uses to impersonate roles without a session.
 *   3. Demo super-admin fallback — when no session and no test header,
 *      return the platform_super_admin context so the app is usable on
 *      first boot with zero config.
 *   4. null — only in production with a real NextAuth setup and no session.
 *
 * Tests continue to work because they don't send session cookies — they
 * either send `x-test-role` or fall through to DEMO_CTX.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  // Step 1: real session check — takes precedence over demo mode so a
  // logged-in user sees their actual role, not the super-admin fallback.
  try {
    const authOptionsMod = await import("./next-auth-options");
    const session = await getServerSession(authOptionsMod.authOptions);
    if (session?.user) {
      const s = session.user as any;
      if (s.id && s.roleKey) {
        // Stale-JWT guard: NextAuth uses JWT sessions, so a user who was
        // deactivated/soft-deleted/hard-deleted in the DB still carries a
        // valid signed cookie. Reject them here so the next API call
        // returns 401 and the client signs them out (see fetchMe() in
        // use-permissions.ts).
        //
        // Sessions can originate from two tables:
        //   - users      — the real invited-user table
        //   - demo_users — the seeded amit/priya/etc. accounts
        // We look up BOTH in parallel and accept the JWT only when at
        // least one table reports the user as active. Rules:
        //   - active in either table   → allow
        //   - present and inactive     → reject (admin disabled them)
        //   - missing from both tables → reject (row was deleted)
        //   - both lookups threw       → degrade open (DB outage; don't
        //                                mass-logout the entire app)
        const [cnRes, demoRes] = await Promise.allSettled([
          (db as any).cnUser.findFirst({
            where: { id: s.id, tenantId: s.tenantId },
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
          return null;
        }
        return buildContextFromSession(s);
      }
    }
  } catch {
    // Session read failed (e.g. during early-boot module load) — fall through
  }

  // Step 2 + 3: demo mode fallbacks
  if (DEMO_MODE) {
    const override = buildTestOverrideContext();
    return override ?? DEMO_CTX;
  }

  // Step 4: production, no session, no demo mode — the caller 401s
  return null;
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
  tenantId: string;
  orgId?: string;
  roleKey: string;
}): Promise<TenantContext> {
  const permissions = new Set<string>();

  // Resolve the role's permissions from role_permissions. Wildcard ("*")
  // roles (super/tenant admin) get every permission materialized.
  try {
    const role = await (db as any).cnRole.findFirst({
      where: { tenantId: sessionUser.tenantId, key: sessionUser.roleKey },
      include: { permissions: { include: { permission: true } } },
    });
    if (role?.permissions) {
      for (const rp of role.permissions) {
        permissions.add(rp.permission.key);
      }
    }
  } catch {
    // role table missing — fall through to the role-definitions file
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
  // from users. Tenant/platform super admins are treated as unrestricted
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
    sessionUser.roleKey === "platform_super_admin" ||
    sessionUser.roleKey === "tenant_admin" ||
    permissions.has("*");
  // Pull userType regardless of admin status — the sidebar shows it for
  // every user, and the field exists on every users row.
  try {
    const row = await (db as any).cnUser.findFirst({
      where: { id: sessionUser.id, tenantId: sessionUser.tenantId },
      select: { userType: true },
    });
    userType = (row?.userType as string | null) ?? null;
  } catch {
    // users table missing on this DB — leave null.
  }
  if (!isSuperAdmin) {
    try {
      const row = await (db as any).cnUser.findFirst({
        where: { id: sessionUser.id, tenantId: sessionUser.tenantId },
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
        where: { id: sessionUser.id, tenantId: sessionUser.tenantId },
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
    if (sessionUser.roleKey === "platform_super_admin") userType = "SUPER_ADMIN";
    else if (sessionUser.roleKey === "tenant_admin") userType = "ADMIN";
  }

  return {
    userId: sessionUser.id,
    userEmail: sessionUser.email ?? "",
    userName: sessionUser.name ?? "",
    tenantId: sessionUser.tenantId,
    orgId: sessionUser.orgId ?? "default",
    roleKey: sessionUser.roleKey,
    userType,
    permissions,
    projectIds,
    modulesAssigned,
    permissionMatrix,
  };
}

// When the root workspace User + Membership tables become authoritative
// (Phase 3b follow-up), add a resolver that queries them and merge it into
// getTenantContext() above. The prior draft of that resolver is in git
// history — delete this comment when the cutover lands.

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
 * Require a specific permission. Super admins (`*` perm) always pass.
 *
 *   const ctx = await requirePermission("boq.lock");
 *   if (ctx instanceof NextResponse) return ctx;
 */
export async function requirePermission(permissionKey: string): Promise<AuthResult> {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (hasPermission(ctx, permissionKey)) return ctx;
  return forbidden(`Missing permission: ${permissionKey}`);
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
 * Require the current user to hold one of the listed role keys. Role-based
 * checks are a coarser tool than permission checks — prefer requirePermission
 * unless you genuinely need "only a PM can see this" regardless of perms.
 */
export async function requireRole(roleKeys: string[]): Promise<AuthResult> {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.roleKey === "platform_super_admin" || ctx.roleKey === "tenant_admin") return ctx;
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
 * Build a Prisma `where` clause scoped to the current tenant. Never call Prisma
 * without running the where through this (or an explicit tenantId literal).
 */
export function tenantWhere(ctx: TenantContext, extra: Record<string, unknown> = {}) {
  return {
    tenantId: ctx.tenantId,
    orgId: ctx.orgId,
    ...extra,
  };
}

/**
 * Build a Prisma `create` data payload with tenant scope and audit fields
 * injected server-side. Strips any client-provided tenantId/orgId/createdBy.
 */
export function tenantCreate<T extends Record<string, unknown>>(
  ctx: TenantContext,
  data: T
): T & { tenantId: string; orgId: string; createdBy: string; updatedBy: string } {
  const {
    tenantId: _ignored1,
    orgId: _ignored2,
    createdBy: _ignored3,
    updatedBy: _ignored4,
    ...rest
  } = data as any;
  return {
    ...(rest as T),
    tenantId: ctx.tenantId,
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
  const { tenantId: _ignored1, orgId: _ignored2, createdBy: _ignored3, ...rest } = data as any;
  return {
    ...(rest as T),
    updatedBy: ctx.userId,
  };
}
