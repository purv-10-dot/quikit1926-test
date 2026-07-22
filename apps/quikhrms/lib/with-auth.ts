import { NextRequest, NextResponse } from "next/server";
import { unauthorized, forbidden, internalError, errorResponse } from "@/lib/api-response";
import { ErrorCode } from "@/lib/types/api";
import { rateLimit, rateLimitedResponse, clientIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/types/api";
import { getCached, invalidateKeys, cacheKeys } from "@/lib/services/cache";
import { APP_ID, joinCode } from "@/lib/rbac/registry";
import { expandDelegatedPermissions } from "@/lib/rbac/delegatable";
import { provisionEmployee, provisionFromInvitation } from "@/lib/rbac/provisioning";
import { verifyJWT } from "@quikit/auth/jwt";

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Bridge a central QuikIT identity to the HRMS Employee it maps to.
 *
 * RBAC keys on Employee.id, but the central session JWT carries the central
 * `User.id` (a different value). We link them via `Employee.authUserId`:
 *   1. Fast path — an employee already linked to this authUserId in the tenant.
 *   2. First login — no link yet: match by workEmail, then backfill authUserId
 *      so subsequent requests hit the fast path.
 * Returns the Employee.id (the value the rest of withAuth/RBAC expects). If no
 * employee exists for this central user, JIT-provisions one (see provisioning.ts)
 * so SSO "just works" for any org member; returns null only when no email is
 * available to link/create against.
 */
async function resolveEmployeeByAuthUser(claims: {
  orgId: string;
  authUserId: string;
  email: string | null;
  name: string | null;
  membershipRole: string | null;
  isSuperAdmin: boolean;
}): Promise<string | null> {
  const { orgId, authUserId, email } = claims;

  const linked = await prisma.employee.findFirst({
    where: { orgId, deletedAt: null, authUserId },
    select: { id: true },
  });
  if (linked) return linked.id;

  if (email) {
    const byEmail = await prisma.employee.findFirst({
      where: { orgId, deletedAt: null, workEmail: email },
      select: { id: true, authUserId: true },
    });
    if (byEmail) {
      // Backfill the link on first SSO login. Only set it when unclaimed so we
      // never silently re-point an employee already bound to another identity.
      if (!byEmail.authUserId) {
        await prisma.employee.update({
          where: { id: byEmail.id },
          data: { authUserId },
        });
        // Rare: an employee already existed AND a pending invite was raised for
        // them — mark it Accepted so the admin's Users list reflects reality.
        await prisma.invitation.updateMany({
          where: { orgId, status: "Pending", deletedAt: null, email: { equals: email, mode: "insensitive" } },
          data: { status: "Accepted", acceptedAt: new Date(), employeeId: byEmail.id },
        });
      }
      return byEmail.id;
    }

    // SSO-native invite: no employee yet, but a pending invitation carries the
    // intended roles/profile. Materialize the employee now and consume the invite.
    const invite = await prisma.invitation.findFirst({
      where: { orgId, status: "Pending", deletedAt: null, email: { equals: email, mode: "insensitive" } },
      select: {
        id: true, firstName: true, lastName: true, roleIds: true,
        departmentId: true, designationId: true, managerId: true,
      },
    });
    if (invite) {
      return provisionFromInvitation({ orgId, authUserId, email, invitation: invite });
    }
  }

  // JIT auto-provision: this central user has no employee yet. Create one
  // (seeding the tenant's roles first). Needs an email — it's both the
  // workEmail and the future identity-link key.
  if (!email) return null;
  return provisionEmployee({
    orgId,
    authUserId,
    email,
    name: claims.name,
    membershipRole: claims.membershipRole,
    isSuperAdmin: claims.isSuperAdmin,
  });
}

/**
 * Resolve the caller's identity. Source of truth is the central QuikIT session
 * (NextAuth cookie): we read the JWT, map its `orgId` → orgId and its central
 * `User.id` → the HRMS Employee.id (via authUserId). In non-production, falls
 * back to dev headers (x-tenant-id/x-user-id) so local tooling works without a
 * login. `userId` in the result is always an Employee.id.
 *
 * Exported for non-NextResponse handlers (e.g. the SSE stream route) that
 * need authenticated identity but can't go through the withAuth wrapper.
 */
export async function resolveIdentity(
  req: NextRequest
): Promise<{ orgId: string; userId: string; fromSession: boolean } | null> {
  // verifyJWT = decode the NextAuth JWT AND confirm its shared `sessionId` is
  // still live in Redis (`auth:session`). Returns null when the token is absent
  // or the central session was revoked / its TTL expired — so a timed-out
  // session 401s here on the next protected API call. This is the same
  // server-side session check the shared middleware and the other QuikIT apps
  // use (verifyJWT → Redis EXISTS); fail-open if Redis is unreachable.
  // `req as never`: bridges the next@15 vs bundled-next NextRequest type drift.
  const token = await verifyJWT(req as never);
  const authUserId = token?.id as string | undefined;
  const orgId = token?.orgId as string | undefined;
  if (authUserId && orgId) {
    const employeeId = await resolveEmployeeByAuthUser({
      orgId: orgId,
      authUserId,
      email: token?.email ? String(token.email) : null,
      name: (token?.name as string | undefined) ?? null,
      membershipRole: (token?.membershipRole as string | undefined) ?? null,
      isSuperAdmin: token?.isSuperAdmin === true,
    });
    // Authenticated centrally but couldn't resolve/provision an employee
    // (e.g. no email on the token) → deny (not a 500).
    if (!employeeId) return null;
    return { orgId: orgId, userId: employeeId, fromSession: true };
  }
  if (!IS_PROD) {
    const orgId = req.headers.get("x-tenant-id");
    const userId = req.headers.get("x-user-id");
    if (orgId && userId) return { orgId, userId, fromSession: false };
  }
  return null;
}

/** Agent claims carried by the AI Runtime service-auth path (P0-1). */
interface ServiceClaims {
  actingAgentId: string;
  actingAs: string;
}

/**
 * AI Runtime service-auth (the runtime acting *as* a specific employee).
 *
 * The runtime presents `x-internal-secret: INTERNAL_AI_RUNTIME_SECRET` (a
 * dedicated secret — deliberately NOT `INTERNAL_SECRET`, so a leak of the
 * launcher's handoff secret can never be used to impersonate an employee)
 * plus `x-org-id` + `x-acting-employee-id`. We validate the secret, confirm
 * the acting employee is real + active in that org, and hand back its
 * Employee.id. The caller (withAuth) then resolves permissions for that
 * employee exactly as it would for a human session — so the agent inherits
 * that employee's access and nothing more, and the same PreBoarding /
 * mustChangePassword locks apply.
 *
 * Returns null when the secret is absent/wrong or the required headers are
 * missing/unresolvable, so withAuth falls through to the normal session path.
 */
async function resolveServiceIdentity(
  req: NextRequest
): Promise<{ orgId: string; userId: string; agent: ServiceClaims } | null> {
  const secret = process.env.INTERNAL_AI_RUNTIME_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!secret || !provided || provided !== secret) return null;

  const orgId = req.headers.get("x-org-id")?.trim();
  const actingEmployeeId = req.headers.get("x-acting-employee-id")?.trim();
  if (!orgId || !actingEmployeeId) return null;

  const actingAgentId = req.headers.get("x-acting-agent-id")?.trim() || "unknown-agent";
  const actingAs = req.headers.get("x-acting-as")?.trim() || "ai_agent";

  const emp = await prisma.employee.findFirst({
    where: { orgId, id: actingEmployeeId, deletedAt: null },
    select: { id: true },
  });
  if (!emp) return null;

  return { orgId, userId: emp.id, agent: { actingAgentId, actingAs } };
}

