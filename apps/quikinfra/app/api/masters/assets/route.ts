import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { listAssets, countAssets, createAsset } from "@/lib/masters/assets-repository";
import { parsePagination, paginateDb, parseSort, NEWEST_FIRST_TIEBREAK } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.master_asset", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const baseOpts = {
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    search,
  };
  const { orderBy } = parseSort(
    searchParams,
    ["assetCode", "name", "category", "condition", "status", "purchaseDate", "purchaseValue", "createdAt"],
    { field: "createdAt", order: "desc" },
    NEWEST_FIRST_TIEBREAK,
  );
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listAssets({ ...baseOpts, ...paging, orderBy }),
    () => countAssets(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.master_asset", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.asset", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for master.asset`, 403);
  }
  const body = await req.json();
  if (!body?.assetCode || !String(body.assetCode).trim()) {
    return NextResponse.json({ error: "Asset code is required" }, { status: 400 });
  }
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Asset name is required" }, { status: 400 });
  }
  try {
    const record = await createAsset({
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
      currentStock: body.currentStock,
      minStockLevel: body.minStockLevel,
      reorderLevel: body.reorderLevel,
      status: body.status ?? "In Use",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json({ error: "An asset with this code already exists" }, { status: 409 });
    }
    console.error("[assets.create] failed:", err);
    return NextResponse.json({ error: toErrorMessage(err, "Failed to create asset") }, { status: 500 });
  }
}
