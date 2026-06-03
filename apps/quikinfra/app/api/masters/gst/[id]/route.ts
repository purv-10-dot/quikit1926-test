import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findGSTCodeById,
  updateGSTCode,
  deleteGSTCode,
} from "@/lib/masters/gst-codes-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await findGSTCodeById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "GST code not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "org.gst", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for org.gst`, 403);
  }

  const body = await req.json();
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    // The form sends cgstRate/sgstRate/rate as derived display values,
    // but they're recomputed from igstRate on save. Strip them.
    rate: _r, cgstRate: _cg, sgstRate: _sg,
    ...safe
  } = body ?? {};

  try {
    const next = await updateGSTCode(ctx.orgId, id, {
      ...safe,
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "GST code not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "A GST code with this HSN/SAC already exists" },
        { status: 409 },
      );
    }
    console.error("[gst.update] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to update GST code" },
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
  if (!hasMatrixAction(ctx, "org.gst", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for org.gst`, 403);
  }
  const ok = await deleteGSTCode(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "GST code not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
