import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findItemGroupById,
  updateItemGroup,
  deleteItemGroup,
} from "@/lib/masters/item-groups-repository";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireMastersAction("construction.master_item_group", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const row = await findItemGroupById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Item group not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResp = await requireMastersAction("construction.master_item_group", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.item_group", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for master.item_group`, 403);
  }
  const body = await req.json();
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g, depth: _h,
    ...safe
  } = body ?? {};
  try {
    const next = await updateItemGroup(ctx.orgId, id, { ...safe, updatedBy: ctx.userId });
    if (!next) return NextResponse.json({ error: "Item group not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    console.error("[item-groups.update] failed:", err);
    return NextResponse.json({ error: toErrorMessage(err, "Failed to update item group") }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireMastersAction("construction.master_item_group", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.item_group", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for master.item_group`, 403);
  }
  const ok = await deleteItemGroup(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Item group not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
