/**
 * SA-B.3 — List invoices for a tenant + create one manually.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";

export const GET = withSuperAdminAuth<{ tenantId: string }>(async (auth, _req: NextRequest, { params }) => {
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: params.tenantId },
      select: { id: true, name: true, plan: true },
    });
    if (!tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

    const invoices = await db.invoice.findMany({
      where: { tenantId: params.tenantId },
      orderBy: { periodStart: "desc" },
      take: 24, // last 24 months
    });

    const totals = invoices.reduce(
      (acc, inv) => {
        acc.total += inv.amountCents;
        if (inv.status === "paid") acc.paid += inv.amountCents;
        else if (inv.status === "failed") acc.failed += inv.amountCents;
        else if (inv.status === "pending") acc.pending += inv.amountCents;
        return acc;
      },
      { total: 0, paid: 0, failed: 0, pending: 0 },
    );

    return NextResponse.json({
      success: true,
      data: {
        tenant,
        invoices: invoices.map((inv) => ({
          ...inv,
          amountDollars: (inv.amountCents / 100).toFixed(2),
          periodStart: inv.periodStart.toISOString(),
          periodEnd: inv.periodEnd.toISOString(),
          paidAt: inv.paidAt?.toISOString() ?? null,
          failedAt: inv.failedAt?.toISOString() ?? null,
          createdAt: inv.createdAt.toISOString(),
          updatedAt: inv.updatedAt.toISOString(),
        })),
        totals: {
          ...totals,
          totalDollars: (totals.total / 100).toFixed(2),
          paidDollars: (totals.paid / 100).toFixed(2),
          failedDollars: (totals.failed / 100).toFixed(2),
          pendingDollars: (totals.pending / 100).toFixed(2),
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load invoices";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/** Manually generate an invoice for a tenant (e.g. to backfill a period). */
export const POST = withSuperAdminAuth<{ tenantId: string }>(async (auth, req: NextRequest, { params }) => {
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: params.tenantId },
      select: { id: true, plan: true, name: true },
    });
    if (!tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

    const plan = await db.plan.findUnique({ where: { slug: tenant.plan } });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: `Tenant's plan "${tenant.plan}" is not defined in the Plan table` },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const periodStart = body.periodStart ? new Date(body.periodStart) : new Date();
    const periodEnd = body.periodEnd ? new Date(body.periodEnd) : new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

    const invoice = await db.invoice.create({
      data: {
        tenantId: params.tenantId,
        planSlug: plan.slug,
        amountCents: plan.priceMonthly,
        currency: plan.currency,
        status: "pending",
        periodStart,
        periodEnd,
        notes: body.notes ?? `Manual invoice for ${tenant.name}`,
      },
    });

    logAudit({
      tenantId: params.tenantId,
      actorId: auth.userId,
      action: "CREATE",
      entityType: "Invoice",
      entityId: invoice.id,
      newValues: JSON.stringify({ planSlug: plan.slug, amountCents: plan.priceMonthly, periodStart, periodEnd }),
    });

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create invoice";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
