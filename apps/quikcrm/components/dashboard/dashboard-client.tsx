"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardToolbar } from "./dashboard-toolbar";
import { DashboardHero } from "./dashboard-hero";
import { RoleKpiGrid } from "./role-kpi-grid";
import { MyWorkToday } from "./my-work-today";
import { RecentWinsWidget } from "./recent-wins-widget";
import { ActivityMixChart } from "./activity-mix-chart";
import { ActivitiesLine } from "./activities-line";
import { LeadsByStageBar } from "./leads-by-stage-bar";
import { OppsByStageBar } from "./opps-by-stage-bar";
import { FunnelChart } from "./funnel-chart";
import { AtRiskWidget } from "./at-risk-widget";
import { TeamPerformanceBlock } from "./team-performance-block";
import { PinnedReportsBand } from "./pinned-reports-band";
import { ChartCardSkeleton } from "./chart-card";
import {
  presetToRange,
  type RangePreset,
  type RangeValue,
} from "./date-range-picker";
import type { DashboardSummaryDto } from "@/lib/dashboard/types";

const REFRESH_MS = (() => {
  const raw = process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_MS;
  if (!raw) return 60_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
})();

function clientTz(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

async function fetchSummary(qs: string, tz: string): Promise<DashboardSummaryDto> {
  const res = await fetch(`/api/dashboard?${qs}`, {
    credentials: "include",
    headers: { "X-Client-TZ": tz },
  });
  if (!res.ok) throw new Error(`Dashboard load failed (${res.status})`);
  return res.json();
}

function detectPreset(value: RangeValue): RangePreset {
  for (const p of ["today", "7d", "30d", "month", "quarter"] as const) {
    const r = presetToRange(p);
    if (r.fromIso === value.fromIso && r.toIso === value.toIso) return p;
  }
  return "custom";
}

function rangeLabel(preset: RangePreset, value: RangeValue): string {
  switch (preset) {
    case "today":
      return "today";
    case "7d":
      return "last 7 days";
    case "30d":
      return "last 30 days";
    case "month":
      return "this month";
    case "quarter":
      return "this quarter";
    default:
      return `${value.fromIso.slice(0, 10)} → ${value.toIso.slice(0, 10)}`;
  }
}


export function DashboardClient({ userRole }: { userRole: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // ── Role-based section visibility ─────────────────────────────────────────
  // Marketing: no Revenue, Opportunities, Quotes, Sales Activities
  // Finance:   no Lead Activities, Sales Tasks, Campaign Metrics
  const isMarketing = userRole === "MarketingUser";
  const isFinance = userRole === "FinanceUser";
  const isSales = !isMarketing && !isFinance; // Admin, SalesManager, SalesUser

  // Hero shows pipeline/revenue → not relevant for Marketing
  // Finance sees revenue/pipeline in their own RoleKpiGrid cards
  const showHero = isSales;
  // MyWorkToday shows tasks/follow-ups → not relevant for Marketing or Finance
  const showMyWork = isSales;
  // RecentWins shows won deal revenue → Finance sees it; Marketing does not
  const showRecentWins = !isMarketing;
  // AtRisk shows stuck opps, overdue tasks → sales-only
  const showAtRisk = isSales;
  // Lead charts (LeadsByStageBar + FunnelChart) → not relevant for Finance
  const showLeadCharts = !isFinance;
  // Activity charts → sales-only (Marketing does not see sales activities; Finance does not see lead activities)
  const showActivityCharts = isSales;
  // Opps chart → Finance sees it; Marketing does not (no Opportunities for Marketing)
  const showOppsChart = !isMarketing;

  const tz = useMemo(() => clientTz(), []);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; SameSite=Lax`;
  }, [tz]);

  const fromQ = searchParams.get("from");
  const toQ = searchParams.get("to");
  const ownerIdQ = searchParams.get("ownerId") ?? "";

  const range: RangeValue = useMemo(() => {
    if (fromQ && toQ) return { fromIso: fromQ, toIso: toQ };
    return presetToRange("7d");
  }, [fromQ, toQ]);

  const preset: RangePreset = useMemo(() => detectPreset(range), [range]);

  const updateUrl = useCallback(
    (next: { range?: RangeValue; ownerId?: string }) => {
      const sp = new URLSearchParams(searchParams.toString());
      const r = next.range ?? range;
      sp.set("from", r.fromIso);
      sp.set("to", r.toIso);
      const nextOwner = next.ownerId !== undefined ? next.ownerId : ownerIdQ;
      if (nextOwner) sp.set("ownerId", nextOwner);
      else sp.delete("ownerId");
      router.replace(`/dashboard?${sp.toString()}`);
    },
    [searchParams, range, ownerIdQ, router],
  );

  useEffect(() => {
    if (!fromQ || !toQ) updateUrl({ range });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qs = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("from", range.fromIso);
    sp.set("to", range.toIso);
    if (ownerIdQ) sp.set("ownerId", ownerIdQ);
    return sp.toString();
  }, [range.fromIso, range.toIso, ownerIdQ]);

  const summaryQuery = useQuery<DashboardSummaryDto>({
    queryKey: ["dashboard", "summary", qs],
    queryFn: () => fetchSummary(qs, tz),
    staleTime: 30_000,
    refetchInterval: REFRESH_MS > 0 ? REFRESH_MS : false,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [queryClient]);

  const rangeDescription = rangeLabel(preset, range);
  const ownerLabel = ownerIdQ === "me" ? "My records" : ownerIdQ ? "Filtered owner" : null;

  const drillCtx = {
    fromIso: range.fromIso,
    toIso: range.toIso,
    ownerId: ownerIdQ || null,
  };

  const data = summaryQuery.data;
  const loading = summaryQuery.isLoading;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/80 to-white p-4 sm:p-6 dark:from-slate-950 dark:to-slate-900">
      <DashboardToolbar
        range={range}
        preset={preset}
        onRangeChange={(v) => updateUrl({ range: v })}
        ownerId={ownerIdQ}
        onOwnerIdChange={(v) => updateUrl({ ownerId: v })}
        onRefresh={refresh}
        refreshing={summaryQuery.isFetching}
      />

      {summaryQuery.isError ? (
        <div className="crm-card mb-4 p-4 text-sm text-rose-600">
          {(summaryQuery.error as Error)?.message ?? "Failed to load dashboard"}
        </div>
      ) : null}

      {showHero && !loading && data ? (
        <DashboardHero
          rangeDescription={rangeDescription}
          ownerLabel={ownerLabel}
          pipelineDisplay={data.pipelineValueDisplay}
          weightedDisplay={data.executive.weightedPipelineDisplay}
          wonDisplay={data.executive.wonRevenueDisplay}
          tasksDueToday={data.executive.tasksDueToday}
          followUpsToday={data.executive.followUpsDueToday}
        />
      ) : null}

      {/* Role-specific KPI grid — counts match module counts via same ACL */}
      <div className="mb-6">
        <RoleKpiGrid
          userRole={userRole}
          onNavigate={(path) => router.push(path)}
        />
      </div>

      {showMyWork ? (
        <div className="mb-6 grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            {loading || !data ? (
              <div className="crm-card h-48 animate-pulse bg-crm-panel" />
            ) : (
              <MyWorkToday
                tasksDueToday={data.executive.tasksDueToday}
                followUpsDueToday={data.executive.followUpsDueToday}
                tasks={data.executive.tasksDueTodayItems}
                followUps={data.executive.followUpItems}
              />
            )}
          </div>
          {showRecentWins ? (
            <div>
              {loading || !data ? (
                <div className="crm-card h-48 animate-pulse bg-crm-panel" />
              ) : (
                <RecentWinsWidget wins={data.executive.recentWins} rangeDescription={rangeDescription} />
              )}
            </div>
          ) : null}
        </div>
      ) : showRecentWins ? (
        <div className="mb-6">
          {loading || !data ? (
            <div className="crm-card h-24 animate-pulse bg-crm-panel" />
          ) : (
            <RecentWinsWidget wins={data.executive.recentWins} rangeDescription={rangeDescription} />
          )}
        </div>
      ) : null}

      {showAtRisk ? (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-crm-text">Needs attention</h2>
          <AtRiskWidget qs={qs} ownerId={ownerIdQ || null} />
        </section>
      ) : null}

      {showLeadCharts ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {loading || !data ? (
            <>
              <ChartCardSkeleton title="Leads by stage" />
              <ChartCardSkeleton title="Lead funnel" height={300} />
            </>
          ) : (
            <>
              <LeadsByStageBar data={data.leadsByStage} drill={drillCtx} />
              <FunnelChart qs={qs} drill={drillCtx} />
            </>
          )}
        </div>
      ) : null}

      {showActivityCharts ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {loading || !data ? (
            <>
              <ChartCardSkeleton title="Activity mix" height={220} />
              <ChartCardSkeleton title="Activities per day" height={260} />
            </>
          ) : (
            <>
              <ActivityMixChart mix={data.executive.activityMix} rangeDescription={rangeDescription} />
              <ActivitiesLine
                data={data.activitiesLast7Days}
                ownerId={ownerIdQ || null}
                rangeDescription={rangeDescription}
              />
            </>
          )}
        </div>
      ) : null}

      {showOppsChart ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {loading || !data ? (
            <ChartCardSkeleton title="Open deals by stage" height={260} />
          ) : (
            <OppsByStageBar data={data.opportunitiesByStage} drill={drillCtx} />
          )}
          {isSales && data?.teamDashboard ? (
            <TeamPerformanceBlock team={data.teamDashboard} rangeLabel={rangeDescription} />
          ) : isSales ? (
            <div className="crm-card flex items-center justify-center p-8 text-sm text-crm-muted">
              Team metrics appear for managers with direct reports.
            </div>
          ) : null}
        </div>
      ) : null}

      <PinnedReportsBand />
    </div>
  );
}
