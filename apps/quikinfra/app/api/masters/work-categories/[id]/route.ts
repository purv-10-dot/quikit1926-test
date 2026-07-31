import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findWorkCategoryById,
  updateWorkCategory,
  deleteWorkCategory,
} from "@/lib/masters/work-categories-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireMastersAction("construction.org_work_category", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await findWorkCategoryById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Work category not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "org.work_category", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for org.work_category`, 403);
  }

  const body = await req.json();
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    ...safe
  } = body ?? {};

  try {
    const next = await updateWorkCategory(ctx.orgId, id, {
      ...safe,
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "Work category not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    console.error("[work-categories.update] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to update work category") },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireMastersAction("construction.org_work_category", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "org.work_category", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for org.work_category`, 403);
  }
  const ok = await deleteWorkCategory(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Work category not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
