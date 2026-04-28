/**
 * Repayment payments — record an inbound payment against a schedule.
 *
 *   POST /api/repayment-payments
 *
 * Updates VCRepaymentSchedule.totalPaid, marks schedule "completed" when
 * totalPaid >= totalExpected. Writes timeline event with investor visibility.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { notify } from "@/lib/notifications";
import { getVCRole, denyIfNotInRoles, CAPITAL_OPS_ROLES } from "@/lib/rbac";

const postSchema = z.object({
  scheduleId: z.string().min(1),
  amountLakhs: z.number().positive().max(10_000_000),
  paidAt: z.string().optional(), // ISO; defaults to now
  category: z.enum(["principal", "interest", "exit"]).optional(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req: NextRequest) => {
  const denied = denyIfNotInRoles(await getVCRole(userId, tenantId), CAPITAL_OPS_ROLES);
  if (denied) return denied;

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { scheduleId, amountLakhs, paidAt, category, reference, notes } = parsed.data;
  const amountPaise = BigInt(Math.round(amountLakhs * 10_000_000));

  const schedule = await db.vCRepaymentSchedule.findFirst({
    where: { id: scheduleId, tenantId },
    select: {
      id: true, dealId: true, investorId: true,
      totalExpected: true, totalPaid: true, status: true,
    },
  });
  if (!schedule) {
    return NextResponse.json({ success: false, error: "Schedule not found" }, { status: 404 });
  }

  const result = await db.$transaction(async (tx) => {
    const created = await tx.vCRepaymentPayment.create({
      data: {
        tenantId,
        scheduleId,
        investorId: schedule.investorId,
        amount: amountPaise,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        category: category ?? "principal",
        reference,
        notes,
        createdBy: userId,
      },
      select: { id: true, amount: true, paidAt: true, category: true },
    });

    const newTotal = schedule.totalPaid + amountPaise;
    const nextStatus = newTotal >= schedule.totalExpected ? "completed" : schedule.status;

    await tx.vCRepaymentSchedule.update({
      where: { id: scheduleId },
      data: { totalPaid: newTotal, status: nextStatus, updatedBy: userId },
    });

    await tx.vCTimelineEvent.create({
      data: {
        tenantId,
        dealId: schedule.dealId,
        type: "repayment-payment",
        actorId: userId,
        summary: `Repayment received: ₹${amountLakhs.toLocaleString("en-IN")}L`,
        payload: { scheduleId, amountPaise: amountPaise.toString(), category: category ?? "principal" },
        visibility: "investor",
      },
    });

    return { payment: created, scheduleStatus: nextStatus };
  });

  // Notify investor's linked user (best-effort, after txn)
  const investorUserId = (await db.vCInvestor.findUnique({
    where: { id: schedule.investorId },
    select: { userId: true },
  }))?.userId;
  if (investorUserId) {
    await notify({
      tenantId,
      userIds: [investorUserId],
      type: "repayment-payment",
      title: `Repayment received: ₹${amountLakhs.toLocaleString("en-IN")}L`,
      body: `Schedule status: ${result.scheduleStatus}`,
      href: `/repayments`,
    });
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        payment: { ...result.payment, amount: result.payment.amount.toString() },
        scheduleStatus: result.scheduleStatus,
      },
    },
    { status: 201 },
  );
});
