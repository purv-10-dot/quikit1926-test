import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getCurrentDispositionRuntime } from "@/lib/services/forms/form-runtime.service";

export const runtime = "nodejs";

/**
 * GET /api/forms/runtime — the tenant's LIVE call_disposition form runtime
 * (structure + EvalRule-shaped rules), or { data: null } when no form is live.
 *
 * Agent-facing: requireApiUser only (agents render the live form). Resolution +
 * the returned runtime are tenant-scoped, so there is no cross-tenant exposure.
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const data = await getCurrentDispositionRuntime(user.orgId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}
