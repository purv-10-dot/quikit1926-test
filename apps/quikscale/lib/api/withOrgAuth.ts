import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { toErrorMessage } from "@/lib/api/errors";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { logApiCall } from "@quikit/shared/apiLogging";
import { userCan, forbidden } from "@/lib/api/permissions";
import type { Resource, Action } from "@/lib/api/permissionsRegistry";
import { rateLimitAsync, LIMITS } from "@quikit/shared/rateLimit";

/**
 * Context passed to a route handler after the auth + tenant guard succeeds.
 */
export interface TenantAuthContext {
  session: Session;
  userId: string;
  orgId: string;
}

/**
 * Higher-order wrapper that runs the standard auth + orgId + error-handling
 * boilerplate around a route handler.
 *
 * Replaces the ~8 lines repeated across 35+ route files:
 *   - session check  → 401
 *   - orgId check → 403
 *   - try/catch      → 500 with `toErrorMessage`
 *
 * Usage:
 *   export const GET = withOrgAuth(async ({ orgId }, req) => {
 *     const data = await db.kpi.findMany({ where: { orgId } });
 *     return NextResponse.json({ success: true, data });
 *   });
 *
 *   // Dynamic route segments still work — pass them through as `params`:
 *   export const GET = withOrgAuth<{ id: string }>(
 *     async ({ orgId }, req, { params }) => { ... }
 *   );
 */
export interface WithTenantAuthOptions {
  /** Error message used when the handler throws an unhandled exception. */
  fallbackErrorMessage?: string;
  /**
   * FF-1 module gate. When set, the wrapper calls `gateModuleApi` after the
   * auth check — if the tenant has this module (or any ancestor) disabled,
   * the handler is skipped and a 404 is returned. Keeps L3 enforcement in
   * a single place: flip this string on once per route group.
   */
  moduleKey?: string;
  /**
   * RBAC v2 permission gate. When set, the wrapper calls `userCan(userId,
   * orgId, resource, action)` after the auth + module gate. If the user
   * lacks the permission, returns 403. Use the per-HTTP-verb helpers
   * (`withOrgAuthForResource`) for the common case of one resource per
   * route with verb → action mapping.
   */
  permission?: { resource: Resource; action: Action };
  /**
   * Centralized rate limiting, applied by the wrapper AFTER the auth guard so
   * the (orgId, userId) client key is known.
   *
   *   - undefined (default) — throttle MUTATIONS (POST/PUT/PATCH/DELETE) with
   *     the shared `LIMITS.mutation` bucket; leave GET/HEAD untouched.
   *   - false — disable the central limiter entirely (handler self-limits with
   *     its own, usually tighter, bucket — e.g. the KPI write route).
   *   - object — override the threshold and/or opt a read (GET) in via
   *     `enabled: true`. `routeKey` defaults to `"${METHOD}:${pathname}"`.
   *
   * Uses the Redis-backed `rateLimitAsync` so limits hold across serverless
   * instances (falls back to in-memory only when REDIS_URL is unset).
   */
  rateLimit?: RateLimitOption;
}

export type RateLimitOption =
  | boolean
  | {
      /** Opt a read (GET/HEAD) into limiting. Mutations are limited regardless. */
      enabled?: boolean;
      limit?: number;
      windowMs?: number;
      routeKey?: string;
    };

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Run the centralized rate-limit gate. Returns a 429 `NextResponse` when the
 * request should be blocked, or `null` when it may proceed.
 */
