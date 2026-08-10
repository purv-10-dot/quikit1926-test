import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { toErrorMessage } from "@/lib/api/errors";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { verifyApiToken, bearerFromHeader } from "@/lib/api/apiToken";
import { resolvePatAuth } from "@/lib/api/withPatAuth";

export interface OrgAuthContext {
  session: Session;
  userId: string;
  orgId: string;
  /** Only set when resolved via a PAT (see `WithOrgAuthOptions.allowPat`) — the single project that PAT is scoped to. */
  projectId?: string;
  /** "agent" only for PAT-resolved identities; "user" for every session/API-token caller. */
  actorType: "user" | "agent";
}

export interface WithOrgAuthOptions {
  fallbackErrorMessage?: string;
  moduleKey?: string;
  /**
   * Opt-in: also accept a project-scoped Personal Access Token
   * (`lib/api/withPatAuth.ts`) as an identity source, in addition to
   * session/API-token. Off by default — a PAT must stay unable to reach any
   * route that doesn't explicitly ask for it. Only `/api/mcp` sets this.
   */
  allowPat?: boolean;
}

interface ResolvedIdentity {
  userId: string;
  orgId: string;
  session: Session;
  projectId?: string;
  actorType: "user" | "agent";
}

/**
 * PAT-only identity resolution for routes that opt into `allowPat`. Never
 * falls back to a session cookie — preserves the pre-existing PAT-only
 * contract for MCP clients exactly, including the Bearer-specific error
 * shape they already depend on (RFC 6750 `www-authenticate` / `retry-after`),
 * which is deliberately NOT the generic `{success:false,error}` shape every
 * other route uses.
 */
async function resolvePatIdentity(req: NextRequest): Promise<ResolvedIdentity | NextResponse> {
  const bearer = bearerFromHeader(req.headers.get("authorization"));
  if (bearer) {
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
    { status: 401, headers: { "www-authenticate": 'Bearer error="invalid_token"' } },
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
