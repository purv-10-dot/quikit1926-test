import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { parsePagination } from "@/lib/http/pagination";
import { db } from "@/lib/db";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";
import {
  createEquipmentLog,
  getEquipmentLogSummary,
  listEquipmentLogs,
} from "@/lib/equipment/log-book-service";
import { NextRequest, NextResponse } from "next/server";

function mapError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  switch (msg) {
    case "EQUIPMENT_NOT_FOUND":
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    case "CLOSING_METER_REQUIRED":
      return NextResponse.json(
        { error: "Closing meter reading is required" },
        { status: 400 },
      );
    case "CLOSING_LT_OPENING":
      return NextResponse.json(
        { error: "Closing meter must be ≥ opening meter unless meter reset is checked" },
        { status: 400 },
      );
    case "DUPLICATE_LOG":
      return NextResponse.json(
        { error: "A log already exists for this machine, date and shift" },
        { status: 409 },
      );
    default:
      return NextResponse.json(
        { error: toErrorMessage(err, "Failed to create equipment log") },
        { status: 500 },
      );
  }
}

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction("construction.equipment_log", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  const equipmentId = searchParams.get("equipmentId") ?? "";
  const status = searchParams.get("status") ?? "all";
  const fromDate = searchParams.get("fromDate") ?? "";
  const toDate = searchParams.get("toDate") ?? "";
  const summaryOnly = searchParams.get("summary") === "true";

  const baseOpts = {
    orgId: ctx.orgId,
    projectId: projectId || undefined,
    equipmentId: equipmentId || undefined,
    status: status || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    projectIds:
      Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0
        ? ctx.projectIds
        : undefined,
  };

  if (summaryOnly) {
    const summary = await getEquipmentLogSummary(baseOpts);
    return NextResponse.json(summary);
  }

  const p = parsePagination(req);
  const result = await listEquipmentLogs({
    ...baseOpts,
    ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
  });

  const rows = result.data;
  const approvalIds = rows
    .map((r) => r.approvalId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const instances =
    approvalIds.length === 0
      ? []
      : await db.cnApprovalInstance.findMany({
          where: { id: { in: approvalIds }, orgId: ctx.orgId },
          include: {
            workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
          },
        });
  const instanceById = new Map(instances.map((i) => [i.id, i]));
  const actor = {
    userId: ctx.userId,
    roleKey: ctx.roleKey,
    projectIds: ctx.projectIds,
  };
  const decorated = rows.map((row) => {
    const instance = row.approvalId ? instanceById.get(row.approvalId) : null;
    return {
      ...row,
      canActOnCurrentStep: instance
        ? canActOnCurrentStep(actor, instance, row.projectId ?? null)
        : false,
    };
  });

  if (p.paginated) {
    return NextResponse.json({
      ...result,
      data: decorated,
      page: p.page,
      pageSize: p.pageSize,
      hasMore: p.skip + decorated.length < result.total,
    });
  }
  return NextResponse.json({ ...result, data: decorated });
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction("construction.equipment_log", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.log_book", "add")) {
    return envelopeErr(
      "FORBIDDEN",
      'Action "add" not allowed for equip.log_book',
      403,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.equipmentId) {
    return NextResponse.json({ error: "equipmentId is required" }, { status: 400 });
  }
  if (!body.logDate) {
    return NextResponse.json({ error: "logDate is required" }, { status: 400 });
  }

  try {
    const created = await createEquipmentLog({
      orgId: ctx.orgId,
      userId: ctx.userId,
      equipmentId: String(body.equipmentId),
      projectId: body.projectId ? String(body.projectId) : null,
      logDate: String(body.logDate),
      shift: body.shift ? String(body.shift) : "Day",
      openingMeter:
        body.openingMeter != null && body.openingMeter !== ""
          ? Number(body.openingMeter)
          : null,
      closingMeter:
        body.closingMeter != null && body.closingMeter !== ""
          ? Number(body.closingMeter)
          : null,
      meterReset: body.meterReset === true,
      idleHours:
        body.idleHours != null && body.idleHours !== ""
          ? Number(body.idleHours)
          : 0,
      breakdownHours:
        body.breakdownHours != null && body.breakdownHours !== ""
          ? Number(body.breakdownHours)
          : 0,
      dieselIssued:
        body.dieselIssued != null && body.dieselIssued !== ""
          ? Number(body.dieselIssued)
          : 0,
      operatorName: body.operatorName ? String(body.operatorName) : null,
      productivityQty:
        body.productivityQty != null && body.productivityQty !== ""
          ? Number(body.productivityQty)
          : null,
      outputUom: body.outputUom ? String(body.outputUom) : null,
      remarks: body.remarks ? String(body.remarks) : null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}