type RouteHandler = (
  req: NextRequest,
  ctx: AuthContext,
  params: Record<string, string>
) => Promise<NextResponse>;

interface WithAuthOptions {
  /** Legacy role-match (OR). Retained for compatibility. */
  requiredRoles?: string[];
  /** Permission-based check (AND — all required). */
  requiredPermissions?: string[];
  /** When true, any of the listed permissions passes (OR). Default true when requiredPermissions length === 1. */
  anyPermission?: boolean;
  /**
   * Declarative rate limit(s) applied AFTER identity is resolved. Counted per:
   *  - "user" (default): one bucket per Employee
   *  - "tenant": one bucket per org — useful for tenant-wide expensive ops
   *  - "ip": one bucket per source IP — for unauthenticated-style buckets
   * `scope` defaults to the route name; pass an explicit value to share a
   * bucket across multiple routes (e.g. all "ai" endpoints sharing one cap).
   * Accepts a single config or an array (e.g. per-user burst + per-tenant
   * daily cap).
   */
  rateLimit?: RateLimitSpec | RateLimitSpec[];
  /**
   * Allow the AI Runtime service-auth path (P0-1) on this route: an
   * `x-internal-secret` + acting-employee header set is accepted in place of a
   * user session. Off by default — opt in per route (or use `withServiceAuth`).
   */
  allowServiceAuth?: boolean;
}

