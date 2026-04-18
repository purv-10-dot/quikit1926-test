/**
 * SA-B.5 — Tenant health snapshot.
 *
 * Returns a single JSON blob the tenant detail page renders as a "how is
 * this customer doing" panel. Combines data from:
 *   - Membership / User  → member count, last login
 *   - SessionEvent       → active-user count in the last 7 days
 *   - KPI                → KPIs logged this week (proxy for engagement)
 *   - AppModuleFlag      → how many modules disabled
 *   - TenantAppAccess    → how many apps fully blocked
 *   - Invoice            → last invoice status
 *
 * None of this is speculative: it's data we already capture via SA-A.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { cacheOrCompute } from "@quikit/shared/redisCache";

const CACHE_TTL_SECONDS = 60;

async function computeTenantHealth(tenantId: string) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(now);
    startOfWeek.setUTCDate(now.getUTCDate() - now.getUTCDay());
    startOfWeek.setUTCHours(0, 0, 0, 0);

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, plan: true, status: true, createdAt: true },
    });
    if (!tenant) return null;

    const [
      memberCount,
      activeUserCount,
      lastLoginEvent,
      kpiCount,
      kpisLoggedThisWeek,
      disabledModuleCount,
      blockedAppCount,
      lastInvoice,
      apiCallCount7d,
      sessionsLast30d,
    ] = await Promise.all([
      db.membership.count({ where: { tenantId, status: "active" } }),
      // distinct userIds seen in SessionEvent in last 7 days
      db.sessionEvent.findMany({
        where: { tenantId, event: "login", createdAt: { gte: sevenDaysAgo } },
        select: { userId: true },
        distinct: ["userId"],
      }).then((rows) => rows.length),
      db.sessionEvent.findFirst({
        where: { tenantId, event: "login" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, userId: true },
      }),
      db.kPI.count({ where: { tenantId } }),
      db.kPIWeeklyValue.count({
        where: { kpi: { tenantId }, updatedAt: { gte: startOfWeek } },
      }),
      db.appModuleFlag.count({ where: { tenantId, enabled: false } }),
      db.tenantAppAccess.count({ where: { tenantId, enabled: false } }),
      db.invoice.findFirst({
        where: { tenantId },
        orderBy: { periodStart: "desc" },
        select: { status: true, amountCents: true, currency: true, periodStart: true, paidAt: true, failedAt: true },
      }),
      db.apiCall.count({ where: { tenantId, createdAt: { gte: sevenDaysAgo } } }),
      db.sessionEvent.count({ where: { tenantId, event: "login", createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    // Health score: a simple 0-100 roll-up for at-a-glance triage.
    // - 40 pts: has any session in last 7d
    // - 30 pts: > 0 KPIs logged this week
    // - 20 pts: last invoice paid
    // - 10 pts: < 3 modules disabled
    let healthScore = 0;
    if (activeUserCount > 0) healthScore += 40;
    if (kpisLoggedThisWeek > 0) healthScore += 30;
    if (lastInvoice?.status === "paid") healthScore += 20;
    if (disabledModuleCount < 3) healthScore += 10;

    return {
      tenant,
      healthScore,
      signals: {
        memberCount,
        activeUserCount7d: activeUserCount,
        kpiCount,
        kpisLoggedThisWeek,
        disabledModuleCount,
        blockedAppCount,
        apiCallCount7d,
        sessionsLast30d,
        lastLoginAt: lastLoginEvent?.createdAt?.toISOString() ?? null,
        lastLoginUserId: lastLoginEvent?.userId ?? null,
        lastInvoice: lastInvoice
          ? {
              status: lastInvoice.status,
              amountCents: lastInvoice.amountCents,
              amountDollars: (lastInvoice.amountCents / 100).toFixed(2),
              currency: lastInvoice.currency,
              periodStart: lastInvoice.periodStart.toISOString(),
              paidAt: lastInvoice.paidAt?.toISOString() ?? null,
              failedAt: lastInvoice.failedAt?.toISOString() ?? null,
            }
          : null,
      },
    };
}

export const GET = withSuperAdminAuth<{ tenantId: string }>(async (_auth, _req, { params }) => {
  try {
    const tenantId = params.tenantId;
    const cacheKey = `super:tenant-health:${tenantId}`;
    const data = await cacheOrCompute(cacheKey, CACHE_TTL_SECONDS, () => computeTenantHealth(tenantId));
    if (!data) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load tenant health";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
