import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  createStockTransfer,
  listStockTransfers,
  countStockTransfers,
  countStockTransfersForDate,
  type StockTransferLine,
  type StockTransferAssetLine,
} from "@/lib/store/stock-transfer-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";

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
  const ctxOrResp = await requireStoreAction("construction.transfer", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

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
    (paging) => listStockTransfers(ctx.orgId, { ...baseOpts, ...paging }),
    () => countStockTransfers(ctx.orgId, baseOpts),
  );

  // Per-row Approve/Reject visibility — driven by the workflow's current
  // step, not the caller's role. Batch-load every pending instance + its
  // workflow.steps in one round-trip and decorate each row.
  const rows = Array.isArray(result.data) ? result.data : [];
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
  const instanceById = new Map(
    instances.map((i): [string, (typeof instances)[number]] => [i.id, i]),
  );
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
        ? canActOnCurrentStep(
            actor,
            instance,
            row.sourceProjectId ?? row.projectId ?? null,
          )
        : false,
    };
  });

  return NextResponse.json({ ...result, data: decorated });
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireStoreAction("construction.transfer", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.transfer", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for store.transfer`, 403);
  }

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
  const sourceProject = await db.cnProject.findFirst({
    where: {
      id: body.sourceProjectId,
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
    const destProject = await db.cnProject.findFirst({
      where: {
        id: body.destinationProjectId,
        orgId: ctx.orgId,
      },
      select: { id: true, name: true },
    });
    destinationProjectName = destProject?.name ?? null;
  }

  const fromLoc = await db.cnLocation.findFirst({
    where: { id: body.fromLocationId, orgId: ctx.orgId },
    select: { id: true, name: true, state: true, city: true },
  });
  const toLoc = await db.cnLocation.findFirst({
    where: { id: body.toLocationId, orgId: ctx.orgId },
    select: { id: true, name: true, state: true, city: true },
  });

  const transferDateStr: string =
    body.transferDate ?? new Date().toISOString().slice(0, 10);
  const todaysCount = await countStockTransfersForDate(
    ctx.orgId,
    transferDateStr,
  );
  const compactDate = transferDateStr.replace(/-/g, "");
  const seq = String(todaysCount + 1).padStart(4, "0");
  const transferNumber =
    body.transferNumber ?? `ST-${compactDate}-${seq}`;

  const lines: StockTransferLine[] = Array.isArray(body.lines) ? body.lines : [];
  const assetLines: StockTransferAssetLine[] = Array.isArray(body.assetLines) ? body.assetLines : [];

  const record = await createStockTransfer({
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
    assetLines,
    status: body.status ?? "draft",
  });

  return NextResponse.json(record, { status: 201 });
}
