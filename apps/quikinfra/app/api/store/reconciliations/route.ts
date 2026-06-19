import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { generateDocNumber } from "@/lib/db/doc-number";
import { parsePagination } from "@/lib/http/pagination";

/**
 * Stock Reconciliation — list + create.
 *
 * Persists to `cn_stock_reconciliations` + `cn_stock_reconciliation_lines`.
 * The earlier stub stored rows in a request-scoped JS array, so creates
 * never reached Postgres and the approval flow had nothing to act on.
 *
 * Form contract (see app/(dashboard)/store/reconciliation/page.tsx):
 *   { projectId, locationId, reconciliationDate, conductedBy (text),
 *     lines: [{ itemId, systemQty, physicalQty, varianceReason }] }
 *
 * Schema requires `conductedById` (user FK). The form posts a free-text
 * "Conducted By" name; we store the calling user's id as the FK and
 * leave the text on the line-item remarks if useful elsewhere later.
 *
 * Each line needs `uomId` (REQUIRED). We look up each item's uom in
 * one batched query before insert.
 */

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireStoreAction("construction.reconciliation", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const projectId = searchParams.get("projectId") ?? "";

  const where: Record<string, unknown> = {
    orgId: ctx.orgId,
  };
  if (status && status !== "all") where.status = status;
  if (projectId) where.projectId = projectId;
  // Per-user project scoping
  if (Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0) {
    where.projectId = projectId
      ? ctx.projectIds.includes(projectId)
        ? projectId
        : "__none__"
      : { in: ctx.projectIds };
  }

  const p = parsePagination(req);
  const rows = await db.cnStockReconciliation.findMany({
    where,
    orderBy: { reconciliationDate: "desc" },
    select: {
      id: true,
      reconciliationNumber: true,
      projectId: true,
      locationId: true,
      reconciliationDate: true,
      conductedById: true,
      approvedById: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { name: true } },
      _count: { select: { lines: true } },
    },
    ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
  });

  // Resolve location names in one batched lookup so the table can show
  // the location label without joining cn_locations on every row.
  const locationIds = Array.from(
    new Set(
      rows.map((r) => r.locationId).filter((v: unknown): v is string => !!v),
    ),
  ) as string[];
  const locById = new Map<string, string>();
  if (locationIds.length) {
    const locs = await db.cnLocation.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, name: true },
    });
    for (const l of locs) locById.set(l.id, l.name);
  }

  const data = rows.map((r) => ({
    id: r.id,
    reconciliationNumber: r.reconciliationNumber,
    projectId: r.projectId,
    projectName: r.project?.name ?? "",
    locationId: r.locationId,
    locationName: locById.get(r.locationId) ?? "",
    reconciliationDate: r.reconciliationDate?.toISOString().slice(0, 10) ?? "",
    conductedById: r.conductedById,
    approvedById: r.approvedById,
    status: r.status,
    lineCount: r._count?.lines ?? 0,
    createdAt: r.createdAt?.toISOString() ?? "",
    updatedAt: r.updatedAt?.toISOString() ?? "",
  }));

  if (p.paginated) {
    return NextResponse.json({
      data,
      total: data.length,
      page: p.page,
      pageSize: p.pageSize,
      hasMore: data.length === p.pageSize,
    });
  }
  return NextResponse.json({ data, total: data.length });
}

export async function POST(req: NextRequest) {
  try {
    const ctxOrResp = await requireStoreAction("construction.reconciliation", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
    if (!hasMatrixAction(ctx, "store.recon", "add")) {
      return envelopeErr("FORBIDDEN", `Action "add" not allowed for store.recon`, 403);
    }

    const body = await req.json();
    if (!body.projectId) {
      return NextResponse.json({ error: "Project is required" }, { status: 400 });
    }
    if (!body.locationId) {
      return NextResponse.json({ error: "Location is required" }, { status: 400 });
    }
    if (!body.reconciliationDate) {
      return NextResponse.json(
        { error: "Reconciliation date is required" },
        { status: 400 },
      );
    }

    type ReconInputLine = {
      itemId?: string | null;
      systemQty?: number | string | null;
      physicalQty?: number | string | null;
      varianceReason?: string | null;
      reason?: string | null;
    };
    const inputLines: ReconInputLine[] = Array.isArray(body.lines)
      ? body.lines
      : [];

    // Batch-resolve every itemId → uomId so we don't hit Prisma per-line.
    const itemIds = Array.from(
      new Set(
        inputLines
          .map((l) => l?.itemId)
          .filter((v: unknown): v is string => typeof v === "string" && v.length > 0),
      ),
    );
    const uomByItemId = new Map<string, string>();
    if (itemIds.length) {
      const items = await db.cnItem.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, uomId: true },
      });
      for (const it of items) uomByItemId.set(it.id, it.uomId);
    }

    const reconciliationNumber = await generateDocNumber(
      "reconciliation",
      ctx.orgId,
    );

    const linesData = inputLines
      .filter((l): l is ReconInputLine & { itemId: string } => Boolean(l?.itemId))
      .map((l) => {
        const systemQty = Number(l.systemQty ?? 0);
        const physicalQty = Number(l.physicalQty ?? 0);
        return {
          itemId: l.itemId,
          systemQty,
          physicalQty,
          varianceQty: physicalQty - systemQty,
          uomId: uomByItemId.get(l.itemId) ?? "",
          reason: l.varianceReason ?? l.reason ?? null,
        };
      })
      .filter((l) => l.uomId); // drop lines whose item lookup failed

    const created = await db.cnStockReconciliation.create({
      data: {
        orgId: ctx.orgId,
        reconciliationNumber,
        projectId: body.projectId,
        locationId: body.locationId,
        reconciliationDate: new Date(body.reconciliationDate),
        conductedById: ctx.userId,
        status: body.status === "submitted" ? "submitted" : "draft",
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
        lines: linesData.length ? { create: linesData } : undefined,
      },
      include: {
        project: { select: { name: true } },
        lines: true,
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        reconciliationNumber: created.reconciliationNumber,
        projectId: created.projectId,
        projectName: created.project?.name ?? "",
        locationId: created.locationId,
        reconciliationDate: created.reconciliationDate.toISOString().slice(0, 10),
        conductedById: created.conductedById,
        status: created.status,
        lineCount: created.lines.length,
        createdAt: created.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "A reconciliation with this number already exists." },
        { status: 409 },
      );
    }
    if (getErrorCode(err) === "P2003") {
      return NextResponse.json(
        { error: "Referenced project, location, or item does not exist." },
        { status: 400 },
      );
    }
    console.error("[reconciliation.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to create reconciliation") },
      { status: 500 },
    );
  }
}
