import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { parsePagination } from "@/lib/http/pagination";
import {
  createJobCard,
  getJobCardSummary,
  listJobCards,
} from "@/lib/equipment/maintenance-service";
import { NextRequest, NextResponse } from "next/server";

function mapError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  switch (msg) {
    case "EQUIPMENT_NOT_FOUND":
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    default:
      return NextResponse.json(
        { error: toErrorMessage(err, "Failed to create job card") },
        { status: 500 },
      );
  }
}

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_maintenance",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  const equipmentId = searchParams.get("equipmentId") ?? "";
  const status = searchParams.get("status") ?? "all";
  const summaryOnly = searchParams.get("summary") === "true";

  const baseOpts = {
    orgId: ctx.orgId,
    projectId: projectId || undefined,
    equipmentId: equipmentId || undefined,
    status: status || undefined,
    projectIds:
      Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0
        ? ctx.projectIds
        : undefined,
  };

  if (summaryOnly) {
    const summary = await getJobCardSummary(baseOpts);
    return NextResponse.json(summary);
  }

  const p = parsePagination(req);
  const result = await listJobCards({
    ...baseOpts,
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
    "construction.equipment_maintenance",
    "create",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.maintenance", "add")) {
    return envelopeErr(
      "FORBIDDEN",
      'Action "add" not allowed for equip.maintenance',
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
  if (!body.serviceDate) {
    return NextResponse.json({ error: "serviceDate is required" }, { status: 400 });
  }

  const spares = Array.isArray(body.spares)
    ? (body.spares as Array<Record<string, unknown>>).map((s) => ({
        description: String(s.description ?? ""),
        qty: Number(s.qty) || 0,
        rate: Number(s.rate) || 0,
      }))
    : [];

  try {
    const created = await createJobCard({
      orgId: ctx.orgId,
      userId: ctx.userId,
      equipmentId: String(body.equipmentId),
      projectId: body.projectId ? String(body.projectId) : null,
      jobType: (body.jobType as "breakdown" | "preventive") ?? "breakdown",
      serviceDate: String(body.serviceDate),
      meterAtService:
        body.meterAtService != null && body.meterAtService !== ""
          ? Number(body.meterAtService)
          : null,
      downtimeHours:
        body.downtimeHours != null && body.downtimeHours !== ""
          ? Number(body.downtimeHours)
          : 0,
      reportedProblem: body.reportedProblem
        ? String(body.reportedProblem)
        : null,
      labourCost: Number(body.labourCost) || 0,
      serviceCost: Number(body.serviceCost) || 0,
      spares,
      remarks: body.remarks ? String(body.remarks) : null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}
