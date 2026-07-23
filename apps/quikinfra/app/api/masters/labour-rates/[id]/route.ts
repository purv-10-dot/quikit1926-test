import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { getTenantContext } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import {
  findLabourRateById,
  updateLabourRate,
  deleteLabourRate,
} from "@/lib/masters/labour-rates-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await findLabourRateById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Labour rate not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!ctx.permissions.has("construction.masters.edit") && !ctx.permissions.has("*")) {
    return envelopeErr("FORBIDDEN", "Missing permission: construction.masters.edit", 403);
  }

  const body = await req.json();
  try {
    const next = await updateLabourRate(ctx.orgId, id, {
      updatedBy: ctx.userId,
      rate: body.rate,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo,
    });
    if (!next) return NextResponse.json({ error: "Labour rate not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[labour-rate.update] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to update labour rate"), 500);
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
  try {
    const ok = await deleteLabourRate(ctx.orgId, params.id, ctx.userId);
    if (!ok) return NextResponse.json({ error: "Labour rate not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[labour-rate.delete] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to delete labour rate"), 500);
  }
}
