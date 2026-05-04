/**
 * POST /api/allocations — allocate capital from an investor's commitment to a deal.
 *
 * Validates the investor has enough committed-but-undeployed capital.
 * Updates VCDeal.allocatedAmount + writes timeline event.
 *
 * Sprint 4: simple immediate allocation. Sprint 4b adds capital-call
 * lifecycle (allocation → call issued → payment → disbursed).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { notify } from "@/lib/notifications";
import { CAPITAL_OPS_ROLES, requireRoleOrAudit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const postSchema = z.object({
  dealId: z.string().min(1),
  investorId: z.string().min(1),
  /// Amount in lakhs (UI-friendly), converted to paise
  amountLakhs: z.number().int().positive().max(10_000_000),
});

export const POST = withTenantAuth(async ({ orgId, userId }, req: NextRequest) => {
  const denied = await requireRoleOrAudit(userId, orgId, CAPITAL_OPS_ROLES, {
    action: "allocation.create",
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
  const { dealId, investorId, amountLakhs } = parsed.data;
  const amountPaise = BigInt(amountLakhs) * BigInt(10_000_000);

  // Verify deal + investor in tenant
  const [deal, investor] = await Promise.all([
    db.vCDeal.findFirst({ where: { id: dealId, orgId }, select: { id: true } }),
    db.vCInvestor.findFirst({
      where: { id: investorId, orgId },
      include: {
        commitments: { select: { totalAmount: true } },
        allocations: { select: { amount: true } },
      },
    }),
  ]);
  if (!deal) {
    return NextResponse.json({ success: false, error: "Deal not found" }, { status: 404 });
  }
  if (!investor) {
    return NextResponse.json({ success: false, error: "Investor not found" }, { status: 404 });
  }

  // Check investor has enough available (committed - already allocated)
  const committed = investor.commitments.reduce((s, c) => s + c.totalAmount, BigInt(0));
  const allocated = investor.allocations.reduce((s, a) => s + a.amount, BigInt(0));
  const available = committed - allocated;
  if (amountPaise > available) {
    return NextResponse.json(
      {
        success: false,
        error: `Investor has only ₹${Number(available / BigInt(10_000_000))}L available (committed ₹${Number(committed / BigInt(10_000_000))}L, already allocated ₹${Number(allocated / BigInt(10_000_000))}L)`,
      },
      { status: 409 },
    );
  }

  // Persist allocation + denormalize on the deal
  const allocation = await db.$transaction(async (tx) => {
    const created = await tx.vCDealAllocation.upsert({
      where: { dealId_investorId: { dealId, investorId } },
      update: { amount: amountPaise, status: "confirmed", updatedBy: userId },
      create: {
        orgId,
        dealId,
        investorId,
        amount: amountPaise,
        status: "confirmed",
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true, amount: true, status: true },
    });

    // Recompute deal-level total
    const all = await tx.vCDealAllocation.findMany({
      where: { dealId },
      select: { amount: true },
    });
    const total = all.reduce((s, a) => s + a.amount, BigInt(0));
    await tx.vCDeal.update({
      where: { id: dealId },
      data: { allocatedAmount: total, updatedBy: userId },
    });

    await tx.vCTimelineEvent.create({
      data: {
        orgId,
        dealId,
        type: "capital-allocated",
        actorId: userId,
        summary: `Allocated ₹${amountLakhs}L from ${investor.name}`,
        payload: { investorId, amountPaise: amountPaise.toString() },
        visibility: "investor",
      },
    });

    return created;
  });

  // Audit success
  await audit({
    orgId,
    userId,
    action: "allocation.create",
    resource: dealId,
    metadata: { investorId, amountLakhs },
    req,
  });

  // Notify investor's linked user (if any)
  const investorUserId = (await db.vCInvestor.findUnique({
    where: { id: investorId },
    select: { userId: true },
  }))?.userId;
  if (investorUserId) {
    await notify({
      orgId,
      userIds: [investorUserId],
      type: "allocation",
      title: `₹${amountLakhs}L allocated to a deal`,
      body: `Capital from your commitment was allocated.`,
      href: `/dashboard`,
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      ...allocation,
      amount: allocation.amount.toString(),
    },
  }, { status: 201 });
});
