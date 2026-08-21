import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { toErrorMessage } from "@/lib/api/errors";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { verifyApiToken, bearerFromHeader } from "@/lib/api/apiToken";
import { resolvePatAuth } from "@/lib/api/withPatAuth";
import { verifyAgentJwt } from "@/lib/api/agentJwt";
import { looksLikeOAuthAccessToken, verifyOAuthAccessToken } from "@/lib/api/oauthToken";

/** Absolute URL of the RFC 9728 Protected Resource Metadata document, for the
 * `resource_metadata` param on a 401's `www-authenticate` header — this is
 * what lets an OAuth-capable MCP client (e.g. Claude Desktop) discover it
 * should authenticate via the QuikIT launcher instead of just failing. */
function protectedResourceMetadataUrl(req: NextRequest): string {
  // req.nextUrl.origin is unreliable behind a reverse proxy/tunnel (picks up
  // X-Forwarded-Proto but not X-Forwarded-Host) — see the same override in
  // app/.well-known/oauth-protected-resource/route.ts.
  const selfUrl = process.env.NEXT_PUBLIC_QUIKTRACK_URL || req.nextUrl.origin;
  return `${selfUrl}/.well-known/oauth-protected-resource`;
}

export interface OrgAuthContext {
  session: Session;
  userId: string;
  orgId: string;
  /** Only set when resolved via a PAT (see `WithOrgAuthOptions.allowPat`).
   * `null` for a user-scoped PAT; a project id for a legacy project-scoped
   * one; `undefined` for a session/API-token caller (no PAT involved at all). */
  projectId?: string | null;
  /** "agent" for PAT-resolved and agent-JWT-resolved identities; "user" for every session/API-token caller. */
  actorType: "user" | "agent";
  /**
   * Which service acted, when `actorType` is "agent" via an agent JWT (see
   * `WithOrgAuthOptions.allowAgentJwt`) — e.g. "ai-runtime". Undefined for
   * session/API-token/PAT identities. Carries the specificity `actorType`
   * deliberately doesn't: the auth service's `actingAs` vocabulary
   * (`ai_agent | platform_service | scheduled_job`) all collapse to
   * `actorType: "agent"` here, with `actingAgentId` recording which one.
   */
  actingAgentId?: string;
}

export interface WithOrgAuthOptions {
  fallbackErrorMessage?: string;
  moduleKey?: string;
  /**
   * Opt-in: also accept a Personal Access Token (`lib/api/withPatAuth.ts`) or
   * a launcher-IdP OAuth access token (`lib/api/oauthToken.ts`) as an
   * identity source, in addition to session/API-token. Off by default — a
   * PAT/OAuth token must stay unable to reach any route that doesn't
   * explicitly ask for it. Only `/api/mcp` sets this.
   */
  allowPat?: boolean;
  /**
   * Opt-in: also accept the platform auth service's short-lived agent JWT
   * (`lib/api/agentJwt.ts`) as an identity source — how the AI Runtime (and
   * other internal services) call in on a user's behalf. Off by default,
   * same reasoning as `allowPat`: a route must explicitly ask for it. Name
   * is fixed platform-wide — every app implementing this mirrors this flag.
   */
  allowAgentJwt?: boolean;
}

interface ResolvedIdentity {
  userId: string;
  orgId: string;
  session: Session;
  projectId?: string | null;
  actorType: "user" | "agent";
  actingAgentId?: string;
}

/**
 * Bearer-only identity resolution for routes that opt into `allowPat` —
 * tries, in order, an OAuth access token from the QuikIT launcher IdP, a
 * QuikTrack API token, then a Personal Access Token. Never falls back to a
 * session cookie — preserves the pre-existing Bearer-only contract for MCP
 * clients exactly, including the Bearer-specific error shape they already
 * depend on (RFC 6750 `www-authenticate` / `retry-after`, plus RFC 9728
 * `resource_metadata` so an OAuth-capable client can discover where to
 * authenticate), which is deliberately NOT the generic `{success:false,error}`
 * shape every other route uses.
 */
