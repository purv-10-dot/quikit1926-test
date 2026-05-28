import { NextRequest, NextResponse } from "next/server";
import { getCategories, nextId } from "@/lib/store/asset-mgmt-store";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";

export async function GET() {
  const categories = getCategories();
  const byId = new Map(categories.map((c: any) => [c.id, c.name]));
  const data = categories.map((c: any) => ({
    ...c,
    parentName: c.parentId ? byId.get(c.parentId) ?? "—" : null,
  }));
  return NextResponse.json({ data, total: data.length });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "store.asset_mgmt", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for store.asset_mgmt`, 403);
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  const categories = getCategories();
  if (categories.some((c: any) => c.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
  }
  const parentId = body?.parentId ? String(body.parentId) : null;
  if (parentId && !categories.some((c: any) => c.id === parentId)) {
    return NextResponse.json({ error: "Parent category not found" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const record = {
    id: nextId("cat"),
    name,
    parentId,
    active: body?.active === false ? false : true,
    createdAt: now,
    updatedAt: now,
  };
  categories.push(record);
  return NextResponse.json(record, { status: 201 });
}
