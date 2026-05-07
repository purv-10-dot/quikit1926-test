import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { listAssets, countAssets, createAsset } from "@/lib/masters/assets-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  try {  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const baseOpts = {
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      search,
    };
    const result = await paginateDb(
      parsePagination(req),
      (paging) => listAssets({ ...baseOpts, ...paging }),
      () => countAssets(baseOpts),
    );
    return NextResponse.json(result);

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[masters/assets.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body = await req.json();
  if (!body?.assetCode || !String(body.assetCode).trim()) {
    return NextResponse.json({ error: "Asset code is required" }, { status: 400 });
  }
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Asset name is required" }, { status: 400 });
  }
  try {
    const record = await createAsset({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      assetCode: body.assetCode,
      name: body.name,
      category: body.category,
      projectId: body.projectId,
      condition: body.condition,
      currentLocation: body.currentLocation,
      purchaseDate: body.purchaseDate,
      purchaseValue: body.purchaseValue,
      status: body.status ?? "In Use",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "An asset with this code already exists" }, { status: 409 });
    }
    console.error("[assets.create] failed:", err);
    return NextResponse.json({ error: e?.message ?? "Failed to create asset" }, { status: 500 });
  }
}
