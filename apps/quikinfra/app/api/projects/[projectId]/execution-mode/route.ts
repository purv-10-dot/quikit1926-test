import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { setExecutionMode } from "@/lib/scope/activity-repository";
import { scopeErrorResponse, outOfProjectScope } from "@/lib/scope/http";
import type { ExecutionMode } from "@/lib/scope/scope-resolver";

/**
 * PATCH /api/projects/[projectId]/execution-mode
 * Guarded conversion between BOQ and FREE_SCOPE. Gated on master.project edit;
 * conversions past existing execution transactions require super-admin (the
 * guard ladder lives in setExecutionMode()).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string } }
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

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode as ExecutionMode;
  const isSuperAdmin = ctx.permissions.has("*") || ctx.roleKey === "super_admin";

  try {
    await setExecutionMode(ctx, params.projectId, mode, isSuperAdmin);
    return NextResponse.json({ success: true, mode });
  } catch (e: unknown) {
    return scopeErrorResponse(e, "projects.execution-mode");
  }
}
