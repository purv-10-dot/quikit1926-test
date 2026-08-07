import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getDispositionStatuses } from "@/lib/services/forms/disposition-statuses.service";

export const runtime = "nodejs";

/**
 * GET /api/forms/disposition-statuses?stage=...
 *
 * The ONE canonical disposition-status source for the agent form (stage-filtered)
 * and the rule-builder (no stage -> all). Agent-facing: requireApiUser only (no
 * settings gate); tenant-scoped via the resolved user.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const stage = req.nextUrl.searchParams.get("stage");
    const data = await getDispositionStatuses(user.orgId, stage);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}
