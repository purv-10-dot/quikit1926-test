import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { generateDocNumber } from "@/lib/db/doc-number";
import { BOQError, boqService } from "@/lib/boq";
import { computeRABill } from "@/lib/rab/compute";
import { parsePagination, parseSort, NEWEST_FIRST_TIEBREAK } from "@/lib/http/pagination";

const round2 = (n: number): number => Number(n.toFixed(2));
const round4 = (n: number): number => Number(n.toFixed(4));

/**
 * RAB (Running Account Bill) — list + create.
 *
 * Now Postgres-backed (was globalThis.__qcRABs in memory). Header lives
 * on `cn_running_account_bills`; per-line BOQ billing detail lives on
 * `cn_rab_lines` and is populated by a richer flow when the form is
 * extended to capture per-BOQ-item billing. Today's create UI captures
 * only the header (project, contractor, period, current-bill amount),
 * so this route persists the header and leaves lines empty.
 *
 * The schema requires `woId` (FK to cn_work_orders). The current form
 * sends `woRef` (a free-text WO number) or nothing. We resolve woId via:
 *   1. body.woId (explicit FK)
 *   2. body.woRef → look up cn_work_orders.woNumber for this project
 *   3. fall back to the most recent WO for this project + contractor
 * If none of those yield a WO, we return a clear 400 — RAB requires a WO.
 */

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.rab", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const search = (searchParams.get("search") ?? "").trim();

  const where: Record<string, unknown> = {
    orgId: ctx.orgId,
  };
  if (status && status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { rabNumber: { contains: search, mode: "insensitive" } },
      { project: { is: { name: { contains: search, mode: "insensitive" } } } },
      { contractor: { is: { name: { contains: search, mode: "insensitive" } } } },
    ];
  }

  // Per-user project scope (assigned site users) takes precedence over the
  // optional ?projectId query — a user can never use the query string to
  // see a project they're not assigned to.
  if (ctx.projectIds !== undefined) {
    if (projectId) {
      where.projectId = ctx.projectIds.includes(projectId) ? projectId : "__none__";
    } else {
      where.projectId = { in: ctx.projectIds };
    }
  } else if (projectId) {
    where.projectId = projectId;
  }

  const p = parsePagination(req);
  const sort = parseSort(
    searchParams,
    [
      "rabNumber",
      "status",
      "netPayable",
      "currentBillAmount",
      "cumulativeAmount",
      "billPeriodTo",
      "createdAt",
    ],
    { field: "createdAt", order: "desc" },
    NEWEST_FIRST_TIEBREAK,
  );
  const [rows, total] = await Promise.all([
    db.cnRunningAccountBill.findMany({
      where,
      orderBy: sort.orderBy,
      include: {
        project: { select: { name: true } },
        contractor: { select: { name: true } },
      },
      ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
    }),
    db.cnRunningAccountBill.count({ where }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    rabNumber: r.rabNumber,
    projectId: r.projectId,
    projectName: r.project?.name ?? "",
    contractorId: r.contractorId,
    contractorName: r.contractor?.name ?? "",
    woId: r.woId,
    billPeriodFrom: r.billPeriodFrom?.toISOString().slice(0, 10) ?? "",
    billPeriodTo: r.billPeriodTo?.toISOString().slice(0, 10) ?? "",
    previousBillAmount: r.previousBillAmount?.toString() ?? "0",
    currentBillAmount: r.currentBillAmount?.toString() ?? "0",
    cumulativeAmount: r.cumulativeAmount?.toString() ?? "0",
    netPayable: r.netPayable?.toString() ?? "0",
    status: r.status,
    createdAt: r.createdAt?.toISOString() ?? "",
    updatedAt: r.updatedAt?.toISOString() ?? "",
  }));

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
  try {
    const ctxOrResp = await requireProjectsFinanceAction("construction.rab", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
    if (!hasMatrixAction(ctx, "pm.dpr", "add")) {
      return envelopeErr("FORBIDDEN", `Action "add" not allowed for pm.dpr`, 403);
    }

    const body = await req.json();

    if (!body.projectId) {
      return NextResponse.json({ error: "Project is required" }, { status: 400 });
    }
    if (!body.contractorId) {
      return NextResponse.json({ error: "Contractor is required" }, { status: 400 });
    }
    if (!body.billPeriodFrom || !body.billPeriodTo) {
      return NextResponse.json(
        { error: "Bill period (from + to) is required" },
        { status: 400 },
      );
    }

    // ── Resolve woId — required by schema ──────────────────────────
    let woId: string | null = null;
    if (body.woId) {
      woId = String(body.woId);
    } else if (body.woRef) {
      const wo = await db.cnWorkOrder.findFirst({
        where: {
          orgId: ctx.orgId,
          woNumber: String(body.woRef).trim(),
          projectId: body.projectId,
        },
        select: { id: true },
      });
      if (!wo) {
        return NextResponse.json(
          { error: `Work order "${body.woRef}" not found for this project.` },
          { status: 400 },
        );
      }
      woId = wo.id;
    } else {
      const wo = await db.cnWorkOrder.findFirst({
        where: {
          orgId: ctx.orgId,
          projectId: body.projectId,
          contractorId: body.contractorId,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!wo) {
        return NextResponse.json(
          {
            error:
              "No work order exists for this project and contractor. Create the WO first, then generate a RAB against it.",
          },
          { status: 400 },
        );
      }
      woId = wo.id;
    }

    // ── Build + validate bill lines (authoritative, server-side) ───
    // The clamp never trusts client-sent balances: executed, billed and
    // rate all come from the BOQ leaves; woLineId comes from the work
    // order. A line over its un-billed balance is rejected. No ledger is
    // touched here — billedQty only moves on final approval (Phase 5).
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    const lineCreates: Prisma.CnRABLineCreateWithoutRabInput[] = [];
    let gross = 0;

    if (rawLines.length) {
      const leaves = await boqService.getLeafItems(ctx, body.projectId);
      const leafById = new Map(leaves.map((l) => [l.id, l] as const));

      const woLines = await db.cnWorkOrderLine.findMany({
        where: { woId },
        select: { id: true, boqItemId: true, uomCode: true },
      });
      // FREE_SCOPE WO lines have a null boqItemId and cannot be matched to a
      // BOQ leaf, so they never enter the lookup.
      const woLineByItem = new Map<string, (typeof woLines)[number]>();
      for (const w of woLines) {
        if (w.boqItemId) woLineByItem.set(w.boqItemId, w);
      }

      const errors: string[] = [];
      for (const l of rawLines) {
        const boqItemId = String(l.boqItemId ?? "");
        const leaf = leafById.get(boqItemId);
        if (!leaf) {
          errors.push(`BOQ item ${boqItemId || "(missing)"} not found in this project.`);
          continue;
        }
        // woLine may be absent — the executed work can be self-work or a BOQ
        // item outside the WO scope. woLineId is a plain string column (not a
        // FK), so we leave it empty in that case rather than blocking the bill.
        const woLine = woLineByItem.get(boqItemId);

        const executed = round4(leaf.done_qty ?? 0);
        const billed = round4(leaf.billed_qty ?? 0);
        const remaining = round4(executed - billed);
        const currentQty = round4(Number(l.currentQty ?? l.billQty ?? 0));
        if (currentQty <= 0) continue; // skip empty lines
        if (currentQty > remaining) {
          errors.push(
            `${leaf.boq_no}: qty ${currentQty} exceeds billable balance ${remaining}.`,
          );
          continue;
        }

        const rate = Number(leaf.rate ?? 0);
        const previousQty = billed;
        const cumulativeQty = round4(previousQty + currentQty);
        const totalQty = executed;
        const currentAmount = round2(currentQty * rate);
        const previousAmount = round2(previousQty * rate);
        const cumulativeAmount = round2(cumulativeQty * rate);
        gross = round2(gross + currentAmount);

        lineCreates.push({
          boqItemId,
          woLineId: woLine?.id ?? "",
          description: String(
            l.description ?? leaf.display_name ?? leaf.description ?? "",
          ),
          uomId: String(l.uomId ?? woLine?.uomCode ?? leaf.unit ?? ""),
          totalQty,
          previousQty,
          currentQty,
          cumulativeQty,
          rate,
          previousAmount,
          currentAmount,
          cumulativeAmount,
        });
      }

      if (errors.length) {
        return NextResponse.json(
          { error: "Some lines could not be billed", details: errors },
          { status: 400 },
        );
      }
      if (!lineCreates.length) {
        return NextResponse.json(
          { error: "No billable lines — every line was zero or fully billed." },
          { status: 400 },
        );
      }
    } else {
      // Legacy header-only path (current simple drawer): gross is the typed
      // current bill amount; no per-BOQ lines are persisted.
      gross = round2(Number(body.currentBillAmount ?? 0));
    }

    // ── Deduction / GST waterfall — the one shared money path ──────
    const computed = computeRABill({
      gross,
      retentionPercent: body.retentionPercent,
      tdsRate: body.tdsRate,
      cgstRate: body.cgstRate,
      sgstRate: body.sgstRate,
      igstRate: body.igstRate,
      mobilisationRecovery: body.mobilisationRecovery,
      liquidatedDamages: body.liquidatedDamages,
      labourCess: body.labourCess,
      otherDeductions: body.otherDeductions,
    });

    if (computed.gross <= 0) {
      return NextResponse.json(
        { error: "Bill amount must be greater than zero." },
        { status: 400 },
      );
    }

    // Prior approved RABs against the same WO form the running total.
    // Computed live (not cached) so concurrency stays correct.
    const priorAgg = await db.cnRunningAccountBill.aggregate({
      where: { orgId: ctx.orgId, woId, status: "approved" },
      _sum: { currentBillAmount: true },
    });
    const previousBillAmount = round2(
      Number(priorAgg._sum.currentBillAmount?.toString() ?? "0"),
    );
    const currentBillAmount = computed.gross;
    const cumulativeAmount = round2(previousBillAmount + currentBillAmount);

    const allowedBillTypes = ["ra_bill", "final_bill", "deviation_bill"];
    const billType = allowedBillTypes.includes(body.billType)
      ? body.billType
      : "ra_bill";

    const rabNumber = await generateDocNumber("rab", ctx.orgId);

    const created = await db.cnRunningAccountBill.create({
      data: {
        orgId: ctx.orgId,
        rabNumber,
        projectId: body.projectId,
        contractorId: body.contractorId,
        woId: woId!,
        billType,
        billPeriodFrom: new Date(body.billPeriodFrom),
        billPeriodTo: new Date(body.billPeriodTo),
        previousBillAmount,
        currentBillAmount,
        cumulativeAmount,
        grossBillAmount: computed.gross,
        retentionPercent: computed.retentionPercent,
        retentionAmount: computed.retentionAmount,
        tdsRate: computed.tdsRate,
        tdsAmount: computed.tdsAmount,
        cgstRate: computed.cgstRate,
        cgstAmount: computed.cgstAmount,
        sgstRate: computed.sgstRate,
        sgstAmount: computed.sgstAmount,
        igstRate: computed.igstRate,
        igstAmount: computed.igstAmount,
        mobilisationRecovery: computed.mobilisationRecovery,
        liquidatedDamages: computed.liquidatedDamages,
        labourCess: computed.labourCess,
        otherDeductions: computed.otherDeductions,
        netPayable: computed.netPayable,
        // Phase 4 creates a DRAFT only — submit is a separate transition.
        status: "draft",
        paymentStatus: "unpaid",
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
        ...(lineCreates.length ? { lines: { create: lineCreates } } : {}),
      },
      include: {
        project: { select: { name: true } },
        contractor: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        rabNumber: created.rabNumber,
        projectId: created.projectId,
        projectName: created.project?.name ?? "",
        contractorId: created.contractorId,
        contractorName: created.contractor?.name ?? "",
        woId: created.woId,
        billType: created.billType,
        billPeriodFrom: created.billPeriodFrom.toISOString().slice(0, 10),
        billPeriodTo: created.billPeriodTo.toISOString().slice(0, 10),
        previousBillAmount: created.previousBillAmount.toString(),
        currentBillAmount: created.currentBillAmount.toString(),
        cumulativeAmount: created.cumulativeAmount.toString(),
        grossBillAmount: created.grossBillAmount.toString(),
        retentionAmount: created.retentionAmount?.toString() ?? "0",
        tdsAmount: created.tdsAmount?.toString() ?? "0",
        cgstAmount: created.cgstAmount?.toString() ?? "0",
        sgstAmount: created.sgstAmount?.toString() ?? "0",
        igstAmount: created.igstAmount?.toString() ?? "0",
        netPayable: created.netPayable.toString(),
        lineCount: created._count?.lines ?? lineCreates.length,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus },
      );
    }
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "A RAB with this number already exists." },
        { status: 409 },
      );
    }
    if (getErrorCode(err) === "P2003") {
      return NextResponse.json(
        { error: "Referenced project / contractor / work order does not exist." },
        { status: 400 },
      );
    }
    console.error("[rab.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err) ?? "Failed to create RAB" },
      { status: 500 },
    );
  }
}
