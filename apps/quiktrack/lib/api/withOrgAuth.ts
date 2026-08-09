import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { toErrorMessage } from "@/lib/api/errors";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { verifyApiToken, bearerFromHeader } from "@/lib/api/apiToken";
import { resolvePatAuth } from "@/lib/api/withPatAuth";
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
  /** "agent" only for PAT-resolved identities; "user" for every session/API-token caller. */
  actorType: "user" | "agent";
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
}

interface ResolvedIdentity {
  userId: string;
  orgId: string;
  session: Session;
  projectId?: string | null;
  actorType: "user" | "agent";
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
 * Resolve the caller's identity from either a Bearer API token OR the NextAuth
 * session cookie (or, when `allowPat` is set, a Personal Access Token —
 * see `resolvePatIdentity` above, which is a fully separate branch and never
 * falls through into the logic below).
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
async function resolveIdentity(req: NextRequest, allowPat: boolean): Promise<ResolvedIdentity | NextResponse> {
  if (allowPat) return resolvePatIdentity(req);

  const bearer = bearerFromHeader(req.headers.get("authorization"));
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
      const identity = await resolveIdentity(req, options.allowPat ?? false);
      if (identity instanceof NextResponse) return identity;
      const { userId, orgId, session, projectId, actorType } = identity;
      if (options.moduleKey) {
        const blocked = await gateModuleApi("quiktrack", options.moduleKey, orgId);
        if (blocked) return blocked as NextResponse;
      }
      return await handler(
        { session, userId, orgId, projectId, actorType },
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
