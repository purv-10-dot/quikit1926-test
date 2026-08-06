import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { parsePagination, parseSort, NEWEST_FIRST_TIEBREAK } from "@/lib/http/pagination";
import {
  createHireRate,
  getHireRentSummary,
  listHireRates,
} from "@/lib/equipment/hire-rent-service";
import { NextRequest, NextResponse } from "next/server";

const HIRE_RATE_SORT_COLUMNS = [
  "createdAt",
  "rate",
  "effectiveFrom",
  "direction",
] as const;

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_hire_rent",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;

  const { searchParams } = new URL(req.url);
  const summaryOnly = searchParams.get("summary") === "true";
  const direction = searchParams.get("direction") ?? undefined;
  const search = searchParams.get("search") ?? "";

  if (summaryOnly) {
    const summary = await getHireRentSummary({ orgId: ctxOrResp.orgId });
    return NextResponse.json(summary);
  }

  const p = parsePagination(req);
  const sort = parseSort(req, HIRE_RATE_SORT_COLUMNS, {
    field: "createdAt",
    order: "desc",
  }, NEWEST_FIRST_TIEBREAK);
  const result = await listHireRates({
    orgId: ctxOrResp.orgId,
    direction,
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
    "construction.equipment_hire_rent",
    "create",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.hire_rent", "add")) {
    return envelopeErr(
      "FORBIDDEN",
      'Action "add" not allowed for equip.hire_rent',
      403,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.direction) {
    return NextResponse.json({ error: "direction is required" }, { status: 400 });
  }
  if (body.rate == null || Number(body.rate) <= 0) {
    return NextResponse.json({ error: "rate must be greater than 0" }, { status: 400 });
  }

  try {
    const created = await createHireRate({
      orgId: ctx.orgId,
      userId: ctx.userId,
      direction: String(body.direction) as "hire_in" | "rent_out",
      rateBasis: body.rateBasis ? (String(body.rateBasis) as "hour" | "day" | "month") : "hour",
      equipmentId: body.equipmentId ? String(body.equipmentId) : null,
      equipmentType: body.equipmentType ? String(body.equipmentType) : null,
      vendorId: body.vendorId ? String(body.vendorId) : null,
      customerId: body.customerId ? String(body.customerId) : null,
      rate: Number(body.rate),
      sacCode: body.sacCode ? String(body.sacCode) : null,
      gstPercent: body.gstPercent != null ? Number(body.gstPercent) : 18,
      minGuaranteedQty:
        body.minGuaranteedQty != null ? Number(body.minGuaranteedQty) : null,
      effectiveFrom: body.effectiveFrom ? String(body.effectiveFrom) : null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to create hire rate") },
      { status: 500 },
    );
  }
}
