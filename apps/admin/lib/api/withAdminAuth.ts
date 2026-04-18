/**
 * Admin app wrapper that combines requireAdmin + API-call logging.
 *
 * Every route that uses this wrapper:
 *   - Short-circuits with 401/403 if the caller isn't an admin
 *   - Logs a row in ApiCall after the response (fire-and-forget)
 *   - Captures tenantId + userId from the auth result so analytics can slice by tenant
 *
 * Migration path: replace `requireAdmin()` inside a route body with
 * `withAdminAuth(async ({ tenantId, userId }, req, ctx) => { ... })`
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { logApiCall } from "@quikit/shared/apiLogging";

export interface AdminAuthContext {
  userId: string;
  tenantId: string;
}

type Handler<Params> = (
  auth: AdminAuthContext,
  req: NextRequest,
  ctx: { params: Params },
) => Promise<NextResponse> | NextResponse;

export function withAdminAuth<Params = Record<string, never>>(handler: Handler<Params>) {
  return async (req: NextRequest, ctx?: { params: Params }): Promise<NextResponse> => {
    const startedAt = Date.now();
    let tenantIdForLog: string | null = null;
    let userIdForLog: string | null = null;
    let response: NextResponse;

    try {
      const auth = await requireAdmin();
      if ("error" in auth && auth.error) {
        response = auth.error;
      } else {
        tenantIdForLog = auth.tenantId;
        userIdForLog = auth.userId;
        response = await handler(
          { userId: auth.userId, tenantId: auth.tenantId },
          req,
          ctx ?? ({ params: {} as Params }),
        );
      }
    } catch (err) {
      response = NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "Operation failed" },
        { status: 500 },
      );
    }

    void logApiCall({
      tenantId: tenantIdForLog,
      userId: userIdForLog,
      appSlug: "admin",
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
