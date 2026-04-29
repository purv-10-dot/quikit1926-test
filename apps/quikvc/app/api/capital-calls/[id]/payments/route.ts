/**
 * Record a payment against a capital call.
 *
 *   POST /api/capital-calls/[id]/payments
 *
 * Updates VCCapitalCall.paidAmount + flips status to:
 *   - "paid"    when paidAmount >= amount
 *   - "partial" when 0 < paidAmount < amount
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { CAPITAL_OPS_ROLES, requireRoleOrAudit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const postSchema = z.object({
  amountLakhs: z.number().positive().max(10_000_000),
  paidAt: z.string().optional(), // ISO; defaults to now
  reference: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
});

export const POST = withTenantAuth(
  async ({ tenantId, userId }, req: NextRequest, { params }: { params: { id: string } }) => {
    const denied = await requireRoleOrAudit(userId, tenantId, CAPITAL_OPS_ROLES, {
      action: "allocation.create",
      resource: params.id,
      req,
    });
    if (denied) return denied;

    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { amountLakhs, paidAt, reference, notes } = parsed.data;
    const amountPaise = BigInt(Math.round(amountLakhs * 10_000_000));

    const call = await db.vCCapitalCall.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true, amount: true, paidAmount: true, status: true, allocationId: true, investorId: true },
    });
    if (!call) {
      return NextResponse.json({ success: false, error: "Capital call not found" }, { status: 404 });
    }

    const result = await db.$transaction(async (tx) => {
      const payment = await tx.vCCapitalCallPayment.create({
        data: {
          tenantId,
          capitalCallId: call.id,
          amount: amountPaise,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          reference,
          notes,
          createdBy: userId,
        },
        select: { id: true, amount: true, paidAt: true },
      });

      const newPaid = call.paidAmount + amountPaise;
      const status = newPaid >= call.amount ? "paid" : newPaid > BigInt(0) ? "partial" : call.status;
      const paidAtFinal = status === "paid" ? new Date() : null;

      await tx.vCCapitalCall.update({
        where: { id: call.id },
        data: { paidAmount: newPaid, status, ...(paidAtFinal ? { paidAt: paidAtFinal } : {}), updatedBy: userId },
      });

      return { payment, status };
    });

    await audit({
      tenantId,
      userId,
      action: "allocation.create",
      resource: call.id,
      metadata: { kind: "capital-call-payment", amountLakhs, status: result.status },
      req,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          payment: { ...result.payment, amount: result.payment.amount.toString() },
          callStatus: result.status,
        },
      },
      { status: 201 },
    );
  },
);
