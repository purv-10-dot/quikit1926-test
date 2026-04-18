/**
 * SA-Perf D-1 — Consolidated tenant detail endpoint.
 *
 * Returns org info + health + app-access + invoices + analytics in ONE
 * response so the tenant detail page fires 1 HTTP request instead of 6.
 * Saves ~5 roundtrips × ~100ms = ~500ms on a cold nav.
 *
 * The panels on /organizations/[id] can either:
 *   - Migrate to this endpoint (preferred), OR
 *   - Keep their per-panel endpoints for backwards compat.
 *
 * This endpoint is NOT cached server-side because it mixes per-tenant
 * state that changes on user actions (invoice status, app access).
 * Individual sub-queries already cache themselves where appropriate
 * (tenant-health is behind a 60s Redis cache; analytics uses rollups).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";

export const GET = withSuperAdminAuth<{ id: string }>(async (_auth, _req, { params }) => {
  try {
    const tenantId = params.id;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(now);
    startOfWeek.setUTCDate(now.getUTCDate() - now.getUTCDay());
    startOfWeek.setUTCHours(0, 0, 0, 0);

    // Preflight: verify tenant exists
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: { select: { users: true, teams: true, userAppAccess: true } },
        users: {
          take: 10,
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    }

    // Parallel: everything that can be fetched independently.
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
      apps,
      accessRows,
      invoicesRaw,
      // Analytics data
      sessionEvents,
      rollups,
      moduleFlags,
      appAccess,
    ] = await Promise.all([
      db.membership.count({ where: { tenantId, status: "active" } }),
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
      db.app.findMany({
        select: { id: true, slug: true, name: true, status: true, iconUrl: true },
        orderBy: { name: "asc" },
      }),
      db.tenantAppAccess.findMany({
        where: { tenantId },
        select: { appId: true, enabled: true, reason: true, updatedAt: true, updatedBy: true },
      }),
      db.invoice.findMany({
        where: { tenantId },
        orderBy: { periodStart: "desc" },
        take: 24,
      }),
      db.sessionEvent.findMany({
        where: { tenantId, event: "login", createdAt: { gte: thirtyDaysAgo } },
        select: { userId: true, createdAt: true },
      }),
      db.apiCallHourlyRollup.findMany({
        where: { tenantId, NOT: { tenantId: "_global_" }, hourBucket: { gte: thirtyDaysAgo } },
        select: {
          hourBucket: true,
          pathPattern: true,
          statusClass: true,
          callCount: true,
          errorCount: true,
          totalDurationMs: true,
          maxDurationMs: true,
        },
      }),
      db.appModuleFlag.findMany({
        where: { tenantId, enabled: false },
        include: { app: { select: { slug: true } } },
      }),
      db.tenantAppAccess.findMany({
        where: { tenantId, enabled: false },
        include: { app: { select: { slug: true, name: true } } },
      }),
    ]);

    // Health score
    let healthScore = 0;
    if (activeUserCount > 0) healthScore += 40;
    if (kpisLoggedThisWeek > 0) healthScore += 30;
    if (lastInvoice?.status === "paid") healthScore += 20;
    if (disabledModuleCount < 3) healthScore += 10;

    // App access matrix
    const accessMap = new Map(accessRows.map((r) => [r.appId, r]));
    const appAccessData = apps.map((app) => {
      const access = accessMap.get(app.id);
      return {
        appId: app.id,
        slug: app.slug,
        name: app.name,
        iconUrl: app.iconUrl,
        appStatus: app.status,
        enabled: access ? access.enabled : true,
        reason: access?.reason ?? null,
        updatedAt: access?.updatedAt?.toISOString() ?? null,
      };
    });

    // Invoice totals
    const totals = invoicesRaw.reduce(
      (acc, inv) => {
        acc.total += inv.amountCents;
        if (inv.status === "paid") acc.paid += inv.amountCents;
        else if (inv.status === "failed") acc.failed += inv.amountCents;
        else if (inv.status === "pending") acc.pending += inv.amountCents;
        return acc;
      },
      { total: 0, paid: 0, failed: 0, pending: 0 },
    );

    // DAU trend
    const dauMap = new Map<string, Set<string>>();
    for (const s of sessionEvents) {
      const day = s.createdAt.toISOString().slice(0, 10);
      if (!dauMap.has(day)) dauMap.set(day, new Set());
      dauMap.get(day)!.add(s.userId);
    }
    const dailyTrend = Array.from(dauMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, set]) => ({ date, activeUsers: set.size }));

    // Top endpoints
    const endpointMap = new Map<string, { calls: number; errors: number; durationMs: bigint }>();
    for (const r of rollups) {
      const cur = endpointMap.get(r.pathPattern) ?? { calls: 0, errors: 0, durationMs: BigInt(0) };
      cur.calls += r.callCount;
      cur.errors += r.errorCount;
      cur.durationMs += r.totalDurationMs;
      endpointMap.set(r.pathPattern, cur);
    }
    const topEndpoints = Array.from(endpointMap.entries())
      .sort((a, b) => b[1].calls - a[1].calls)
      .slice(0, 10)
      .map(([path, v]) => ({
        pathPattern: path,
        calls: v.calls,
        errors: v.errors,
        avgMs: v.calls > 0 ? Number(v.durationMs / BigInt(v.calls)) : 0,
      }));

    const totalCalls = rollups.reduce((s, r) => s + r.callCount, 0);
    const totalErrors = rollups.reduce((s, r) => s + r.errorCount, 0);
    const invoicesPaidCents = invoicesRaw.filter((i) => i.status === "paid").reduce((s, i) => s + i.amountCents, 0);
    const invoicesFailedCents = invoicesRaw.filter((i) => i.status === "failed").reduce((s, i) => s + i.amountCents, 0);
    const invoicesPendingCents = invoicesRaw.filter((i) => i.status === "pending").reduce((s, i) => s + i.amountCents, 0);

    return NextResponse.json({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          status: tenant.status,
          billingEmail: tenant.billingEmail,
          createdAt: tenant.createdAt,
          _count: tenant._count,
          users: tenant.users,
        },
        health: {
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
        },
        appAccess: { apps: appAccessData },
        invoices: {
          invoices: invoicesRaw.map((inv) => ({
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
        analytics: {
          windowDays: 30,
          dauTrend: dailyTrend,
          api: {
            totalCalls,
            totalErrors,
            errorRatePct: totalCalls > 0 ? Number(((totalErrors / totalCalls) * 100).toFixed(2)) : 0,
            topEndpoints,
          },
          gates: {
            blockedApps: appAccess.map((a) => ({ slug: a.app.slug, name: a.app.name, reason: a.reason })),
            disabledModules: moduleFlags.map((m) => ({ appSlug: m.app.slug, moduleKey: m.moduleKey })),
          },
          usage: { kpiCount },
          billing: {
            invoicesPaidDollars: (invoicesPaidCents / 100).toFixed(2),
            invoicesFailedDollars: (invoicesFailedCents / 100).toFixed(2),
            invoicesPendingDollars: (invoicesPendingCents / 100).toFixed(2),
            recentInvoices: invoicesRaw.slice(0, 12).map((i) => ({
              amountDollars: (i.amountCents / 100).toFixed(2),
              status: i.status,
              periodStart: i.periodStart.toISOString(),
            })),
          },
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load tenant full data";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