interface RateLimitSpec {
  max: number;
  windowSec: number;
  by?: "user" | "tenant" | "ip";
  scope?: string;
}

// Global per-tenant safety ceiling — catches runaway scripts even when the
// route author forgot to declare a route-level limit. Disabled via env.
const GLOBAL_TENANT_MAX = 300;
const GLOBAL_TENANT_WINDOW = 60;
const GLOBAL_DISABLED = process.env.DISABLE_GLOBAL_RATELIMIT === "true";

interface CachedPerms {
  roleCode: string | null;
  permissions: string[];
  mustChangePassword: boolean;
  /** Set to true when the employee is in PreBoarding — withAuth narrows perms. */
  preBoarding: boolean;
}

const PERM_CACHE_TTL_SEC = 300;

/**
 * Permissions a PreBoarding employee is allowed to USE — enough to log in,
 * complete onboarding, and read company-wide info. Anything else (apply
 * leave, view payslips, see other employees) is blocked until status = Active.
 */
const PREBOARDING_ALLOWED = new Set<string>([
  "hrms.employee.read_self",
  "hrms.document.read",            // upload UI lists doc categories
  "hrms.document.write",           // POST/PUT /documents — the actual upload save
  "hrms.document.read_self",
  "hrms.document.write_self",
  "hrms.onboarding.read",
  "hrms.onboarding.write",         // mark task in-progress / complete
  "hrms.onboarding.read_self",
  "hrms.onboarding.write_self",
  "hrms.policy.read",
  "hrms.holiday.read",
  "hrms.announcement.read",
  "hrms.notification.read_self",
]);

/**
 * Resolve effective permissions for an Employee in a tenant.
 * UNION of:
 *   1. RolePermission rows on every AppRole the user is on (via UserAppRole)
 *   2. UserPermissionExtra rows for the user in this org
 *
 * roleCode = name of the first AppRole the user has (used for super_admin checks).
 */
async function resolvePermissions(orgId: string, userId: string, allowDevFallback = false): Promise<CachedPerms> {
  return getCached(cacheKeys.permissions(orgId, userId), PERM_CACHE_TTL_SEC, async () => {
    // Locate the employee. The QK-EMP-0001 shortcut is a dev-only convenience
    // for the no-login header flow — never apply it to a real session, or any
    // logged-in user would inherit the seed admin's permissions.
    const employee = await prisma.employee.findFirst({
      where: {
        orgId,
        deletedAt: null,
        ...(allowDevFallback ? { OR: [{ id: userId }, { employeeCode: "QK-EMP-0001" }] } : { id: userId }),
      },
      select: { id: true, mustChangePassword: true, status: true },
    });
    if (!employee) return { roleCode: null, permissions: [], mustChangePassword: false, preBoarding: false };
    const mustChangePassword = employee.mustChangePassword ?? false;
    const preBoarding = employee.status === "PreBoarding";

    const now = new Date();
    const [roleRows, extras] = await Promise.all([
      prisma.hrmsUserAppRole.findMany({
        where: {
          userId: employee.id,
          orgId: orgId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          role: {
            select: {
              name: true,
              isSystem: true,
              permissions: { select: { resource: true, action: true } },
            },
          },
        },
      }),
      prisma.hrmsUserPermissionExtra.findMany({
        where: { orgId: orgId, userId: employee.id },
        select: { resource: true, action: true, kind: true },
      }),
    ]);

    // Fallback to the tenant's default role when the user has no explicit
    // role assignment, so every logged-in employee still gets baseline
    // self-service access instead of a blanket 403.
    let effectiveRoleRows = roleRows;
    if (effectiveRoleRows.length === 0) {
      const fallback = await prisma.hrmsAppRole.findFirst({
        where: { orgId: orgId, appId: APP_ID, isDefault: true },
        select: {
          name: true,
          isSystem: true,
          permissions: { select: { resource: true, action: true } },
        },
      });
      if (fallback) effectiveRoleRows = [{ role: fallback }];
    }

    const permSet = new Set<string>();
    const denySet = new Set<string>();
    let roleName: string | null = null;
    let hasSuperAdmin = false;

    for (const r of effectiveRoleRows) {
      const name = r.role.name;
      if (!roleName) roleName = name;
      if (name === "admin") {
        hasSuperAdmin = true;
      }
      for (const rp of r.role.permissions) {
        permSet.add(joinCode(rp.resource, rp.action));
      }
    }
    for (const e of extras) {
      const code = joinCode(e.resource, e.action);
      if (e.kind === "DENY") denySet.add(code);
      else permSet.add(code);
    }

    // super_admin bypasses denies for safety (cannot lock self out).
    if (hasSuperAdmin) {
      return { roleCode: roleName, permissions: ["*"], mustChangePassword, preBoarding };
    }

    // Apply denies last so they win.
    for (const d of denySet) permSet.delete(d);

    return {
      roleCode: roleName,
      permissions: Array.from(permSet),
      mustChangePassword,
      preBoarding,
    };
  });
}

