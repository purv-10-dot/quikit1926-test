import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { getAssets, getCategories, nextId } from "@/lib/store/asset-mgmt-store";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";

const APPROVAL_THRESHOLD = 50000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();
  const categories = getCategories();
  const catNameById = new Map(categories.map((c) => [c.id, c.name]));
  let data = getAssets().map((a) => ({
    ...a,
    categoryName: catNameById.get(a.categoryId) ?? "—",
  }));
  if (search) {
    data = data.filter(
      (a) =>
        String(a.assetCode ?? "").toLowerCase().includes(search) ||
        String(a.name ?? "").toLowerCase().includes(search),
    );
  }
  return NextResponse.json({ data, total: data.length });
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireStoreAction("construction.stock", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.asset_mgmt", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for store.asset_mgmt`, 403);
  }
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
  if (assets.some((a) => a.assetCode.toLowerCase() === assetCode.toLowerCase())) {
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
}
