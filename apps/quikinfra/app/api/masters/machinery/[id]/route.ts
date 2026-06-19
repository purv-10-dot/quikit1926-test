import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findMachineryById,
  updateMachinery,
  deleteMachinery,
} from "@/lib/masters/machinery-repository";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const row = await findMachineryById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Machinery not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResp = await requireMastersAction("edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.machinery", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for master.machinery`, 403);
  }
  const body = await req.json();
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    ...safe
  } = body ?? {};
  try {
    const next = await updateMachinery(ctx.orgId, id, { ...safe, updatedBy: ctx.userId });
    if (!next) return NextResponse.json({ error: "Machinery not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json({ error: "Machinery with this code already exists" }, { status: 409 });
    }
    console.error("[machinery.update] failed:", err);
    return NextResponse.json({ error: toErrorMessage(err, "Failed to update machinery") }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireMastersAction("delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.machinery", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for master.machinery`, 403);
  }
  const ok = await deleteMachinery(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Machinery not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
