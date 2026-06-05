import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { parsePagination } from "@/lib/http/pagination";

/**
 * Diesel / Fuel Log Book — list + create.
 *
 * Backed by `cn_diesel_logs` (Prisma) joined to `cn_projects` +
 * `cn_machinery` so the list grid can show human names without a
 * second round-trip. The previous implementation was an in-memory
 * stub: rows disappeared on restart, the join columns rendered as
 * "—" because only raw IDs were echoed back, and `total` was
 * hardcoded to 0.
 *
 *   GET    /api/store/diesel-logs
 *          ?projectId=…    filter by project
 *          ?machineryId=…  filter by machine
 *          ?fromDate=…     filter logDate >= …
 *          ?toDate=…       filter logDate <= …
 *
 *   POST   /api/store/diesel-logs
 *          { projectId, locationId, machineryId, logDate,
 *            openingReading?, closingReading?, quantityIssued,
 *            unitRate?, operatorName?, remarks? }
 *          totalCost is derived server-side as quantityIssued * unitRate.
 */

function enrichRow(row: any): any {
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    projectName: row.project?.name ?? "",
    locationId: row.locationId,
    machineryId: row.machineryId,
    machineryName: row.machinery?.name ?? row.machinery?.code ?? "",
    logDate: row.logDate?.toISOString?.().slice(0, 10) ?? "",
    openingReading:
      row.openingReading != null ? Number(row.openingReading) : null,
    closingReading:
      row.closingReading != null ? Number(row.closingReading) : null,
    quantityIssued:
      row.quantityIssued != null ? Number(row.quantityIssued) : 0,
    unitRate: row.unitRate != null ? Number(row.unitRate) : 0,
    totalCost: row.totalCost != null ? Number(row.totalCost) : 0,
    operatorName: row.operatorName ?? "",
    remarks: row.remarks ?? "",
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireStoreAction("construction.diesel", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  const machineryId = searchParams.get("machineryId") ?? "";
  const fromDate = searchParams.get("fromDate") ?? "";
  const toDate = searchParams.get("toDate") ?? "";

  const where: Record<string, unknown> = { orgId: ctx.orgId };

  // Per-user project scoping — applied BEFORE the optional ?projectId
  // filter so a user can never use the query string to widen their scope.
  if (Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0) {
    where.projectId = { in: ctx.projectIds };
  }
  if (projectId) where.projectId = projectId;
  if (machineryId) where.machineryId = machineryId;
  if (fromDate || toDate) {
    const range: Record<string, Date> = {};
    if (fromDate) range.gte = new Date(fromDate);
    if (toDate) range.lte = new Date(toDate);
    where.logDate = range;
  }

  const p = parsePagination(req);
  const [rows, total] = await Promise.all([
    (db as any).cnDieselLog.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        machinery: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
      ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
    }),
    (db as any).cnDieselLog.count({ where }),
  ]);

  const data = rows.map(enrichRow);

  if (p.paginated) {
    return NextResponse.json({
      data,
      total,
      page: p.page,
      pageSize: p.pageSize,
      hasMore: p.skip + data.length < total,
    });
  }
  return NextResponse.json({ data, total });
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireStoreAction("construction.diesel", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.diesel", "add")) {
    return envelopeErr(
      "FORBIDDEN",
      `Action "add" not allowed for store.diesel`,
      403,
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }
  if (!body.machineryId) {
    return NextResponse.json(
      { error: "machineryId is required" },
      { status: 400 },
    );
  }
  if (!body.logDate) {
    return NextResponse.json(
      { error: "logDate is required" },
      { status: 400 },
    );
  }
  const quantityIssued = Number(body.quantityIssued);
  if (!Number.isFinite(quantityIssued) || quantityIssued <= 0) {
    return NextResponse.json(
      { error: "quantityIssued must be a positive number" },
      { status: 400 },
    );
  }

  // Verify project + machinery belong to the caller's tenant.
  const [project, machinery] = await Promise.all([
    (db as any).cnProject.findFirst({
      where: { id: body.projectId, orgId: ctx.orgId },
      select: { id: true },
    }),
    (db as any).cnMachinery.findFirst({
      where: { id: body.machineryId, orgId: ctx.orgId },
      select: { id: true },
    }),
  ]);
  if (!project) {
    return NextResponse.json(
      { error: `Project ${body.projectId} not found` },
      { status: 404 },
    );
  }
  if (!machinery) {
    return NextResponse.json(
      { error: `Machinery ${body.machineryId} not found` },
      { status: 404 },
    );
  }

  const openingReading =
    body.openingReading != null && body.openingReading !== ""
      ? Number(body.openingReading)
      : null;
  const closingReading =
    body.closingReading != null && body.closingReading !== ""
      ? Number(body.closingReading)
      : null;
  const unitRate =
    body.unitRate != null && body.unitRate !== "" ? Number(body.unitRate) : 0;

  // totalCost is always derived — keeps the column honest even when the
  // form lets the user leave Unit Rate blank.
  const totalCost = quantityIssued * unitRate;

  try {
    const created = await (db as any).cnDieselLog.create({
      data: {
        orgId: ctx.orgId,
        projectId: body.projectId,
        locationId: String(body.locationId ?? ""),
        machineryId: body.machineryId,
        logDate: new Date(body.logDate),
        openingReading,
        closingReading,
        quantityIssued: String(quantityIssued),
        unitRate: String(unitRate),
        totalCost: String(totalCost),
        operatorName: body.operatorName ?? null,
        remarks: body.remarks ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: {
        project: { select: { id: true, name: true } },
        machinery: { select: { id: true, name: true, code: true } },
      },
    });
    return NextResponse.json(enrichRow(created), { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2003") {
      return NextResponse.json(
        { error: "Referenced project or machinery does not exist." },
        { status: 400 },
      );
    }
    console.error("[diesel-log.create] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to create diesel log" },
      { status: 500 },
    );
  }
}
