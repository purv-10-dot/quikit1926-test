import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { toErrorMessage } from "@/lib/api/errors";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { verifyApiToken, bearerFromHeader } from "@/lib/api/apiToken";

export interface OrgAuthContext {
  session: Session;
  userId: string;
  orgId: string;
}

export interface WithOrgAuthOptions {
  fallbackErrorMessage?: string;
  moduleKey?: string;
}

interface ResolvedIdentity {
  userId: string;
  orgId: string;
  session: Session;
}

/**
 * Resolve the caller's identity from either a Bearer API token OR the NextAuth
 * session cookie.
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
async function resolveIdentity(req: NextRequest): Promise<ResolvedIdentity | NextResponse> {
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
    return { userId: claims.userId, orgId: claims.orgId, session };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const orgId = await getOrgId(session.user.id);
  if (!orgId) {
    return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
  }
  return { userId: session.user.id, orgId, session };
}

export function withOrgAuth<Params = Record<string, never>>(
  handler: (
    ctx: OrgAuthContext,
    req: NextRequest,
    routeCtx: { params: Params },
  ) => Promise<NextResponse> | NextResponse,
  options: WithOrgAuthOptions = {},
) {
  return async (req: NextRequest, routeCtx: { params: Params }): Promise<NextResponse> => {
    try {
      const identity = await resolveIdentity(req);
      if (identity instanceof NextResponse) return identity;
      const { userId, orgId, session } = identity;
      if (options.moduleKey) {
        const blocked = await gateModuleApi("quiktrack", options.moduleKey, orgId);
        if (blocked) return blocked as NextResponse;
      }
      return await handler(
        { session, userId, orgId },
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
