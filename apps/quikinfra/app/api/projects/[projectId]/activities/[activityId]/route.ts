import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  updateActivity,
  deleteActivity,
  type UpdateActivityInput,
} from "@/lib/scope/activity-repository";
import { scopeErrorResponse, outOfProjectScope } from "@/lib/scope/http";

/**
 * PATCH /api/projects/[projectId]/activities/[activityId]
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; activityId: string } }
) {
  const ctxOrResp = await requireMastersAction("construction.project", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (outOfProjectScope(ctx.projectIds, params.projectId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!hasMatrixAction(ctx, "master.project", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for master.project`, 403);
  }

  const body = (await req.json().catch(() => ({}))) as UpdateActivityInput;
  try {
    const data = await updateActivity(
      ctx,
      params.projectId,
      params.activityId,
      body
    );
    return NextResponse.json({ data });
  } catch (e: unknown) {
    return scopeErrorResponse(e, "projects.activities.update");
  }
}

/**
 * DELETE /api/projects/[projectId]/activities/[activityId]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { projectId: string; activityId: string } }
) {
  const ctxOrResp = await requireMastersAction("construction.project", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (outOfProjectScope(ctx.projectIds, params.projectId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!hasMatrixAction(ctx, "master.project", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for master.project`, 403);
  }
  try {
    await deleteActivity(ctx, params.projectId, params.activityId);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return scopeErrorResponse(e, "projects.activities.delete");
  }
}
