import { NextRequest, NextResponse } from "next/server";
import { getAssets, getCategories } from "@/lib/store/asset-mgmt-store";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const categories = getCategories();
  const idx = categories.findIndex((c: any) => c.id === params.id);
  if (idx < 0) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const next = { ...categories[idx], ...body, id: categories[idx].id, updatedAt: new Date().toISOString() };
  categories[idx] = next;
  return NextResponse.json(next);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const categories = getCategories();
  const idx = categories.findIndex((c: any) => c.id === params.id);
  if (idx < 0) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  // Reject delete if any asset still references this category — UI
  // should reassign first.
  const inUse = getAssets().some((a: any) => a.categoryId === params.id);
  if (inUse) {
    return NextResponse.json(
      { error: "Category is in use by one or more assets" },
      { status: 409 },
    );
  }
  // Reject if a sub-category still points here.
  const isParent = categories.some((c: any) => c.parentId === params.id);
  if (isParent) {
    return NextResponse.json(
      { error: "Category has sub-categories — remove them first" },
      { status: 409 },
    );
  }
  categories.splice(idx, 1);
  return NextResponse.json({ success: true });
}