async function resolvePatIdentity(req: NextRequest): Promise<ResolvedIdentity | NextResponse> {
  const bearer = bearerFromHeader(req.headers.get("authorization"));
  if (bearer) {
    // OAuth access tokens issued by the QuikIT launcher IdP (apps/quikit)
    // have a distinct `qk_` prefix, so this can be checked cheaply before
    // trying either of the other two token formats. Resolved the same way a
    // user-scoped PAT is (no bound project, actorType "agent") — every MCP
    // tool's per-call projectId handling and audit-stamping already covers
    // this shape unchanged.
    if (looksLikeOAuthAccessToken(bearer)) {
      const oauthClaims = await verifyOAuthAccessToken(bearer);
      if (oauthClaims) {
        const membership = await db.orgMember.findFirst({
          where: { userId: oauthClaims.userId, orgId: oauthClaims.orgId, status: "active", org: { status: "active" } },
          select: { id: true },
        });
        if (membership) {
          const session = {
            user: { id: oauthClaims.userId, email: oauthClaims.email, orgId: oauthClaims.orgId },
            expires: "",
          } as unknown as Session;
          return { userId: oauthClaims.userId, orgId: oauthClaims.orgId, projectId: null, actorType: "agent", session };
        }
      }
      return NextResponse.json(
        { error: "invalid_token" },
        {
          status: 401,
          headers: {
            "www-authenticate": `Bearer error="invalid_token", resource_metadata="${protectedResourceMetadataUrl(req)}"`,
          },
        },
      );
    }

    const claims = await verifyApiToken(bearer);
    if (claims) {
      const membership = await db.orgMember.findFirst({
        where: { userId: claims.userId, orgId: claims.orgId, status: "active", org: { status: "active" } },
        select: { id: true },
      });
      if (membership) {
        const session = {
          user: { id: claims.userId, email: claims.email, orgId: claims.orgId },
          expires: "",
        } as unknown as Session;
        return { userId: claims.userId, orgId: claims.orgId, session, actorType: "user" };
      }
    }

    const patResult = await resolvePatAuth(req);
    if (patResult.ok) {
      const session = {
        user: { id: patResult.context.userId, orgId: patResult.context.orgId },
        expires: "",
      } as unknown as Session;
      return {
        userId: patResult.context.userId,
        orgId: patResult.context.orgId,
        projectId: patResult.context.projectId,
        actorType: patResult.context.actorType,
        actingAgentId: patResult.context.actingAgentId,
        session,
      };
    }
    if (patResult.status === 429) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "retry-after": String(patResult.retryAfterSeconds) } },
      );
    }
  }
  return NextResponse.json(
    { error: "invalid_token" },
     {
      status: 401,
      headers: {
        "www-authenticate": `Bearer error="invalid_token", resource_metadata="${protectedResourceMetadataUrl(req)}"`,
      },
    },
  );
}

/**
 * Agent-JWT-only identity resolution for routes that opt into
 * `allowAgentJwt`. Mirrors `resolvePatIdentity`: a fully separate branch,
 * never falls back to a session cookie or any other identity source. Live
 * org membership is NOT separately rechecked here — unlike the long-lived
 * API-token/PAT paths, this token's own `exp` (≤900s, enforced inside
 * `verifyAgentJwt`) is the freshness guarantee; the issuing auth service is
 * responsible for only minting one for a currently-active user.
 */
