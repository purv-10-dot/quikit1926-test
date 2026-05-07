import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
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
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (outOfScope(ctx.projectIds, params.id)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const row = await findProjectById(ctx.tenantId, params.id);
  if (!row) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (outOfScope(ctx.projectIds, id)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const body = await req.json();
  const {
    id: _a, tenantId: _b, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    companyName: _h, clientName: _i,
    ...safe
  } = body ?? {};
  try {
    const next = await updateProject(ctx.tenantId, id, { ...safe, updatedBy: ctx.userId });
    if (!next) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Project code is already in use" }, { status: 409 });
    }
    if (e?.code === "P2003") {
      return NextResponse.json({ error: "Referenced company or customer does not exist" }, { status: 400 });
    }
    console.error("[projects.update] failed:", err);
    return NextResponse.json({ error: e?.message ?? "Failed to update project" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (outOfScope(ctx.projectIds, params.id)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const ok = await deleteProject(ctx.tenantId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
