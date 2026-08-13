import { NextResponse } from "next/server";
import { withServiceAuth } from "@/lib/api/withServiceAuth";
import { isCalendarConnectedForOrg } from "@/lib/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/calendar/connected?orgId= — service-authed. Reports whether
 * the org has a connected Microsoft (Teams) calendar, so QuikScale's Client
 * Master form can show the "Create Teams meetings" affordance only when it's
 * actionable. Light DB check (no Graph call).
 */
export const GET = withServiceAuth(async (req) => {
  const orgId = new URL(req.url).searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ success: false, error: "orgId is required" }, { status: 400 });
  }
  const connected = await isCalendarConnectedForOrg(orgId);
  return NextResponse.json({ success: true, data: { connected } });
});
