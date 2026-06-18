import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findDepartmentById,
  updateDepartment,
  deleteDepartment,
} from "@/lib/masters/departments-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await findDepartmentById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Department not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "org.department", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for org.department`, 403);
  }

  const body = await req.json();
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    ...safe
  } = body ?? {};

  try {
    const next = await updateDepartment(ctx.orgId, id, {
      ...safe,
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "Department not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "A department with this code already exists" },
        { status: 409 },
      );
    }
    console.error("[departments.update] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to update department") },
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
  const ctxOrResp = await requireMastersAction("delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "org.department", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for org.department`, 403);
  }
  const ok = await deleteDepartment(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Department not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
