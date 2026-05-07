import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";
import {
  createStockTransfer,
  listStockTransfers,
  countStockTransfers,
  countStockTransfersForDate,
} from "@/lib/store/stock-transfer-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

/**
 * Stock Transfer (Inter-Site) API — Postgres-backed via the repository.
 *
 * GET  /api/store/transfers
 *      ?status=…    filter (draft | pending_approval | approved | rejected |
 *                   dispatched | in_transit | received | cancelled)
 *      ?projectId=… filter by source project
 *      ?search=…    substring match on transferNumber / from / to / reason
 *
 * POST /api/store/transfers
 *      Auto-assigns `transferNumber` like ST-<YYYYMMDD>-<seq> per tenant
 *      per day. Denormalises project / location names so the list grid
 *      renders without a join, matching the shape the legacy demo-store
 *      writer produced.
 */

export async function GET(req: NextRequest) {
  try {  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
  
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "";
    const projectId = searchParams.get("projectId") ?? "";
    const search = searchParams.get("search") ?? "";
  
    const baseOpts = {
      status: status || null,
      projectId: projectId || null,
      search: search || null,
      allowedProjectIds: ctx.projectIds ?? null,
    };
  
    // Push LIMIT/OFFSET + COUNT down into the raw SQL query.
    const result = await paginateDb(
      parsePagination(req),
      (paging) => listStockTransfers(ctx.tenantId, { ...baseOpts, ...paging }),
      () => countStockTransfers(ctx.tenantId, baseOpts),
    );
    return NextResponse.json(result);

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[store/transfers.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();

  if (!body.sourceProjectId) {
    return NextResponse.json(
      { error: "sourceProjectId is required" },
      { status: 400 },
    );
  }
  if (!body.fromLocationId) {
    return NextResponse.json(
      { error: "fromLocationId is required" },
      { status: 400 },
    );
  }
  if (!body.toLocationId) {
    return NextResponse.json(
      { error: "toLocationId is required" },
      { status: 400 },
    );
  }

  // Denormalise project + location names so the list grid renders them
  // directly. The form only sends IDs; resolving here means older
  // clients don't need to know how to pass them along.
  const sourceProject: any = await (db as any).cnProject.findFirst({
    where: {
      id: body.sourceProjectId,
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
    },
    select: { id: true, name: true },
  });
  if (!sourceProject) {
    return NextResponse.json(
      { error: `Source project ${body.sourceProjectId} not found` },
      { status: 404 },
    );
  }

  let destinationProjectName: string | null = null;
  if (body.destinationProjectId) {
    const destProject: any = await (db as any).cnProject.findFirst({
      where: {
        id: body.destinationProjectId,
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
      },
      select: { id: true, name: true },
    });
    destinationProjectName = destProject?.name ?? null;
  }

  const fromLoc: any = await (db as any).cnLocation.findFirst({
    where: { id: body.fromLocationId, tenantId: ctx.tenantId, orgId: ctx.orgId },
    select: { id: true, name: true, state: true, city: true },
  });
  const toLoc: any = await (db as any).cnLocation.findFirst({
    where: { id: body.toLocationId, tenantId: ctx.tenantId, orgId: ctx.orgId },
    select: { id: true, name: true, state: true, city: true },
  });

  const transferDateStr: string =
    body.transferDate ?? new Date().toISOString().slice(0, 10);
  const todaysCount = await countStockTransfersForDate(
    ctx.tenantId,
    transferDateStr,
  );
  const compactDate = transferDateStr.replace(/-/g, "");
  const seq = String(todaysCount + 1).padStart(4, "0");
  const transferNumber =
    body.transferNumber ?? `ST-${compactDate}-${seq}`;

  const lines: any[] = Array.isArray(body.lines) ? body.lines : [];

  const record = await createStockTransfer({
    tenantId: ctx.tenantId,
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    transferNumber,
    transferType: body.transferType ?? "intra_site",
    transferReason: body.transferReason ?? null,
    transferDate: new Date(transferDateStr),
    sourceProjectId: sourceProject.id,
    sourceProjectName: sourceProject.name,
    destinationProjectId: body.destinationProjectId ?? null,
    destinationProjectName,
    fromLocationId: fromLoc?.id ?? body.fromLocationId,
    fromLocationName: fromLoc?.name ?? null,
    fromState: body.fromState ?? fromLoc?.state ?? null,
    fromCity: body.fromCity ?? fromLoc?.city ?? null,
    toLocationId: toLoc?.id ?? body.toLocationId,
    toLocationName: toLoc?.name ?? null,
    toState: body.toState ?? toLoc?.state ?? null,
    toCity: body.toCity ?? toLoc?.city ?? null,
    vehicleNo: body.vehicleNo ?? null,
    dispatchDateTime: body.dispatchDateTime
      ? new Date(body.dispatchDateTime)
      : null,
    estTransitDays: body.estTransitDays ?? null,
    transactionAmount: body.transactionAmount ?? null,
    interstateTransfer:
      body.interstateTransfer === true || body.interstateTransfer === "true",
    chargeableTransfer:
      body.chargeableTransfer === true || body.chargeableTransfer === "true",
    ewayBillNo: body.ewayBillNo ?? null,
    remarks: body.remarks ?? null,
    initiatedById: ctx.userId,
    lines,
    status: body.status ?? "draft",
  });

  return NextResponse.json(record, { status: 201 });
}
