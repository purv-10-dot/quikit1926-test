import { toErrorMessage } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { getTenantContext } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import {
  findWorkmanById,
  updateWorkman,
  deleteWorkman,
} from "@/lib/masters/workmen-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await findWorkmanById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Workman not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!ctx.permissions.has("construction.masters.edit") && !ctx.permissions.has("*")) {
    return envelopeErr("FORBIDDEN", "Missing permission: construction.masters.edit", 403);
  }

  const body = await req.json();
  const {
    id: _a, orgId: _c, workmanCode: _b, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    ...safe
  } = body ?? {};

  try {
    const next = await updateWorkman(ctx.orgId, id, { ...safe, updatedBy: ctx.userId });
    if (!next) return NextResponse.json({ error: "Workman not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[workman.update] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to update workman"), 500);
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
  const ok = await deleteWorkman(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Workman not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
