"use client";

/**
 * SA-C.1 — Analytics dashboard.
 *
 * Surfaces platform health at a glance: uptime, API volume/errors, engagement
 * trends, revenue, and actionable alerts. Everything on this page is computed
 * from Phase A instrumentation — no fake data.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, AlertCircle, Info, TrendingUp, TrendingDown, Minus, RefreshCw, Users, Building2, Zap, DollarSign, CheckCircle2 } from "lucide-react";

interface OpenAlert {
  id: string;
  rule: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  link: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedAt: string | null;
}

interface Overview {
  tenantCount: number;
  activeTenantCount: number;
  userCount: number;
  appCount: number;
  uptime: { up: number; down: number; degraded: number; unknown: number };
  api: { calls7d: number; errors7d: number; errorRatePct: number };
  engagement: {
    dailyTrend: { date: string; activeUsers: number }[];
    mostActiveTenantIds: { tenantId: string; sessionCount: number }[];
    inactiveTenants: { id: string; name: string; createdAt: string }[];
  };
  revenue: {
    mrrCents: number;
    mrrDollars: string;
    prevMrrDollars: string;
    mrrDeltaPct: number | null;
    pendingCents: number;
    failedCents: number;
    narrative: string;
  };
  alerts: { severity: "info" | "warning" | "critical"; message: string }[];
}

const severityColor: Record<string, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-900",
  warning: "bg-amber-50 border-amber-200 text-amber-900",
  critical: "bg-red-50 border-red-300 text-red-900",
};
const severityIcon: Record<string, typeof Info> = {
  info: Info,
  warning: AlertCircle,
  critical: AlertTriangle,
};

export default function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [openAlerts, setOpenAlerts] = useState<OpenAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const [overviewRes, alertsRes] = await Promise.all([
        fetch("/api/super/analytics/overview", { credentials: "include" }),
        fetch("/api/super/alerts", { credentials: "include" }),
      ]);
      const overview = await overviewRes.json();
      const alerts = await alertsRes.json();
      if (overview.success) setData(overview.data);
      if (alerts.success) setOpenAlerts(alerts.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function acknowledge(id: string) {
    await fetch(`/api/super/alerts/${id}/acknowledge`, { method: "POST" });
    load();
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="p-8 text-gray-400">Loading analytics...</div>;
  }
  if (!data) {
    return <div className="p-8 text-red-600">Failed to load analytics</div>;
  }

  const upPct = data.appCount > 0 ? Math.round((data.uptime.up / data.appCount) * 100) : 0;
  const deltaIcon = data.revenue.mrrDeltaPct === null ? Minus : data.revenue.mrrDeltaPct > 0 ? TrendingUp : data.revenue.mrrDeltaPct < 0 ? TrendingDown : Minus;
  const DeltaIcon = deltaIcon;

  // Chart scaling for the DAU sparkline
  const maxActive = Math.max(1, ...data.engagement.dailyTrend.map((d) => d.activeUsers));

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Platform health and narrative summaries</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Narrative banner */}
      <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-indigo-50 to-white p-6">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
            <DollarSign className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider text-indigo-700 font-semibold">This month</p>
            <p className="text-lg font-medium text-gray-900 mt-1">{data.revenue.narrative}</p>
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
              <span>MRR: <strong>${data.revenue.mrrDollars}</strong></span>
              <span className="inline-flex items-center gap-1">
                <DeltaIcon className={`h-4 w-4 ${data.revenue.mrrDeltaPct === null ? "text-gray-400" : data.revenue.mrrDeltaPct > 0 ? "text-green-600" : data.revenue.mrrDeltaPct < 0 ? "text-red-600" : "text-gray-400"}`} />
                <span>
                  {data.revenue.mrrDeltaPct === null
                    ? "N/A"
                    : `${data.revenue.mrrDeltaPct > 0 ? "+" : ""}${data.revenue.mrrDeltaPct.toFixed(1)}%`}{" "}
                  vs last month (${data.revenue.prevMrrDollars})
                </span>
              </span>
              {data.revenue.failedCents > 0 && (
                <span className="text-amber-700">${(data.revenue.failedCents / 100).toFixed(2)} failed</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Live alerts from the alerts engine */}
      {openAlerts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Open alerts ({openAlerts.length})</h2>
          </div>
          <div className="space-y-2">
            {openAlerts.map((a) => {
              const Icon = severityIcon[a.severity];
              return (
                <div key={a.id} className={`flex items-start gap-3 border rounded-lg px-4 py-3 ${severityColor[a.severity]}`}>
                  <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{a.title}</p>
                      <span className="text-xs opacity-70 font-mono">{a.rule}</span>
                      {a.acknowledgedAt && <span className="text-xs opacity-70">(acknowledged)</span>}
                    </div>
                    <p className="text-xs opacity-90 mt-0.5">{a.message}</p>
                    <p className="text-xs opacity-60 mt-1">Last seen: {new Date(a.lastSeenAt).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {a.link && (
                      <Link href={a.link} className="text-xs underline hover:no-underline">
                        View
                      </Link>
                    )}
                    {!a.acknowledgedAt && (
                      <button
                        type="button"
                        onClick={() => acknowledge(a.id)}
                        className="inline-flex items-center gap-1 text-xs underline hover:no-underline"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Ack
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Simple derived alerts from overview (supplementary to engine) */}
      {data.alerts.length > 0 && openAlerts.length === 0 && (
        <div className="space-y-2">
          {data.alerts.map((a, i) => {
            const Icon = severityIcon[a.severity];
            return (
              <div key={i} className={`flex items-center gap-3 border rounded-lg px-4 py-2 ${severityColor[a.severity]}`}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium">{a.message}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Tenants" value={data.activeTenantCount} sub={`${data.tenantCount} total`} />
        <StatCard icon={Users} label="Users" value={data.userCount} />
        <StatCard icon={Zap} label="API calls (7d)" value={data.api.calls7d.toLocaleString()} sub={`${data.api.errorRatePct}% error rate`} />
        <StatCard icon={Activity} label="Uptime" value={`${upPct}%`} sub={`${data.uptime.up}/${data.appCount} apps up`} />
      </div>

      {/* DAU sparkline */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Active users — last 30 days</h2>
        {data.engagement.dailyTrend.length === 0 ? (
          <p className="text-sm text-gray-400">No login activity yet.</p>
        ) : (
          <div className="flex items-end gap-1 h-28">
            {data.engagement.dailyTrend.map((d) => {
              const height = Math.round((d.activeUsers / maxActive) * 100);
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full rounded-t bg-indigo-500 hover:bg-indigo-600" style={{ height: `${height}%`, minHeight: d.activeUsers > 0 ? "2px" : "0" }} />
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                    {d.date}: {d.activeUsers}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Two-col engagement */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Most active tenants (30d)</h2>
          {data.engagement.mostActiveTenantIds.length === 0 ? (
            <p className="text-sm text-gray-400">No tenant activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.engagement.mostActiveTenantIds.map((t) => (
                <li key={t.tenantId} className="flex items-center justify-between text-sm">
                  <Link href={`/organizations/${t.tenantId}`} className="text-indigo-600 hover:underline truncate">
                    {t.tenantId}
                  </Link>
                  <span className="text-gray-600 tabular-nums">{t.sessionCount} sessions</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Tenants never logged in</h2>
          {data.engagement.inactiveTenants.length === 0 ? (
            <p className="text-sm text-gray-400">All tenants have active sessions — good sign.</p>
          ) : (
            <ul className="space-y-2">
              {data.engagement.inactiveTenants.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <Link href={`/organizations/${t.id}`} className="text-indigo-600 hover:underline truncate">
                    {t.name}
                  </Link>
                  <span className="text-gray-500 text-xs">Since {new Date(t.createdAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Info; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
          <p className="text-xl font-semibold text-gray-900 tabular-nums">{value}</p>
        </div>
      </div>
      {sub && <p className="text-xs text-gray-500 mt-2">{sub}</p>}
    </div>
  );
}
