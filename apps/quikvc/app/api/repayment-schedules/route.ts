/**
 * Repayment schedules — generate per (deal × investor).
 *
 *   POST /api/repayment-schedules — create a schedule for an allocation
 *   GET  /api/repayment-schedules?dealId=xxx — list schedules for a deal
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { generateEmiSchedule, rbfTarget } from "@/lib/repayment/schedule";
import { getVCRole, denyIfNotInRoles, CAPITAL_OPS_ROLES } from "@/lib/rbac";

const postSchema = z.object({
  dealId: z.string().min(1),
  investorId: z.string().min(1),
  type: z.enum(["emi", "rbf", "equity-exit"]),
  /// EMI inputs (required when type=emi)
  annualInterestPct: z.number().min(0).max(60).optional(),
  tenureMonths: z.number().int().min(1).max(360).optional(),
  startDate: z.string().optional(), // ISO; defaults to today
  /// RBF input (required when type=rbf)
  multiple: z.number().positive().max(10).optional(),
});

export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const dealId = req.nextUrl.searchParams.get("dealId");
  const investorId = req.nextUrl.searchParams.get("investorId");

  const where: Record<string, string> = { orgId };
  if (dealId) where.dealId = dealId;
  if (investorId) where.investorId = investorId;

  const schedules = await db.vCRepaymentSchedule.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      investor: { select: { id: true, name: true, type: true } },
      payments: { select: { id: true, amount: true, paidAt: true, category: true } },
    },
  });

  return NextResponse.json({
    success: true,
    data: schedules.map((s) => ({
      ...s,
      totalExpected: s.totalExpected.toString(),
      totalPaid: s.totalPaid.toString(),
      payments: s.payments.map((p) => ({ ...p, amount: p.amount.toString() })),
    })),
  });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const denied = denyIfNotInRoles(await getVCRole(userId, orgId), CAPITAL_OPS_ROLES);
  if (denied) return denied;

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { dealId, investorId, type, annualInterestPct, tenureMonths, startDate, multiple } = parsed.data;

  // Confirm allocation exists in this tenant
  const allocation = await db.vCDealAllocation.findFirst({
    where: { orgId, dealId, investorId },
    select: { id: true, amount: true },
  });
  if (!allocation) {
    return NextResponse.json(
      { success: false, error: "No allocation for this investor on this deal" },
      { status: 404 },
    );
  }

  // Reject duplicate active schedule
  const existing = await db.vCRepaymentSchedule.findFirst({
    where: { orgId, dealId, investorId, status: "active" },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: "Active schedule already exists for this allocation" },
      { status: 409 },
    );
  }

  let totalExpected = BigInt(0);
  let scheduleJson: unknown = null;

  if (type === "emi") {
    if (annualInterestPct == null || tenureMonths == null) {
      return NextResponse.json(
        { success: false, error: "annualInterestPct and tenureMonths required for EMI" },
        { status: 400 },
      );
    }
    const emi = generateEmiSchedule({
      principalPaise: allocation.amount,
      annualInterestPct,
      tenureMonths,
      startDate: startDate ? new Date(startDate) : new Date(),
    });
    totalExpected = emi.totalExpectedPaise;
    scheduleJson = emi.installments;
  } else if (type === "rbf") {
    if (multiple == null) {
      return NextResponse.json(
        { success: false, error: "multiple required for RBF" },
        { status: 400 },
      );
    }
    totalExpected = rbfTarget(allocation.amount, multiple);
  } else {
    // equity-exit: target is open-ended; track expected = principal as floor
    totalExpected = allocation.amount;
  }

  const created = await db.vCRepaymentSchedule.create({
    data: {
      orgId,
      dealId,
      investorId,
      type,
      totalExpected,
      scheduleJson: scheduleJson as never,
      status: "active",
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true, type: true, totalExpected: true, status: true },
  });

  await db.vCTimelineEvent.create({
    data: {
      orgId,
      dealId,
      type: "repayment-schedule-created",
      actorId: userId,
      summary: `Repayment schedule (${type}) created`,
      visibility: "investor",
    },
  });

  return NextResponse.json(
    {
      success: true,
      data: { ...created, totalExpected: created.totalExpected.toString() },
    },
    { status: 201 },
  );
});
