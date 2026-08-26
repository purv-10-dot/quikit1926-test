import type { NextRequest } from "next/server";
import { withAuth, type AuthContext } from "@quikit/auth/with-auth";
import { db as prisma } from "@quikit/database";
import {
  captureError,
  logger,
  pathOf,
  requestId,
  type OrgActor,
} from "@/lib/shared";
import { HttpError, isHttpError } from "./errors";
import { assertMembership } from "./authz";

/**
 * Adapt QuikIT's `withAuth` thrown `Response` (401/403) into an `HttpError`, so
 * the wrapper's HttpError→Response mapping (QuikChat's uniform `{ error }` body)
 * applies rather than the thrown Response escaping as a 500. Status is preserved
 * verbatim. Identical to the helper in orgAuth.ts (both call withAuth).
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
 * Resolve the unified actor for an internal request from QuikIT's JWT:
 *   - any non-`'user'` `actingAs` → ai_agent, OR
 *   - `'user'` (or absent) → human.
 *
 * The test is `!== "user"`, NOT `=== "ai_agent"`. The auth service's vocabulary
 * is `user | ai_agent | platform_service | scheduled_job`, and the previous
 * equality check silently attributed `platform_service` and `scheduled_job` to
 * `actorType: "human"` against the impersonated user — an agent action recorded
 * as a human one, with no error and no rejection. `OrgActor.actorType` has only
 * `human | ai_agent`, so all three agent values map to `ai_agent`; `agentId`
 * carries whatever specificity the token supplied.
 *
 * QuikChat no longer verifies an inbound `Authorization: Bearer` agent JWT or
 * writes an AgentJwtIssuance audit row — QuikIT's withAuth carries the actor
 * claim (`actingAs` / `actingAgentId`) and owns agent issuance + audit. Because
 * withAuth throws on an invalid/absent session, this never returns null.
 */
export async function resolveActor(req: Request): Promise<OrgActor> {
  const ctx = await authContext(req as NextRequest);
  if (ctx.actingAs !== "user") {
    return {
      orgId: ctx.orgId,
      actorType: "ai_agent",
      // AuthContext.actingAgentId is `string | null`; normalize null → undefined.
      // Legitimately absent for platform_service / scheduled_job.
      agentId: ctx.actingAgentId ?? undefined,
      agentRunId: undefined,
      channelScope: undefined,
    };
  }
  return { orgId: ctx.orgId, actorType: "human", userId: ctx.userId };
}

/** True if the request carries the internal shared secret (for the manifest). */
export function hasInternalSecret(req: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  return !!secret && req.headers.get("x-internal-secret") === secret;
}

/**
 * Hard tenant guard for an agent reading a channel: channel must be in the
 * agent's org. The channel-scope sub-check is retained for shape-compatibility
 * but is a NO-OP — QuikIT agent tokens are not channel-scoped (`channelScope`
 * is always undefined), so the guard never triggers.
 */
export async function assertAgentReadAccess(actor: OrgActor, channelId: string): Promise<void> {
  const channel = await prisma.qcChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.orgId !== actor.orgId) {
    throw new HttpError(404, "Channel not found"); // do not leak existence
  }
  if (actor.channelScope && !actor.channelScope.includes(channelId)) {
    throw new HttpError(403, "Channel is outside this agent run's scope");
  }
}

/** Access gate for both actor kinds: human → membership; agent → org/scope. */
export async function assertReadAccess(actor: OrgActor, channelId: string): Promise<void> {
  if (actor.actorType === "ai_agent") {
    await assertAgentReadAccess(actor, channelId);
    return;
  }
  if (!actor.userId) throw new HttpError(401, "Not authenticated");
  await assertMembership(actor.orgId, channelId, actor.userId);
}

interface RouteContext {
  params?: Record<string, string>;
}

export type InternalRouteHandler = (
  req: Request,
  actor: OrgActor,
  params: Record<string, string>,
) => Response | Promise<Response>;

/**
 * Gate for `/api/internal/*`: resolves a unified actor from the QuikIT JWT and
 * calls the handler. `resolveActor` throws (adapted to HttpError) on an invalid
 * session, so the catch below maps it — there is no null-actor branch. The
 * human product gate (`withOrgAuth`) is deliberately left unchanged.
 */
export function withInternalAuth(handler: InternalRouteHandler) {
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
      const actor = await resolveActor(req);
      const base = {
        orgId: actor.orgId,
        actorType: actor.actorType,
        userId: actor.userId,
        agentId: actor.agentId,
      };
      return done(await handler(req, actor, context?.params ?? {}), base);
    } catch (e) {
      if (isHttpError(e)) return done(Response.json({ error: e.message }, { status: e.status }));
      await captureError(e, { requestId: reqId, path: pathOf(req) });
      logger.error({ requestId: reqId, path: pathOf(req) }, "unhandled error");
      throw e;
    }
  };
}
