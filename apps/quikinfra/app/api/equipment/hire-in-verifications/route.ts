import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  createHireInVerification,
  listHireInVerifications,
} from "@/lib/equipment/hire-rent-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_hire_rent",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;

  const result = await listHireInVerifications({ orgId: ctxOrResp.orgId });
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

  if (
    !body.equipmentId ||
    !body.projectId ||
    !body.periodFrom ||
    !body.periodTo ||
    body.rate == null
  ) {
    return NextResponse.json(
      { error: "equipmentId, projectId, periodFrom, periodTo, and rate are required" },
      { status: 400 },
    );
  }

  try {
    const created = await createHireInVerification({
      orgId: ctx.orgId,
      userId: ctx.userId,
      equipmentId: String(body.equipmentId),
      vendorId: body.vendorId ? String(body.vendorId) : null,
      projectId: String(body.projectId),
      periodFrom: String(body.periodFrom),
      periodTo: String(body.periodTo),
      rate: Number(body.rate),
      rateBasis: body.rateBasis ? (String(body.rateBasis) as "hour" | "day" | "month") : "hour",
      vendorClaimedQty:
        body.vendorClaimedQty != null ? Number(body.vendorClaimedQty) : null,
      minGuaranteedQty:
        body.minGuaranteedQty != null ? Number(body.minGuaranteedQty) : null,
      gstPercent: body.gstPercent != null ? Number(body.gstPercent) : 18,
      compute: body.compute !== false,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "EQUIPMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }
    if (msg === "INVALID_PERIOD") {
      return NextResponse.json({ error: "Period To must be on or after Period From" }, { status: 400 });
    }
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to create verification") },
      { status: 500 },
    );
  }
}
