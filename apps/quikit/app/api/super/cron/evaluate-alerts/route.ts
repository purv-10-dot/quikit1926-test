/**
 * SA-C.3 — Alerts engine cron.
 *
 * Runs every 15 minutes. Evaluates a fixed set of rules against recent data;
 * each rule either raises, refreshes (updates lastSeenAt), or resolves a
 * PlatformAlert row.
 *
 * Rules implemented:
 *   - app_down        — one alert per app that's currently "down"
 *   - api_error_spike — when error rate > 5% over last 1 hour per app
 *   - payment_failed  — one alert per tenant with a failed invoice in current period
 *   - tenant_inactive — tenants with no login in last 30 days
 *
 * Design:
 *   - Alerts dedupe by (rule, subjectKey) — subjectKey = appId, tenantId, etc.
 *   - When the condition is still true, we update lastSeenAt.
 *   - When the condition is false (app is back up, invoice now paid, etc.),
 *     we set resolvedAt on any matching open alert.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireCron } from "@/lib/requireCron";

async function upsertAlert(args: {
  rule: string;
  subjectKey: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  link?: string;
  data?: Record<string, unknown>;
}): Promise<"created" | "refreshed"> {
  const existing = await db.platformAlert.findFirst({
    where: { rule: args.rule, subjectKey: args.subjectKey, resolvedAt: null },
    select: { id: true },
  });
  if (existing) {
    await db.platformAlert.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        severity: args.severity,
        title: args.title,
        message: args.message,
        link: args.link ?? null,
        data: args.data ? (args.data as never) : undefined,
      },
    });
    return "refreshed";
  }
  await db.platformAlert.create({
    data: {
      rule: args.rule,
      subjectKey: args.subjectKey,
      severity: args.severity,
      title: args.title,
      message: args.message,
      link: args.link ?? null,
      data: args.data ? (args.data as never) : undefined,
    },
  });
  return "created";
}

async function resolveStaleAlerts(rule: string, activeSubjectKeys: Set<string>): Promise<number> {
  // Any open alert for this rule whose subject is no longer in the active set
  // has self-resolved — mark it so.
  const openAlerts = await db.platformAlert.findMany({
    where: { rule, resolvedAt: null },
    select: { id: true, subjectKey: true },
  });
  const toResolve = openAlerts.filter((a) => !activeSubjectKeys.has(a.subjectKey));
  if (toResolve.length === 0) return 0;
  await db.platformAlert.updateMany({
    where: { id: { in: toResolve.map((a) => a.id) } },
    data: { resolvedAt: new Date() },
  });
  return toResolve.length;
}

export async function GET(req: NextRequest) {
  const blocked = requireCron(req);
  if (blocked) return blocked;

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const summary = {
    app_down: { created: 0, refreshed: 0, resolved: 0 },
    api_error_spike: { created: 0, refreshed: 0, resolved: 0 },
    payment_failed: { created: 0, refreshed: 0, resolved: 0 },
    tenant_inactive: { created: 0, refreshed: 0, resolved: 0 },
  };

  try {
    // ── Rule 1: app_down ────────────────────────────────────────────
    {
      const recentProbes = await db.appHealthCheck.findMany({
        where: { checkedAt: { gte: new Date(now.getTime() - 15 * 60 * 1000) } },
        orderBy: { checkedAt: "desc" },
        include: { app: { select: { id: true, name: true, slug: true } } },
      });
      const latestByApp = new Map<string, typeof recentProbes[number]>();
      for (const p of recentProbes) {
        if (!latestByApp.has(p.appId)) latestByApp.set(p.appId, p);
      }
      const down = [...latestByApp.values()].filter((p) => p.status === "down");
      const active = new Set<string>();
      for (const p of down) {
        active.add(p.appId);
        const outcome = await upsertAlert({
          rule: "app_down",
          subjectKey: p.appId,
          severity: "critical",
          title: `${p.app.name} is down`,
          message: `Last probe: HTTP ${p.statusCode ?? "n/a"}${p.error ? ` — ${p.error}` : ""}`,
          link: `/app-registry/${p.appId}`,
          data: { statusCode: p.statusCode, error: p.error, checkedAt: p.checkedAt.toISOString() },
        });
        summary.app_down[outcome] += 1;
      }
      summary.app_down.resolved += await resolveStaleAlerts("app_down", active);
    }

    // ── Rule 2: api_error_spike (per app over last hour) ────────────
    {
      const recentCalls = await db.apiCall.groupBy({
        by: ["appSlug"],
        where: { createdAt: { gte: oneHourAgo } },
        _count: { _all: true },
      });
      const appSlugs = recentCalls.map((r) => r.appSlug);
      const errorCounts = appSlugs.length
        ? await db.apiCall.groupBy({
            by: ["appSlug"],
            where: { createdAt: { gte: oneHourAgo }, appSlug: { in: appSlugs }, statusCode: { gte: 400 } },
            _count: { _all: true },
          })
        : [];
      const errorMap = new Map(errorCounts.map((e) => [e.appSlug, e._count._all]));
      const active = new Set<string>();
      for (const r of recentCalls) {
        const total = r._count._all;
        const errors = errorMap.get(r.appSlug) ?? 0;
        if (total < 20) continue; // not enough signal
        const rate = (errors / total) * 100;
        if (rate > 5) {
          active.add(r.appSlug);
          const outcome = await upsertAlert({
            rule: "api_error_spike",
            subjectKey: r.appSlug,
            severity: "warning",
            title: `API error rate elevated on ${r.appSlug}`,
            message: `${rate.toFixed(1)}% errors over last hour (${errors}/${total} requests)`,
            link: "/analytics",
            data: { appSlug: r.appSlug, rate, total, errors },
          });
          summary.api_error_spike[outcome] += 1;
        }
      }
      summary.api_error_spike.resolved += await resolveStaleAlerts("api_error_spike", active);
    }

    // ── Rule 3: payment_failed ──────────────────────────────────────
    {
      const failed = await db.invoice.findMany({
        where: { status: "failed", periodStart: { gte: startOfMonth } },
        include: { tenant: { select: { id: true, name: true } } },
      });
      const active = new Set<string>();
      for (const inv of failed) {
        active.add(inv.tenantId);
        const outcome = await upsertAlert({
          rule: "payment_failed",
          subjectKey: inv.tenantId,
          severity: "warning",
          title: `Payment failed: ${inv.tenant.name}`,
          message: `$${(inv.amountCents / 100).toFixed(2)} ${inv.currency} (${inv.planSlug})`,
          link: `/organizations/${inv.tenantId}`,
          data: { invoiceId: inv.id, amountCents: inv.amountCents },
        });
        summary.payment_failed[outcome] += 1;
      }
      summary.payment_failed.resolved += await resolveStaleAlerts("payment_failed", active);
    }

    // ── Rule 4: tenant_inactive ─────────────────────────────────────
    {
      const tenants = await db.tenant.findMany({
        where: { status: "active" },
        select: { id: true, name: true, createdAt: true },
      });
      // For each tenant, check latest SessionEvent login
      const active = new Set<string>();
      for (const t of tenants) {
        // Only flag if the tenant was created > 30 days ago (ignore brand-new orgs)
        if (t.createdAt > thirtyDaysAgo) continue;
        const lastLogin = await db.sessionEvent.findFirst({
          where: { tenantId: t.id, event: "login" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        if (!lastLogin || lastLogin.createdAt < thirtyDaysAgo) {
          active.add(t.id);
          const daysSince = lastLogin
            ? Math.floor((now.getTime() - lastLogin.createdAt.getTime()) / (24 * 60 * 60 * 1000))
            : Math.floor((now.getTime() - t.createdAt.getTime()) / (24 * 60 * 60 * 1000));
          const outcome = await upsertAlert({
            rule: "tenant_inactive",
            subjectKey: t.id,
            severity: "info",
            title: `${t.name} inactive`,
            message: lastLogin
              ? `No logins in ${daysSince} days`
              : `Tenant created ${daysSince} days ago with no logins yet`,
            link: `/organizations/${t.id}`,
            data: { daysSinceLastLogin: daysSince },
          });
          summary.tenant_inactive[outcome] += 1;
        }
      }
      summary.tenant_inactive.resolved += await resolveStaleAlerts("tenant_inactive", active);
    }

    return NextResponse.json({
      success: true,
      data: {
        evaluatedAt: now.toISOString(),
        summary,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Alert evaluation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