/** Dev-only: load permissions for an arbitrary role name, skipping employee lookup. */
async function resolveDevImpersonation(orgId: string, roleName: string): Promise<CachedPerms | null> {
  const role = await prisma.hrmsAppRole.findFirst({
    where: { orgId: orgId, appId: APP_ID, name: roleName },
    select: {
      name: true,
      isSystem: true,
      permissions: { select: { resource: true, action: true } },
    },
  });
  if (!role) return null;
  if (role.name === "admin") {
    return { roleCode: role.name, permissions: ["*"], mustChangePassword: false, preBoarding: false };
  }
  return {
    roleCode: role.name,
    permissions: role.permissions.map((p) => joinCode(p.resource, p.action)),
    mustChangePassword: false,
    preBoarding: false,
  };
}

/**
 * Extra permissions lent to `delegateeId` by ACTIVE delegations pointed at them.
 *
 * A delegation only ever grants what the DELEGATOR still holds — we intersect the
 * requested codes with the delegator's live permissions — so the delegatee can
 * never exceed the delegator, and the grant evaporates the instant the delegator
 * loses the right, the window closes, or the delegation is switched off.
 *
 * Uncached on purpose: delegations are rare and setup/expiry must take effect
 * immediately (the delegator-side perm lookup it calls IS cached). Returns both
 * the flat union and the per-delegator breakdown (for on-behalf audit + routing).
 */
async function resolveDelegatedPermissions(
  orgId: string,
  delegateeId: string,
): Promise<{ permissions: string[]; sources: { delegatorId: string; permissions: string[] }[] }> {
  const now = new Date();
  const dels = await prisma.delegation.findMany({
    where: {
      orgId,
      delegateeId,
      deletedAt: null,
      isActive: true,
      fromDate: { lte: now },
      OR: [{ toDate: null }, { toDate: { gte: now } }],
    },
    select: { delegatorId: true, modules: true },
  });
  if (dels.length === 0) return { permissions: [], sources: [] };

  const union = new Set<string>();
  const sources: { delegatorId: string; permissions: string[] }[] = [];
  const delegatorPerms = new Map<string, Set<string>>();

  for (const d of dels) {
    let held = delegatorPerms.get(d.delegatorId);
    if (!held) {
      const rp = await resolvePermissions(orgId, d.delegatorId);
      held = new Set(rp.permissions);
      delegatorPerms.set(d.delegatorId, held);
    }
    const isSuperDelegator = held.has("*");
    const requested = expandDelegatedPermissions(d.modules);
    const granted = requested.filter((code) => isSuperDelegator || held!.has(code));
    if (granted.length === 0) continue;
    for (const code of granted) union.add(code);
    sources.push({ delegatorId: d.delegatorId, permissions: granted });
  }
  return { permissions: [...union], sources };
}

export async function invalidatePermissionCache(orgId: string, userId?: string) {
  if (userId) {
    await invalidateKeys(cacheKeys.permissions(orgId, userId));
    return;
  }
  // Tenant-wide bust (role permission / navigation edits). The shared cache
  // has no wildcard delete, so enumerate every user who can hold a perms
  // entry and bust their exact keys. Rare admin write — the enumeration cost
  // is acceptable; chunked so a large tenant doesn't fan out in one burst.
  const rows = await prisma.hrmsUserAppRole.findMany({
    where: { orgId: orgId },
    select: { userId: true },
  });
  const keys = [...new Set(rows.map((r) => r.userId))].map((id) =>
    cacheKeys.permissions(orgId, id),
  );
  for (let i = 0; i < keys.length; i += 100) {
    await invalidateKeys(...keys.slice(i, i + 100));
  }
}

