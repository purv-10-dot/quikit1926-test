import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getActivityFieldAggregates } from "@/lib/services/dashboard/activity-field-aggregates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FR-4.4 — per-rep activity custom-field aggregates for the dashboard, on-demand
// for a chosen activity type. Own route (not /metrics) because it takes an
// activityTypeId and would be heavy if aggregated per-load for every type.
//
// ACCESS: dashboard:view (same as /metrics). SCOPE: the SESSION user from
// requireApiUser is passed UNMODIFIED to the service — its getScope /
// resolveManagerTeam scope on the actual caller (Admin org-wide / SalesManager
// group / SalesUser own). Do not substitute an org-only/elevated user here, or
// the scope safety proven at FR-4.3 would not hold on this path.
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "dashboard", "view");

    const activityTypeId = new URL(req.url).searchParams.get("activityTypeId");
    if (!activityTypeId) {
      return NextResponse.json(
        { success: false, error: "activityTypeId is required" },
        { status: 400 },
      );
    }

    const data = await getActivityFieldAggregates(user, { activityTypeId });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}
