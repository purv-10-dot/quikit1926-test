import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { parsePagination, parseSort, NEWEST_FIRST_TIEBREAK } from "@/lib/http/pagination";
import { createIssuance, listIssuances } from "@/lib/equipment/fixed-assets-service";
import { NextRequest, NextResponse } from "next/server";

const FA_ISSUANCE_SORT_COLUMNS = [
  "createdAt",
  "status",
  "expectedReturnDate",
] as const;

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_fixed_assets",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;

  const search = new URL(req.url).searchParams.get("search") ?? "";
  const p = parsePagination(req);
  const sort = parseSort(req, FA_ISSUANCE_SORT_COLUMNS, {
    field: "createdAt",
    order: "desc",
  }, NEWEST_FIRST_TIEBREAK);
  const result = await listIssuances({
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
  if (!body.assetId || !body.issuedTo || body.quantity == null) {
    return NextResponse.json(
      { error: "assetId, issuedTo, and quantity are required" },
      { status: 400 },
    );
  }

  try {
    const created = await createIssuance({
      orgId: ctx.orgId,
      userId: ctx.userId,
      assetId: String(body.assetId),
      issuedToType: body.issuedToType ? String(body.issuedToType) : "user",
      issuedTo: String(body.issuedTo),
      projectId: body.projectId ? String(body.projectId) : null,
      quantity: Number(body.quantity),
      returnable: body.returnable !== false,
      expectedReturnDate: body.expectedReturnDate ? String(body.expectedReturnDate) : null,
      notes: body.notes ? String(body.notes) : null,
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
      { error: toErrorMessage(err, "Failed to issue asset") },
      { status: 500 },
    );
  }
}
