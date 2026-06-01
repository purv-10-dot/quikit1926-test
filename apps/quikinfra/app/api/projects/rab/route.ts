import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { generateDocNumber } from "@/lib/db/doc-number";
import { BOQError } from "@/lib/boq";
import { parsePagination } from "@/lib/http/pagination";

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

  const where: Record<string, unknown> = {
    orgId: ctx.orgId,
  };
  if (status && status !== "all") where.status = status;

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
  const rows = await (db as any).cnRunningAccountBill.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { name: true } },
      contractor: { select: { name: true } },
    },
    ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
  });

  const data = rows.map((r: any) => ({
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
      const wo = await (db as any).cnWorkOrder.findFirst({
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
      const wo = await (db as any).cnWorkOrder.findFirst({
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

    // ── Compute previous / cumulative / net amounts ────────────────
    // Prior approved RABs against the same WO contribute to the running
    // total. Stays correct even when previous RABs span different
    // billing periods.
    const priorAgg = await (db as any).cnRunningAccountBill.aggregate({
      where: {
        orgId: ctx.orgId,
        woId,
        status: "approved",
      },
      _sum: { currentBillAmount: true },
    });
    const previousBillAmount = Number(
      priorAgg._sum.currentBillAmount?.toString() ?? "0",
    );
    const currentBillAmount = Number(body.currentBillAmount ?? 0);
    const cumulativeAmount = previousBillAmount + currentBillAmount;
    // No retention/deductions form fields yet — net = current.
    const netPayable = currentBillAmount;

    const rabNumber = await generateDocNumber("rab", ctx.orgId);
    const requestedStatus = body.status === "submitted" ? "submitted" : "draft";

    const created = await (db as any).cnRunningAccountBill.create({
      data: {
        orgId: ctx.orgId,
        rabNumber,
        projectId: body.projectId,
        contractorId: body.contractorId,
        woId: woId!,
        billPeriodFrom: new Date(body.billPeriodFrom),
        billPeriodTo: new Date(body.billPeriodTo),
        previousBillAmount,
        currentBillAmount,
        cumulativeAmount,
        netPayable,
        status: requestedStatus,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: {
        project: { select: { name: true } },
        contractor: { select: { name: true } },
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
        billPeriodFrom: created.billPeriodFrom.toISOString().slice(0, 10),
        billPeriodTo: created.billPeriodTo.toISOString().slice(0, 10),
        previousBillAmount: created.previousBillAmount.toString(),
        currentBillAmount: created.currentBillAmount.toString(),
        cumulativeAmount: created.cumulativeAmount.toString(),
        netPayable: created.netPayable.toString(),
        status: created.status,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err: any) {
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus },
      );
    }
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "A RAB with this number already exists." },
        { status: 409 },
      );
    }
    if (err?.code === "P2003") {
      return NextResponse.json(
        { error: "Referenced project / contractor / work order does not exist." },
        { status: 400 },
      );
    }
    console.error("[rab.create] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to create RAB" },
      { status: 500 },
    );
  }
}
