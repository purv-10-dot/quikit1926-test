import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findItemById,
  updateItem,
  deleteItem,
} from "@/lib/masters/items-repository";

/**
 * GET    /api/masters/items/:id — fetch one item, tenant-scoped.
 * PUT    /api/masters/items/:id — full update (also handles soft-delete
 *                                  by passing `status: "inactive"`).
 * PATCH  /api/masters/items/:id — alias of PUT.
 * DELETE /api/masters/items/:id — soft delete via status flip.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const row = await findItemById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "master.item", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for master.item`, 403);
  }

  const body = await req.json();
  // Strip audit-owned fields so the client can't overwrite them.
  const {
    id: _a,
    orgId: _c,
    createdAt: _d,
    createdBy: _e,
    updatedAt: _f,
    updatedBy: _g,
    ...safe
  } = body ?? {};

  try {
    const next = await updateItem(ctx.orgId, id, {
      ...safe,
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: `An item with code "${safe.code}" already exists` },
        { status: 409 },
      );
    }
    console.error("[items.update] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to update item" },
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
  if (!hasMatrixAction(ctx, "master.item", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for master.item`, 403);
  }
  const ok = await deleteItem(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
