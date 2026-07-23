import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { parsePagination, parseSort } from "@/lib/http/pagination";
import { createTransfer, listTransfers } from "@/lib/equipment/fixed-assets-service";
import { NextRequest, NextResponse } from "next/server";

const FA_TRANSFER_SORT_COLUMNS = [
  "transferDate",
  "createdAt",
  "status",
] as const;

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_fixed_assets",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;

  const search = new URL(req.url).searchParams.get("search") ?? "";
  const p = parsePagination(req);
  const sort = parseSort(req, FA_TRANSFER_SORT_COLUMNS, {
    field: "transferDate",
    order: "desc",
  });
  const result = await listTransfers({
    orgId: ctxOrResp.orgId,
    search: search || undefined,
    orderBy: sort.orderBy as never,
    ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
  });
  if (p.paginated) {
    return NextResponse.json({
      ...result,
      page: p.page,
      pageSize: p.pageSize,
      hasMore: p.skip + result.data.length < result.total,
    });
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_fixed_assets",
    "create",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.fixed_assets", "add")) {
    return envelopeErr("FORBIDDEN", 'Action "add" not allowed for equip.fixed_assets', 403);
  }

  const body = await req.json().catch(() => ({}));
  if (!body.assetId || !body.destinationProjectId || !body.transferDate || body.quantity == null) {
    return NextResponse.json(
      { error: "assetId, destinationProjectId, transferDate, and quantity are required" },
      { status: 400 },
    );
  }

  try {
    const created = await createTransfer({
      orgId: ctx.orgId,
      userId: ctx.userId,
      assetId: String(body.assetId),
      destinationProjectId: String(body.destinationProjectId),
      destinationLocation: body.destinationLocation ? String(body.destinationLocation) : null,
      quantity: Number(body.quantity),
      transferDate: String(body.transferDate),
      reason: body.reason ? String(body.reason) : null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "INSUFFICIENT_QTY") {
      return NextResponse.json({ error: "Insufficient available quantity" }, { status: 409 });
    }
    if (msg === "ASSET_NOT_FOUND") {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to create transfer") },
      { status: 500 },
    );
  }
}
