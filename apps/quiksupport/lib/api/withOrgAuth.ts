import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { toErrorMessage } from "@/lib/api/errors";
import { gateModuleApi } from "@quikit/auth/feature-gate";

/**
 * Canonical org-auth guard for QuikSupport — the same wrapper every QuikIT app
 * uses (see quiktrack/quikscale `lib/api/withOrgAuth.ts`). Injects
 * `{ session, userId, orgId }` from the session, returns 401 for
 * unauthenticated callers and 403 when the user has no active membership /
 * app access. DB-touching routes MUST go through this (root CLAUDE.md rule);
 * the only exceptions are `/api/health` and `/api/auth/*`.
 *
 * Helpdesk routes that also need the resolved `HdUser` (role checks) should use
 * `withHelpdeskAuth` from `@/lib/api/withHelpdeskAuth`, which layers the
 * domain-user resolution on top of this wrapper.
 */
export interface OrgAuthContext {
  session: Session;
  userId: string;
  orgId: string;
}

export interface WithOrgAuthOptions {
  fallbackErrorMessage?: string;
  moduleKey?: string;
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
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      const orgId = await getOrgId(session.user.id);
      if (!orgId) {
        return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
      }
      if (options.moduleKey) {
        const blocked = await gateModuleApi("quiksupport", options.moduleKey, orgId);
        if (blocked) return blocked as NextResponse;
      }
      return await handler(
        { session, userId: session.user.id, orgId },
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
  ) => withOrgAuth<Params>(handler, moduleKey ? { moduleKey, ...options } : options);
}
