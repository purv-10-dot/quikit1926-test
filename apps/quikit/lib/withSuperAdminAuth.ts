/**
 * QuikIT super-admin wrapper that combines requireSuperAdmin + API-call logging.
 *
 * Covers every /api/super/* route. Logs to ApiCall with appSlug="quikit".
 * tenantId in the log is always null for super-admin calls (they operate
 * across tenants, not from within one), but userId is populated.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/requireSuperAdmin";
import { logApiCall } from "@quikit/shared/apiLogging";

export interface SuperAdminAuthContext {
  userId: string;
}

type Handler<Params> = (
  auth: SuperAdminAuthContext,
  req: NextRequest,
  ctx: { params: Params },
) => Promise<NextResponse> | NextResponse;

export function withSuperAdminAuth<Params = Record<string, never>>(handler: Handler<Params>) {
  return async (req: NextRequest, ctx?: { params: Params }): Promise<NextResponse> => {
    const startedAt = Date.now();
    let userIdForLog: string | null = null;
    let response: NextResponse;

    try {
      const auth = await requireSuperAdmin();
      if ("error" in auth) {
        response = auth.error;
      } else {
        userIdForLog = auth.userId;
        response = await handler({ userId: auth.userId }, req, ctx ?? ({ params: {} as Params }));
      }
    } catch (err) {
      response = NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "Operation failed" },
        { status: 500 },
      );
    }

    void logApiCall({
      tenantId: null,
      userId: userIdForLog,
      appSlug: "quikit",
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
