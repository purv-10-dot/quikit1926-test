import { NextRequest, NextResponse } from "next/server";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { setActivitiesLocked } from "@/lib/scope/activity-repository";
import { scopeErrorResponse, outOfProjectScope } from "@/lib/scope/http";

/**
 * POST /api/projects/[projectId]/activities/lock  { locked: boolean }
 * Baseline lock/unlock all activities + sets CnProject.freeScopeLocked.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.activity_scope", "lock");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (outOfProjectScope(ctx.projectIds, params.projectId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!hasMatrixAction(ctx, "pm.activity_scope", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for pm.activity_scope`, 403);
  }

  const body = await req.json().catch(() => ({}));
  const locked = Boolean(body?.locked);
  try {
    await setActivitiesLocked(ctx, params.projectId, locked);
    return NextResponse.json({ success: true, locked });
  } catch (e: unknown) {
    return scopeErrorResponse(e, "projects.activities.lock");
  }
}
