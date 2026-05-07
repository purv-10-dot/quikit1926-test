import { NextRequest, NextResponse } from "next/server";
import { getAssets, getCategories, nextId } from "@/lib/store/asset-mgmt-store";

const APPROVAL_THRESHOLD = 50000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();
  const categories = getCategories();
  const catNameById = new Map(categories.map((c: any) => [c.id, c.name]));
  let data = getAssets().map((a: any) => ({
    ...a,
    categoryName: catNameById.get(a.categoryId) ?? "—",
  }));
  if (search) {
    data = data.filter(
      (a: any) =>
        String(a.assetCode ?? "").toLowerCase().includes(search) ||
        String(a.name ?? "").toLowerCase().includes(search),
    );
  }
  return NextResponse.json({ data, total: data.length });
}

export async function POST(req: NextRequest) {
  try {  
    const body = await req.json().catch(() => ({}));
    const assetCode = String(body?.assetCode ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const categoryId = String(body?.categoryId ?? "").trim();
    if (!assetCode) return NextResponse.json({ error: "Asset code is required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Asset name is required" }, { status: 400 });
    if (!categoryId) return NextResponse.json({ error: "Category is required" }, { status: 400 });
  
    const cost = Number(body?.cost);
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: "Cost must be a non-negative number" }, { status: 400 });
    }
    if (!body?.purchaseDate) {
      return NextResponse.json({ error: "Purchase date is required" }, { status: 400 });
    }
  
    const assets = getAssets();
    if (assets.some((a: any) => a.assetCode.toLowerCase() === assetCode.toLowerCase())) {
      return NextResponse.json({ error: "An asset with this code already exists" }, { status: 409 });
    }
  
    // Cost over the threshold lands in `pending_approval`; otherwise the
    // asset is immediately active.
    const requiresApproval = cost > APPROVAL_THRESHOLD;
    const status = requiresApproval ? "pending_approval" : "active";
    const now = new Date().toISOString();
    const record = {
      id: nextId("ast"),
      assetCode: assetCode.toUpperCase(),
      name,
      categoryId,
      model: String(body?.model ?? "").trim() || null,
      purchaseDate: String(body?.purchaseDate),
      cost,
      status,
      requiresApproval,
      createdAt: now,
      updatedAt: now,
    };
    assets.push(record);
    return NextResponse.json(record, { status: 201 });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[store/asset-mgmt/assets.POST] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