async function resolveAgentJwtIdentity(req: NextRequest): Promise<ResolvedIdentity | NextResponse> {
  const bearer = bearerFromHeader(req.headers.get("authorization"));
  if (bearer) {
    const claims = await verifyAgentJwt(bearer);
    if (claims) {
      const session = {
        user: { id: claims.userId, orgId: claims.orgId },
        expires: "",
      } as unknown as Session;
      return {
        userId: claims.userId,
        orgId: claims.orgId,
        actorType: "agent",
        actingAgentId: claims.actingAgentId,
        session,
      };
    }
  }
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Resolve the caller's identity from either a Bearer API token OR the NextAuth
 * session cookie — or, when the route opts in, a Personal Access Token or the
 * platform's agent JWT.
 *
 * The two opt-ins are NOT the same shape, deliberately:
 *
 *   - `allowPat` is EXCLUSIVE. `resolvePatIdentity` is a fully separate branch
 *     that never falls through to a cookie session. Only /api/mcp sets it, and
 *     that route is bearer-only by contract (its clients have no cookie, and
 *     they depend on its RFC 6750 / 9728 error shape rather than this file's
 *     generic one).
 *
 *   - `allowAgentJwt` is ADDITIVE. The agent-JWT branch is taken only when a
 *     bearer token is actually present; with no bearer, resolution falls
 *     through to the normal session-cookie path below, so a route that opts in
 *     still serves the browser app exactly as before.
 *
 * That distinction is load-bearing. `allowAgentJwt` was originally written as
 * an unconditional early return, which silently made every opted-in route
 * agent-JWT-ONLY and 401'd every logged-in user — the eight read routes of
 * b9d6dfc82 were the whole spaces list, board and backlog. Keep the `&& bearer`
 * guard.
 *
 * What the guard does NOT do is soften verification: once a bearer IS present
 * on an agent-JWT route, a BAD one returns 401 from `resolveAgentJwtIdentity`
 * rather than degrading to the cookie session. An attacker cannot strip a
 * failing token's way into a weaker path, and a caller cannot accidentally
 * authenticate as the wrong identity — presenting a token means being judged
 * on it.
 *
 * Bearer tokens (minted by POST /api/v1/token) are how external Swagger/Scalar
 * consumers and API scripts authenticate — they have no session cookie. When a
 * valid token is present we build a synthetic Session from its claims so
 * downstream handlers see the same `ctx.session.user.id` shape they always
 * have. Live org membership is re-verified here so a revoked or suspended user
 * loses access within the token's lifetime regardless of its claims.
 *
 * When no Bearer token is present, we fall back to the cookie session
 * unchanged — the browser app is entirely unaffected.
 *
 * Returns the resolved identity, or a NextResponse to short-circuit with
 * (401 / 403).
 */
async function resolveIdentity(
  req: NextRequest,
  allowPat: boolean,
  allowAgentJwt: boolean,
): Promise<ResolvedIdentity | NextResponse> {
  if (allowPat) return resolvePatIdentity(req);

  const bearer = bearerFromHeader(req.headers.get("authorization"));

  // Additive, not exclusive — see the docblock. No bearer → fall through to
  // the session path; bad bearer → 401 from inside, never a downgrade.
  if (allowAgentJwt && bearer) return resolveAgentJwtIdentity(req);

  if (bearer) {
    const claims = await verifyApiToken(bearer);
    if (!claims) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    // Re-check the token's org membership is still active (mirrors the
    // recheck the NextAuth jwt callback runs for cookie sessions).
    const membership = await db.orgMember.findFirst({
      where: {
        userId: claims.userId,
        orgId: claims.orgId,
        status: "active",
        org: { status: "active" },
      },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
    }
    const session = {
      user: { id: claims.userId, email: claims.email, orgId: claims.orgId },
      expires: "",
    } as unknown as Session;
    return { userId: claims.userId, orgId: claims.orgId, session, actorType: "user" };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const orgId = await getOrgId(session.user.id);
  if (!orgId) {
    return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
  }
  return { userId: session.user.id, orgId, session, actorType: "user" };
}

export function withOrgAuth<Params = Record<string, never>>(
  handler: (
    ctx: OrgAuthContext,
    req: NextRequest,
    routeCtx: { params: Params },
  ) => Promise<Response> | Response,
  options: WithOrgAuthOptions = {},
) {
  return async (req: NextRequest, routeCtx?: { params: Params }): Promise<Response> => {
    try {
      const identity = await resolveIdentity(req, options.allowPat ?? false, options.allowAgentJwt ?? false);
      if (identity instanceof NextResponse) return identity;
      const { userId, orgId, session, projectId, actorType, actingAgentId } = identity;
      if (options.moduleKey) {
        const blocked = await gateModuleApi("quiktrack", options.moduleKey, orgId);
        if (blocked) return blocked as NextResponse;
      }
      return await handler(
        { session, userId, orgId, projectId, actorType, actingAgentId },
        req,
        routeCtx ?? ({ params: {} as Params }),
      );
    } catch (error: unknown) {
      return NextResponse.json(
        { success: false, error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed") },
        { status: 500 },
      );
    }
  };
}

export function withOrgAuthForModule(moduleKey: string | null) {
  return <Params = Record<string, never>>(
    handler: Parameters<typeof withOrgAuth<Params>>[0],
    options: WithOrgAuthOptions = {},
  ) =>
    withOrgAuth<Params>(handler, moduleKey ? { moduleKey, ...options } : options);
}
