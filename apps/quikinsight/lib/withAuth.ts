import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasPermission, sessionRole, type Permission } from "@/lib/rbac";

// The request object handed to a guarded handler, with the validated session attached.
export type AuthedRequest = NextRequest & { session: Awaited<ReturnType<typeof getServerSession>> };

type RouteContext = { params?: Record<string, string | string[]> };
type AuthedHandler = (req: AuthedRequest, ctx: RouteContext) => Promise<Response> | Response;

/**
 * Wrap an API route handler with authentication + (optional) authorization.
 *
 * - 401 if there is no valid session.
 * - 403 if `requiredPermission` is given and the user role lacks it.
 * - Otherwise attaches the session to `req.session` and calls the handler.
 */
export function withAuth(handler: AuthedHandler, requiredPermission?: Permission) {
  return async (req: NextRequest, ctx: RouteContext): Promise<Response> => {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (requiredPermission && !hasPermission(sessionRole(session), requiredPermission)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    (req as AuthedRequest).session = session;
    return handler(req as AuthedRequest, ctx);
  };
}