/**
 * Logout hook (called from the NextAuth signOut event in lib/auth.ts).
 *
 * Previously this busted the per-user auth caches (session-valid, central-member,
 * perms, employee-me, notif-unread). None of those are cached anymore — HRMS now
 * resolves identity, permissions, profile and the unread count live per request,
 * matching the other QuikIT apps — so there is nothing to invalidate. Kept as a
 * no-op so the signOut event has a stable, no-throw hook.
 */
export async function invalidateUserAuthCaches(_authUserId: string, _orgId?: string): Promise<void> {
  // no-op — no per-user auth state is cached
}

function hasAllPermissions(granted: string[], required: string[]): boolean {
  return required.every((p) => granted.includes(p));
}

function hasAnyPermission(granted: string[], required: string[]): boolean {
  return required.some((p) => granted.includes(p));
}

/**
 * Wraps API route handlers with JWT auth extraction + RBAC.
 * Resolves permissions from UserAppRole + RolePermission + UserPermissionExtra.
 */
export function withAuth(handler: RouteHandler, options?: WithAuthOptions) {
  return async (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      const params = await context.params;

      // Identity precedence: AI Runtime service-auth (when the route opts in and
      // the headers/secret are present), else the normal central-session / dev-
      // header path. `service` is non-null only for the agent path.
      let identity: { orgId: string; userId: string; fromSession: boolean } | null = null;
      let service: ServiceClaims | null = null;
      if (options?.allowServiceAuth) {
        const svc = await resolveServiceIdentity(req);
        if (svc) {
          // fromSession=true suppresses dev-header role spoofing: the agent is a
          // trusted first-party caller, never the local no-login flow.
          identity = { orgId: svc.orgId, userId: svc.userId, fromSession: true };
          service = svc.agent;
        }
      }
      if (!identity) {
        identity = await resolveIdentity(req);
      }
      if (!identity) {
        return unauthorized("Missing authentication credentials");
      }
      const { orgId, userId, fromSession } = identity;

      // ── Rate limiting ─────────────────────────────────────────────────
      // Global per-tenant safety net first — caps any one tenant at a sane
      // overall request rate, regardless of which routes they hit.
      if (!GLOBAL_DISABLED) {
        const globalCheck = await rateLimit("tenant.global", orgId, GLOBAL_TENANT_MAX, GLOBAL_TENANT_WINDOW);
        if (!globalCheck.allowed) return rateLimitedResponse(globalCheck);
      }
      // Route-declared limits. Each config gets its own bucket; failing ANY
      // one returns 429 (e.g. burst-per-user + daily-per-tenant).
      if (options?.rateLimit) {
        const specs: RateLimitSpec[] = Array.isArray(options.rateLimit)
          ? options.rateLimit
          : [options.rateLimit];
        for (const spec of specs) {
          const by = spec.by ?? "user";
          const routeScope = spec.scope ?? `route:${req.nextUrl?.pathname ?? "?"}`;
          const id =
            by === "tenant" ? orgId :
            by === "ip" ? clientIp(req) :
            `${orgId}:${userId}`;
          const check = await rateLimit(routeScope, id, spec.max, spec.windowSec);
          if (!check.allowed) return rateLimitedResponse(check);
        }
      }

      // Dev role spoofing (x-user-roles / x-dev-role / QK-EMP-0001 fallback)
      // only applies to the header-based no-login flow. A real session login
      // always uses that user's actual RBAC — never the dev overrides.
      const devMode = !IS_PROD && !fromSession;

      const rolesHeader = devMode ? req.headers.get("x-user-roles") : null;
      const headerRoles = rolesHeader ? rolesHeader.split(",").map((r) => r.trim()).filter(Boolean) : [];

      const devRoleHeader = devMode ? req.headers.get("x-dev-role") : null;
      let resolved = await resolvePermissions(orgId, userId, devMode);
      if (devMode && devRoleHeader) {
        const overridden = await resolveDevImpersonation(orgId, devRoleHeader);
        if (overridden) resolved = overridden;
      }
      const { roleCode, mustChangePassword, preBoarding } = resolved;

      // PreBoarding lock-down: narrow permissions to the allowlist so the
      // employee can complete onboarding but not yet act as a full employee.
      // Super-admin keeps "*" (a super-admin in PreBoarding is unusual — let
      // them still operate so we don't lock ourselves out).
      let permissions = resolved.permissions;
      if (preBoarding && !permissions.includes("*")) {
        permissions = permissions.filter((p) => PREBOARDING_ALLOWED.has(p));
      }

      // A user on a temporary password is locked out of everything except
      // changing it (and reading their own session / logging out).
      if (mustChangePassword) {
        const path = req.nextUrl?.pathname ?? "";
        const allowed =
          path.includes("/auth/change-password") ||
          path.includes("/auth/logout") ||
          path.includes("/auth/me") ||
          path.includes("/employees/me");
        if (!allowed) {
          return errorResponse(ErrorCode.PASSWORD_CHANGE_REQUIRED, "You must change your temporary password before continuing.", 403);
        }
      }

      // Delegation: fold in any permissions lent to this user by active
      // delegations pointed at them (never exceeding the delegator, auto-
      // expiring). Skipped for locked-out states — super-admin already has "*",
      // and a PreBoarding / temp-password user must stay narrowed regardless of
      // what someone delegated to them.
      let delegatedFrom: { delegatorId: string; permissions: string[] }[] | undefined;
      if (!permissions.includes("*") && !preBoarding && !mustChangePassword) {
        const delegated = await resolveDelegatedPermissions(orgId, userId);
        if (delegated.permissions.length) {
          permissions = [...new Set([...permissions, ...delegated.permissions])];
          delegatedFrom = delegated.sources;
        }
      }

      const effectiveRoles = roleCode ? [roleCode, ...headerRoles] : headerRoles;
      const isSuperAdmin = permissions.includes("*") || effectiveRoles.includes("admin");

      if (options?.requiredRoles?.length) {
        const hasRole = isSuperAdmin || options.requiredRoles.some((r) => effectiveRoles.includes(r));
        if (!hasRole) return forbidden();
      }

      if (options?.requiredPermissions?.length && !isSuperAdmin) {
        const any = options.anyPermission ?? options.requiredPermissions.length === 1;
        const ok = any
          ? hasAnyPermission(permissions, options.requiredPermissions)
          : hasAllPermissions(permissions, options.requiredPermissions);
        if (!ok) return forbidden();
      }

      const authCtx: AuthContext = {
        userId,
        orgId,
        roles: effectiveRoles,
        permissions: isSuperAdmin ? ["*"] : permissions,
        roleCode,
        mustChangePassword,
        actorType: service ? "ai_agent" : "user",
        ...(service && { actingAgentId: service.actingAgentId }),
        ...(delegatedFrom && { delegatedFrom }),
      };
      return await handler(req, authCtx, params);
    } catch (error) {
      const method = req.method;
      const url = req.nextUrl?.pathname ?? req.url;
      const err = error as Error & { code?: string; meta?: unknown };
      console.error(
        `\n[31m[Route error][0m ${method} ${url}\n` +
          `  message : ${err?.message ?? error}\n` +
          (err?.code ? `  code    : ${err.code}\n` : "") +
          (err?.meta ? `  meta    : ${JSON.stringify(err.meta)}\n` : "") +
          (err?.stack ? `  stack   : ${err.stack}\n` : "")
      );
      return internalError();
    }
  };
}

/**
 * withAuth variant that additionally accepts the AI Runtime service-auth path
 * (P0-1): `x-internal-secret: INTERNAL_AI_RUNTIME_SECRET` + `x-org-id` +
 * `x-acting-employee-id` (optionally `x-acting-agent-id`, `x-acting-as`).
 *
 * The agent runs with exactly the acting employee's resolved permissions —
 * the same RBAC, orgId scoping, and PreBoarding/mustChangePassword locks as a
 * human session. Every request carries actorType="ai_agent" + actingAgentId on
 * the AuthContext so mutating routes can attribute the change in the audit log.
 *
 * A normal user session still works on these routes — service-auth is only
 * attempted when the internal secret header is present.
 */
export function withServiceAuth(handler: RouteHandler, options?: WithAuthOptions) {
  return withAuth(handler, { ...options, allowServiceAuth: true });
}
