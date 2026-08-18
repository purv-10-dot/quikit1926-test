import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { buildRoleMetrics } from "@/lib/services/dashboard/role-metrics";
import { parseFilters } from "@/lib/services/dashboard/filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "dashboard", "view");

    // Same filter parsing as every other dashboard route (from/to clamped to the
    // client's IANA zone via X-Client-TZ + tz-cookie fallback; ownerId with
    // `me` resolved). No separate implementation for the KPI cards.
    const filters = parseFilters(req, user);

    // windowAllMetrics: the dashboard wants EVERY card bounded by the selected
    // range (leads/accounts/contacts/opps/revenue/activities/tasks/quotes and
    // pipeline/forecast). The daily digest deliberately omits this flag and keeps
    // the default partial-windowing contract — see role-metrics.ts.
    const data = await buildRoleMetrics(user, filters.range, {
      windowAllMetrics: true,
      ownerId: filters.resolvedOwnerId,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}
