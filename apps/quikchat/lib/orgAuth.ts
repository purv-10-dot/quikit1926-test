import type { NextRequest } from "next/server";
import { withAuth, type AuthContext } from "@quikit/auth/with-auth";
import {
  captureError,
  logger,
  pathOf,
  rateLimit,
  requestId,
  type OrgContext,
} from "@/lib/shared";
import { HttpError, isHttpError } from "./errors";
import { getRawSession } from "./session";
import { assertMembership } from "./authz";
import { ensureUserRole } from "./authz/seed";
import { gateModuleApi } from "@quikit/auth/feature-gate";

// Re-export so `import { assertMembership } from "@/lib/orgAuth"` keeps working
// for ported routes that used QuikChat's original @quikit/auth surface.
export { assertMembership };

/** Per-route rate-limit config (applied per actor). */
export interface RateLimitConfig {
  bucket: string;
  limit: number;
  windowMs: number;
}

function tooManyRequests(retryAfterMs: number): Response {
  return Response.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}

/**
 * Resolve the caller's AuthContext via QuikIT's `withAuth`, adapting its thrown
 * `Response` (401/403) into an `HttpError`. withAuth throws a `Response`; Next's
 * App Router surfaces a thrown Response as a 500, so we translate it here and
 * let the wrapper's existing HttpError→Response mapping (QuikChat's uniform
 * `{ error }` body) apply. Status is preserved verbatim — any thrown Response
 * status, not just 401/403. Identical to the helper in actor.ts.
 */
async function authContext(req: NextRequest): Promise<AuthContext> {
  try {
    return await withAuth(req);
  } catch (e) {
    if (e instanceof Response) {
      throw new HttpError(e.status, e.status === 403 ? "Forbidden" : "Unauthorized");
    }
    throw e;
  }
}

/**
 * Session-only org resolver for server components / `getOrgId` (no request in
 * scope). QuikIT's withAuth + middleware already enforce entitlement, so this
 * no longer re-checks OrgMember / UserAppAccess against the DB — it just
 * projects the session.
 *
 * @throws {HttpError} 401 if unauthenticated.
 */
export async function getOrgId(): Promise<string> {
  return (await resolveOrgContext()).orgId;
}

export async function resolveOrgContext(): Promise<OrgContext> {
  const session = await getRawSession();
  if (!session) throw new HttpError(401, "Not authenticated");
  return session;
}

export type OrgRouteHandler = (
  req: Request,
  ctx: OrgContext,
  params: Record<string, string>,
) => Response | Promise<Response>;

/** App Router passes `{ params }` as the second handler argument. */
interface RouteContext {
  params?: Record<string, string>;
}

/**
 * Wrap a Next.js route handler with the org boundary:
 *   - 401 if there is no valid session/JWT,
 *   - 403 if the JWT has no org selected,
 *   - otherwise calls `handler(req, { userId, orgId }, params)`.
 *
 * Entitlement is enforced by QuikIT's `withAuth` (JWT) + middleware; this
 * wrapper layers on request-id, timing, structured logging, and rate limiting.
 * `params` are the dynamic route segments from the App Router context.
 */
export function withOrgAuth(
  handler: OrgRouteHandler,
  opts?: { rateLimit?: RateLimitConfig; moduleKey?: string },
) {
  return async (req: Request, context?: RouteContext): Promise<Response> => {
    const reqId = requestId(req);
    const start = Date.now();
    const done = (res: Response, fields: Record<string, unknown> = {}): Response => {
      res.headers.set("x-request-id", reqId);
      logger.info(
        {
          requestId: reqId,
          method: req.method,
          path: pathOf(req),
          status: res.status,
          ms: Date.now() - start,
          ...fields,
        },
        "request",
      );
      return res;
    };
    try {
      const ctx = await authContext(req as NextRequest);
      const orgCtx: OrgContext = { userId: ctx.userId, orgId: ctx.orgId };
      const base = { orgId: ctx.orgId, actorType: "human", userId: ctx.userId };
      // RBAC v2 seed-before-check (Phase 2): guarantee the caller holds a role
      // BEFORE any userCan/requireAdmin gate in the handler runs, so fail-closed
      // enforcement can't lock out a not-yet-seeded user. Steady state is one
      // indexed existence check; swallows its own errors — never blocks/fails a
      // request. Covers deep-links that skip the dashboard page.
      await ensureUserRole(ctx.userId, ctx.orgId);
      // FF-1 module gate (RBAC Phase 3): if this route belongs to a toggleable
      // module, 404 when the tenant has it disabled (or 403 if the whole app is
      // blocked). `messaging` routes never set moduleKey (always-on core).
      if (opts?.moduleKey) {
        const blocked = await gateModuleApi("quikchat", opts.moduleKey, ctx.orgId);
        if (blocked) return done(blocked, base);
      }
      if (opts?.rateLimit) {
        const { bucket, limit, windowMs } = opts.rateLimit;
        const r = await rateLimit(`${bucket}:${ctx.orgId}:${ctx.userId}`, limit, windowMs);
        if (!r.ok) return done(tooManyRequests(r.retryAfterMs), base);
      }
      return done(await handler(req, orgCtx, context?.params ?? {}), base);
    } catch (e) {
      if (isHttpError(e)) {
        return done(Response.json({ error: e.message }, { status: e.status }));
      }
      await captureError(e, { requestId: reqId, path: pathOf(req) });
      logger.error({ requestId: reqId, path: pathOf(req) }, "unhandled error");
      throw e;
    }
  };
}
