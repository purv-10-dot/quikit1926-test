/**
 * POST /api/quotes/expire-stale
 *
 * Cron entry point for audit finding W-3 (quote expiry automation).
 * Scans this tenant's Active quotes, marks any past `effectiveTo` as
 * Lost with reason "Expired", and returns the count + affected ids.
 *
 * Auth: requires admin (`assertModule(user, "settings", "edit")`) — this
 * is a maintenance op, not a sales-rep action. Service routes (cron
 * runners on Vercel / GitHub Actions / external schedulers) should
 * authenticate as a service account with admin perms.
 *
 * How to wire a cron:
 *
 *   Vercel Cron (free tier supports daily):
 *     // vercel.json
 *     { "crons": [{ "path": "/api/quotes/expire-stale", "schedule": "0 1 * * *" }] }
 *     (1 AM IST run — pre-business-hours sweep.)
 *
 *   GitHub Actions:
 *     - cron: '0 1 * * *'  →  curl POST with a service-account session cookie
 *
 *   Local dev: just hit the endpoint by hand — it's idempotent.
 *
 * Multi-tenant note: this endpoint is per-tenant (uses the calling
 * session’s orgId). A platform-level "expire all tenants" runner
 * would iterate the Tenant table and POST per tenant — out of scope
 * for the app-side endpoint.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { expireStaleQuotes } from "@/lib/services/quotes/quote-service";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(_req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    // Admin-only operation. Reusing the `settings.edit` permission row
    // — when a dedicated `automation.run` permission ships, switch.
    await assertModule(user, "settings", "edit");

    const result = await expireStaleQuotes(user.orgId);
    return ok({
      orgId: user.orgId,
      expiredCount: result.count,
      quoteIds: result.quoteIds,
      ranAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to expire stale quotes";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/expire-stale POST]", error);
    return fail(status, message);
  }
}
