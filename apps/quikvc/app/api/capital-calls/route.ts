/**
 * Capital calls — issue a call against an investor (optionally tied to an allocation).
 *
 *   GET  /api/capital-calls?dealId=xxx     — list calls related to a deal (joined via allocationId)
 *   GET  /api/capital-calls?investorId=xxx — list calls for an investor
 *   POST /api/capital-calls                — issue new call
 *
 * Status lifecycle: issued → partial → paid (or overdue → defaulted).
 * `paidAmount` is denormalized: kept in sync by /api/capital-calls/[id]/payments.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { CAPITAL_OPS_ROLES, requireRoleOrAudit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

const postSchema = z.object({
  investorId: z.string().min(1),
  /// Either link to an allocation (recommended) OR free-issue tied to a deal
  allocationId: z.string().min(1).optional(),
  /// Required to know which deal this call relates to (for timeline events)
  dealId: z.string().min(1),
  amountLakhs: z.number().int().positive().max(10_000_000),
  /// ISO date string for the due date
  dueDate: z.string(),
  notes: z.string().max(2000).optional(),
});

export const GET = withTenantAuth(async ({ orgId }, req: NextRequest) => {
  const dealId = req.nextUrl.searchParams.get("dealId");
  const investorId = req.nextUrl.searchParams.get("investorId");

  // For dealId queries, join through allocations
  const where: Record<string, unknown> = { orgId };
  if (investorId) where.investorId = investorId;
  if (dealId) {
    const allocations = await db.vCDealAllocation.findMany({
      where: { orgId, dealId },
      select: { id: true },
    });
    where.allocationId = { in: allocations.map((a) => a.id) };
  }

  const calls = await db.vCCapitalCall.findMany({
    where,
    orderBy: { dueDate: "desc" },
    include: {
      investor: { select: { id: true, name: true, type: true } },
      payments: { select: { id: true, amount: true, paidAt: true, reference: true }, orderBy: { paidAt: "desc" } },
    },
  });

  return NextResponse.json({
    success: true,
    data: calls.map((c) => ({
      ...c,
      amount: c.amount.toString(),
      paidAmount: c.paidAmount.toString(),
      payments: c.payments.map((p) => ({ ...p, amount: p.amount.toString() })),
    })),
  });
});

export const POST = withTenantAuth(async ({ orgId, userId }, req: NextRequest) => {
  const denied = await requireRoleOrAudit(userId, orgId, CAPITAL_OPS_ROLES, {
    action: "allocation.create", // Reuse existing audit action — capital call is the issuance side
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
  const { investorId, allocationId, dealId, amountLakhs, dueDate, notes } = parsed.data;
  const amountPaise = BigInt(amountLakhs) * BigInt(10_000_000);

  // Validate investor + allocation belong to this tenant
  const [investor, allocation] = await Promise.all([
    db.vCInvestor.findFirst({
      where: { id: investorId, orgId },
      select: { id: true, name: true, userId: true },
    }),
    allocationId
      ? db.vCDealAllocation.findFirst({
          where: { id: allocationId, orgId, investorId, dealId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!investor) {
    return NextResponse.json({ success: false, error: "Investor not found" }, { status: 404 });
  }
  if (allocationId && !allocation) {
    return NextResponse.json(
      { success: false, error: "Allocation not found for this investor + deal" },
      { status: 404 },
    );
  }

  const created = await db.vCCapitalCall.create({
    data: {
      orgId,
      investorId,
      allocationId: allocationId ?? null,
      amount: amountPaise,
      dueDate: new Date(dueDate),
      status: "issued",
      paidAmount: BigInt(0),
      notes,
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true, amount: true, dueDate: true, status: true },
  });

  await audit({
    orgId,
    userId,
    action: "allocation.create",
    resource: created.id,
    metadata: { investorId, dealId, amountLakhs, kind: "capital-call" },
    req,
  });

  await db.vCTimelineEvent.create({
    data: {
      orgId,
      dealId,
      type: "capital-call-issued",
      actorId: userId,
      summary: `Capital call ₹${amountLakhs.toLocaleString("en-IN")}L issued to ${investor.name}`,
      payload: { capitalCallId: created.id, investorId, amountPaise: amountPaise.toString() },
      visibility: "investor",
    },
  });

  if (investor.userId) {
    await notify({
      orgId,
      userIds: [investor.userId],
      type: "allocation",
      title: `Capital call: ₹${amountLakhs.toLocaleString("en-IN")}L`,
      body: `Due ${new Date(dueDate).toLocaleDateString("en-IN")}.`,
      href: "/repayments",
    });
  }

  return NextResponse.json(
    { success: true, data: { ...created, amount: created.amount.toString() } },
    { status: 201 },
  );
});
