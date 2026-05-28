import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findTDSCodeById,
  updateTDSCode,
  deleteTDSCode,
} from "@/lib/masters/tds-codes-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const row = await findTDSCodeById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "TDS code not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "org.tds", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for org.tds`, 403);
  }

  const body = await req.json();
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    ...safe
  } = body ?? {};

  try {
    const next = await updateTDSCode(ctx.orgId, id, {
      ...safe,
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "TDS code not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: any) {
    console.error("[tds.update] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to update TDS code" },
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
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "org.tds", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for org.tds`, 403);
  }
  const ok = await deleteTDSCode(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "TDS code not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
