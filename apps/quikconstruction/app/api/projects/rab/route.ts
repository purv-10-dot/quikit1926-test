import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { rabCreateSchema } from "@/lib/schemas/projects-4b";

const withTenantAuth = withTenantAuthForModule("projects");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  const list = await db.cnRAB.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null, ...(projectId ? { projectId } : {}) },
    include: {
      project: { select: { id: true, name: true, code: true } },
      boq: { select: { id: true, boqNumber: true } },
      _count: { select: { lines: true } },
    },
    orderBy: [{ projectId: "asc" }, { billSeqNo: "desc" }],
  });
  return NextResponse.json({ success: true, data: list });
});

/**
 * POST /api/projects/rab — create a Running Account Bill.
 *
 * For each line:
 *   1. Verify boqItem belongs to the referenced BOQ + tenant
 *   2. Sum `currentPeriodQty` across APPROVED+DRAFT+SUBMITTED prior RABs for this boqItem
 *      → that's `priorCumulativeQty`
 *   3. `currentPeriodQty = cumulativeQtyDone - priorCumulativeQty`
 *      Reject if negative (user is billing LESS than already billed)
 *   4. rate copied from the BOQ item at submit time
 *   5. currentPeriodAmount = currentPeriodQty × rate
 *
 * billSeqNo auto-allocated as (max prior on project) + 1.
 */
export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = rabCreateSchema.parse(body);

  const [project, boq] = await Promise.all([
    db.cnProject.findFirst({ where: { id: input.projectId, orgId }, select: { id: true } }),
    db.cnBOQ.findFirst({ where: { id: input.boqId, orgId, projectId: input.projectId }, include: { items: true } }),
  ]);
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });
  if (!boq) return NextResponse.json({ success: false, error: "BOQ not found for this project" }, { status: 400 });
  if (boq.status !== "locked") {
    return NextResponse.json({ success: false, error: "Source BOQ must be locked before billing against it" }, { status: 400 });
  }

  const dup = await db.cnRAB.findFirst({ where: { orgId, rabNumber: input.rabNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `RAB '${input.rabNumber}' already exists` }, { status: 409 });

  // Allocate billSeqNo
  const lastSeq = await db.cnRAB.aggregate({
    where: { projectId: input.projectId, orgId, deletedAt: null },
    _max: { billSeqNo: true },
  });
  const billSeqNo = (lastSeq._max.billSeqNo ?? 0) + 1;

  // Validate each line + compute prior cumulative
  const boqItemMap = new Map(boq.items.map((i) => [i.id, i]));
  const errors: string[] = [];
  const prepared: Array<{
    boqItemId: string; cumulativeQtyDone: number; priorCumulativeQty: number;
    currentPeriodQty: number; rate: number; currentPeriodAmount: number;
    gstRate: number | null; taxAmount: number; remarks: string | null;
  }> = [];

  for (const l of input.lines) {
    const boqItem = boqItemMap.get(l.boqItemId);
    if (!boqItem) { errors.push(`BOQ item ${l.boqItemId} is not on this BOQ`); continue; }
    if (boqItem.kind !== "item") { errors.push(`Cannot bill against a group header (${boqItem.description})`); continue; }

    // Sum prior RAB lines for this boqItem on same project (excluding rejected)
    const priorAgg = await db.cnRABLine.aggregate({
      where: {
        boqItemId: l.boqItemId,
        rab: { orgId, projectId: input.projectId, status: { in: ["draft", "submitted", "approved", "paid"] } },
      },
      _sum: { currentPeriodQty: true },
    });
    const priorCumulativeQty = Number(priorAgg._sum.currentPeriodQty ?? 0);
    const currentPeriodQty = l.cumulativeQtyDone - priorCumulativeQty;
    if (currentPeriodQty < 0) {
      errors.push(`Line for "${boqItem.description}": cumulative (${l.cumulativeQtyDone}) is less than already-billed (${priorCumulativeQty})`);
      continue;
    }
    const orderedQty = Number(boqItem.quantity ?? 0);
    if (orderedQty > 0 && l.cumulativeQtyDone > orderedQty) {
      errors.push(`Line for "${boqItem.description}": cumulative (${l.cumulativeQtyDone}) exceeds BOQ qty (${orderedQty})`);
      continue;
    }
    const rate = Number(boqItem.rate ?? 0);
    const currentPeriodAmount = currentPeriodQty * rate;
    const gstRate = l.gstRate ?? (boqItem.gstRate != null ? Number(boqItem.gstRate) : null);
    const taxAmount = gstRate ? currentPeriodAmount * (gstRate / 100) : 0;
    prepared.push({
      boqItemId: l.boqItemId,
      cumulativeQtyDone: l.cumulativeQtyDone,
      priorCumulativeQty,
      currentPeriodQty,
      rate,
      currentPeriodAmount,
      gstRate,
      taxAmount,
      remarks: l.remarks ?? null,
    });
  }
  if (errors.length) {
    return NextResponse.json({ success: false, error: errors.join("; ") }, { status: 400 });
  }

  const currentBillAmount = prepared.reduce((s, p) => s + p.currentPeriodAmount, 0);
  const taxTotal = prepared.reduce((s, p) => s + p.taxAmount, 0);
  const priorBilledAmount = 0; // simplified; full rollup from all prior RAB totals would be better
  const priorAmountAgg = await db.cnRAB.aggregate({
    where: { orgId, projectId: input.projectId, deletedAt: null, status: { in: ["approved", "paid"] } },
    _sum: { currentBillAmount: true },
  });
  const prior = Number(priorAmountAgg._sum.currentBillAmount ?? 0);

  const rab = await db.cnRAB.create({
    data: {
      orgId,
      projectId: input.projectId,
      boqId: input.boqId,
      rabNumber: input.rabNumber,
      rabDate: new Date(input.rabDate),
      billedTillDate: new Date(input.billedTillDate),
      billSeqNo,
      priorBilledAmount: prior,
      currentBillAmount,
      subtotal: currentBillAmount,
      taxAmount: taxTotal,
      total: currentBillAmount + taxTotal,
      status: "draft",
      remarks: input.remarks,
      createdBy: userId,
      lines: { create: prepared },
    },
    include: { lines: true },
  });
  return NextResponse.json({ success: true, data: rab }, { status: 201 });
});