async function enforceRateLimit(
  req: NextRequest,
  orgId: string,
  userId: string,
  opt: RateLimitOption | undefined,
): Promise<NextResponse | null> {
  if (opt === false) return null;

  const method = req.method.toUpperCase();
  const cfg = typeof opt === "object" && opt !== null ? opt : undefined;
  const shouldLimit = MUTATION_METHODS.has(method) || cfg?.enabled === true;
  if (!shouldLimit) return null;

  const rl = await rateLimitAsync({
    routeKey: cfg?.routeKey ?? `${method}:${req.nextUrl.pathname}`,
    clientKey: `${orgId}:${userId}`,
    limit: cfg?.limit ?? LIMITS.mutation.limit,
    windowMs: cfg?.windowMs ?? LIMITS.mutation.windowMs,
  });

  if (rl.ok) return null;
  return NextResponse.json(
    { success: false, error: "Too many requests. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
  );
}

export function withOrgAuth<Params = Record<string, never>>(
  handler: (
    ctx: TenantAuthContext,
    req: NextRequest,
    routeCtx: { params: Params }
  ) => Promise<NextResponse> | NextResponse,
  options: WithTenantAuthOptions = {}
) {
  return async (req: NextRequest, routeCtx: { params: Params }): Promise<NextResponse> => {
    const startedAt = Date.now();
    let orgIdForLog: string | null = null;
    let userIdForLog: string | null = null;
    let response: NextResponse;
    try {
      const session = await getServerSession(authOptions);
      // DEBUG — remove after diagnosing quarter guard issue
      console.log("[withOrgAuth] path:", req.nextUrl.pathname, "session.user:", JSON.stringify(session?.user ?? null));
      if (!session?.user?.id) {
        response = NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      } else {
        userIdForLog = session.user.id;
        const orgId = await getOrgId(session.user.id);
        // DEBUG
        console.log("[withOrgAuth] getOrgId result:", orgId);
        if (!orgId) {
          response = NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
        } else {
          orgIdForLog = orgId;
          let blocked: NextResponse | null = null;
          // Centralized rate limiting — runs before the module/permission
          // gates and the handler, so throttled requests never touch the DB.
          blocked = await enforceRateLimit(req, orgId, session.user.id, options.rateLimit);
          if (!blocked && options.moduleKey) {
            const ff = await gateModuleApi("quikscale", options.moduleKey, orgId);
            if (ff) blocked = ff as NextResponse;
          }
          // RBAC v2 enforcement — runs after module gate so disabled modules
          // 404 before we ever ask whether the user has perms on them.
          if (!blocked && options.permission) {
            const allowed = await userCan(
              session.user.id,
              orgId,
              options.permission.resource,
              options.permission.action,
            );
            if (!allowed) blocked = forbidden();
          }
          if (blocked) {
            response = blocked;
          } else {
            response = await handler(
              { session, userId: session.user.id, orgId },
              req,
              routeCtx ?? ({ params: {} as Params })
            );
          }
        }
      }
    } catch (error: unknown) {
      response = NextResponse.json(
        { success: false, error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed") },
        { status: 500 }
      );
    }

    // SA-A.2: fire-and-forget API call log. Never blocks the response.
    void logApiCall({
      orgId: orgIdForLog,
      userId: userIdForLog,
      appSlug: "quikscale",
      method: req.method,
      path: req.nextUrl.pathname,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
    });

    return response;
  };
}

/**
 * Curry factory for module-gated routes. Use at the top of any route file
 * that belongs to a specific FF-1 module, so every handler in the file
 * inherits the gate:
 *
 *   import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
 *   const withOrgAuth = withOrgAuthForModule("kpi");
 *   export const GET = withOrgAuth(async ({ orgId }, req) => { ... });
 *   export const POST = withOrgAuth(async ({ orgId }, req) => { ... });
 *
 * Any existing options (e.g. `fallbackErrorMessage`) still work — moduleKey
 * is merged in as a default but can be overridden per-call.
 */
export function withOrgAuthForModule(moduleKey: string) {
  return <Params = Record<string, never>>(
    handler: Parameters<typeof withOrgAuth<Params>>[0],
    options: WithTenantAuthOptions = {},
  ) => withOrgAuth<Params>(handler, { moduleKey, ...options });
}

/**
 * Per-resource curry factory. Each method-bound wrapper hard-codes the
 * RBAC v2 action so route files don't have to repeat it per handler:
 *
 *   const auth = withOrgAuthForResource("kpi", "KPI");
 *   export const GET    = auth.view(async ({ orgId }, req) => { ... });
 *   export const POST   = auth.create(async ({ orgId }, req) => { ... });
 *   export const PATCH  = auth.update(async ({ orgId }, req) => { ... });
 *   export const DELETE = auth.delete(async ({ orgId }, req) => { ... });
 */
export function withOrgAuthForResource(moduleKey: string, resource: Resource) {
  const wrap = (action: Action) =>
    <Params = Record<string, never>>(
      handler: Parameters<typeof withOrgAuth<Params>>[0],
      options: WithTenantAuthOptions = {},
    ) =>
      withOrgAuth<Params>(handler, {
        moduleKey,
        permission: { resource, action },
        ...options,
      });
  return {
    view: wrap("view"),
    create: wrap("create"),
    update: wrap("update"),
    delete: wrap("delete"),
  };
}
