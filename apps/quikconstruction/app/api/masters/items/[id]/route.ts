import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
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
  const row = await findItemById(ctx.tenantId, params.id);
  if (!row) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();
  // Strip audit-owned fields so the client can't overwrite them.
  const {
    id: _a,
    tenantId: _b,
    orgId: _c,
    createdAt: _d,
    createdBy: _e,
    updatedAt: _f,
    updatedBy: _g,
    ...safe
  } = body ?? {};

  try {
    const next = await updateItem(ctx.tenantId, ctx.orgId, id, {
      ...safe,
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: `An item with code "${safe.code}" already exists` },
        { status: 409 },
      );
    }
    console.error("[items.update] failed:", err);
    return NextResponse.json(
      { error: e?.message ?? "Failed to update item" },
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
  const ok = await deleteItem(ctx.tenantId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
