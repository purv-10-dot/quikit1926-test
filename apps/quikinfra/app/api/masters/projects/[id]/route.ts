import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findProjectById,
  updateProject,
  deleteProject,
} from "@/lib/masters/projects-repository";

// Block by-id access when the user has a project-assignment whitelist that
// excludes this project. We treat "out of scope" as 404 (not 403) so a
// site-scoped user can't probe the existence of unrelated projects by
// brute-forcing IDs — they get the same response as a missing row.
function outOfScope(ctxProjectIds: string[] | undefined, id: string): boolean {
  return Array.isArray(ctxProjectIds) && !ctxProjectIds.includes(id);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireMastersAction("construction.project", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (outOfScope(ctx.projectIds, params.id)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const row = await findProjectById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResp = await requireMastersAction("construction.project", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (outOfScope(ctx.projectIds, id)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!hasMatrixAction(ctx, "master.project", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for master.project`, 403);
  }
  const body = await req.json();
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    clientName: _i,
    ...safe
  } = body ?? {};
  try {
    const next = await updateProject(ctx.orgId, id, { ...safe, updatedBy: ctx.userId });
    if (!next) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json({ error: "Project code is already in use" }, { status: 409 });
    }
    if (getErrorCode(err) === "P2003") {
      return NextResponse.json({ error: "Referenced company or customer does not exist" }, { status: 400 });
    }
    console.error("[projects.update] failed:", err);
    return NextResponse.json({ error: toErrorMessage(err, "Failed to update project") }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireMastersAction("construction.project", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (outOfScope(ctx.projectIds, params.id)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!hasMatrixAction(ctx, "master.project", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for master.project`, 403);
  }
  const ok = await deleteProject(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
