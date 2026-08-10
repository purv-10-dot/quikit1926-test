import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { generateDocNumber } from "@/lib/db/doc-number";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { parsePagination, parseSort, NEWEST_FIRST_TIEBREAK } from "@/lib/http/pagination";

/**
 * Stock Reconciliation — list + create.
 *
 * Persists to `cn_stock_reconciliations`; lines live inline in the JSONB
 * `materials` column (single-table pattern, same as issues/transfers).
 * The earlier stub stored rows in a request-scoped JS array, so creates
 * never reached Postgres and the approval flow had nothing to act on.
 *
 * Form contract (see app/(dashboard)/store/reconciliation/page.tsx):
 *   { projectId, locationId, reconciliationDate, conductedBy (text),
 *     lines: [{ itemId, systemQty, physicalQty, varianceReason }] }
 *
 * `conductedById` is always the calling user (the FK the approval flow and
 * audit trail read). The free-text "Conducted By" name the form posts is
 * stored separately in `conductedByName` — the person who ran the physical
 * count is often not a system user.
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

  if (searchParams.get("counts") === "1") {
    const countsWhere = { ...where };
    delete countsWhere.status;
    const groups = await db.cnStockReconciliation.groupBy({
      by: ["status"],
      where: countsWhere,
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const g of groups) counts[String(g.status)] = g._count._all;
    return NextResponse.json({ counts });
  }

  const { orderBy } = parseSort(
    searchParams,
    ["reconciliationNumber", "reconciliationDate", "status", "createdAt"],
    { field: "reconciliationDate", order: "desc" },
    NEWEST_FIRST_TIEBREAK,
  );
  const p = parsePagination(req);
  const rows = await db.cnStockReconciliation.findMany({
    where,
    orderBy,
    select: {
      id: true,
      reconciliationNumber: true,
      projectId: true,
      locationId: true,
      reconciliationDate: true,
      conductedById: true,
      conductedByName: true,
      approvedById: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      lineCount: true,
      project: { select: { name: true } },
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

  // Rows created before `conductedByName` existed carry only the FK, so fall
  // back to that user's display name rather than showing an empty column.
  const conductorIds = Array.from(
    new Set(
      rows
        .filter((r) => !r.conductedByName)
        .map((r) => r.conductedById)
        .filter((v: unknown): v is string => !!v),
    ),
  );
  const conductorNameById = conductorIds.length
    ? await resolveUserNames(conductorIds)
    : new Map<string, string>();

  const data = rows.map((r) => ({
    id: r.id,
    reconciliationNumber: r.reconciliationNumber,
    projectId: r.projectId,
    projectName: r.project?.name ?? "",
    locationId: r.locationId,
    locationName: locById.get(r.locationId) ?? "",
    reconciliationDate: r.reconciliationDate?.toISOString().slice(0, 10) ?? "",
    conductedById: r.conductedById,
    conductedByName:
      r.conductedByName ??
      (r.conductedById ? conductorNameById.get(r.conductedById) ?? "" : ""),
    approvedById: r.approvedById,
    status: r.status,
    lineCount: r.lineCount ?? 0,
    createdAt: r.createdAt?.toISOString() ?? "",
    updatedAt: r.updatedAt?.toISOString() ?? "",
  }));

  if (p.paginated) {
    const total = await db.cnStockReconciliation.count({ where });
    return NextResponse.json({
      data,
      total,
      page: p.page,
      pageSize: p.pageSize,
      hasMore: p.skip + data.length < total,
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
          reason: l.varianceReason ?? l.reason ?? "",
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
        conductedByName: String(body.conductedBy ?? "").trim() || null,
        status: body.status === "submitted" ? "submitted" : "draft",
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
        lineCount: linesData.length,
        materials: linesData,
      },
      include: {
        project: { select: { name: true } },
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
        conductedByName: created.conductedByName,
        status: created.status,
        lineCount: created.lineCount,
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
