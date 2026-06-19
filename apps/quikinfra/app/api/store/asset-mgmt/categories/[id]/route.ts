import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { getAssets, getCategories } from "@/lib/store/asset-mgmt-store";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireStoreAction("construction.stock", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.asset_mgmt", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.asset_mgmt`, 403);
  }
  const categories = getCategories();
  const idx = categories.findIndex((c) => c.id === params.id);
  if (idx < 0) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const next = { ...categories[idx], ...body, id: categories[idx].id, updatedAt: new Date().toISOString() };
  categories[idx] = next;
  return NextResponse.json(next);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireStoreAction("construction.stock", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.asset_mgmt", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for store.asset_mgmt`, 403);
  }
  const categories = getCategories();
  const idx = categories.findIndex((c) => c.id === params.id);
  if (idx < 0) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  // Reject delete if any asset still references this category — UI
  // should reassign first.
  const inUse = getAssets().some((a) => a.categoryId === params.id);
  if (inUse) {
    return NextResponse.json(
      { error: "Category is in use by one or more assets" },
      { status: 409 },
    );
  }
  // Reject if a sub-category still points here.
  const isParent = categories.some((c) => c.parentId === params.id);
  if (isParent) {
    return NextResponse.json(
      { error: "Category has sub-categories — remove them first" },
      { status: 409 },
    );
  }
  categories.splice(idx, 1);
  return NextResponse.json({ success: true });
}
